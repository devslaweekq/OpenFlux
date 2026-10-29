// admin-ui/server/src/routes/clients.js
const express = require('express');
const state = require('../state');

// captureAndStoreLink reads the container's "openflux://..." --share line
// and persists it. A failure here (timeout, old dockerClient double without
// the method, anything) never fails the caller's request -- the client was
// already created/edited/rekeyed successfully; the link is a convenience on
// top, and the UI falls back to the raw key when it's missing.
async function captureAndStoreLink(dockerClient, name, containerName) {
    try {
        const link = await dockerClient.captureShareLink(containerName);
        if (link) state.writeLinkFile(name, link);
        return link || null;
    } catch {
        return null;
    }
}

function createClientsRouter(dockerClient) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const clients = state.readClients();
        try {
            const withStatus = await Promise.all(
                clients.map(async (c) => ({
                    name: c.name,
                    transport: c.transport,
                    container: c.container,
                    created: c.created,
                    mode: c.mode,
                    status: await dockerClient.containerStatus(c.container),
                })),
            );
            res.json(withStatus);
        } catch (err) {
            res.status(500).json({ error: `failed to read container status: ${err.message}` });
        }
    });

    router.get('/:name/url', (req, res) => {
        const client = state.readClients().find((c) => c.name === req.params.name);
        if (!client) {
            res.status(404).json({ error: `client '${req.params.name}' not found` });
            return;
        }
        res.json({ url: client.url });
    });

    router.get('/:name/link', (req, res) => {
        const client = state.readClients().find((c) => c.name === req.params.name);
        if (!client) {
            res.status(404).json({ error: `client '${req.params.name}' not found` });
            return;
        }
        res.json({ link: state.readLinkFile(req.params.name) });
    });

    router.post('/', async (req, res) => {
        const { name, transport, mode = state.DEFAULT_MODE } = req.body || {};
        let { url } = req.body || {};
        if (!state.isValidName(name)) {
            res.status(400).json({
                error: `invalid client name '${name}' (allowed: letters, digits, '-', '_')`,
            });
            return;
        }
        if (!state.isValidTransport(transport)) {
            res.status(400).json({
                error: `unsupported transport '${transport}' (allowed: ${state.VALID_TRANSPORTS.join(', ')})`,
            });
            return;
        }
        if (!state.isValidMode(mode)) {
            res.status(400).json({
                error: `unsupported mode '${mode}' (allowed: ${state.VALID_MODES.join(', ')})`,
            });
            return;
        }
        // cupsonline is the one transport that doesn't need an externally-created
        // link: the exit node creates its own rooms, so url is optional for it.
        if (!url && transport !== 'cupsonline') {
            res.status(400).json({ error: 'url is required' });
            return;
        }
        if (state.clientExists(name)) {
            res.status(409).json({ error: `client '${name}' already exists` });
            return;
        }

        const containerName = `openflux-${name}`;
        let existingStatus;
        try {
            existingStatus = await dockerClient.containerStatus(containerName);
        } catch (err) {
            res.status(500).json({ error: `failed to check existing container: ${err.message}` });
            return;
        }
        if (existingStatus !== 'missing') {
            res.status(409).json({
                error: `a docker container named '${containerName}' already exists (state file may be out of sync)`,
            });
            return;
        }

        if (!url && transport === 'cupsonline') {
            try {
                url = await dockerClient.bootstrapCupsonlineUrl(`${containerName}-bootstrap-${Date.now()}`);
            } catch (err) {
                res.status(500).json({ error: `cupsonline room bootstrap failed: ${err.message}` });
                return;
            }
        }

        const key = state.generateKey();
        try {
            await dockerClient.runContainer({ containerName, transport, url, key, mode });
        } catch (err) {
            res.status(500).json({
                error: `failed to start container '${containerName}': ${err.message}`,
            });
            return;
        }

        state.writeKeyFile(name, key);
        const created = state.appendClient({
            name,
            transport,
            url,
            container: containerName,
            mode,
        });
        const link = await captureAndStoreLink(dockerClient, name, containerName);
        res.status(201).json({ name, transport, url, container: containerName, created, mode, key, link });
    });

    router.put('/:name', async (req, res) => {
        const name = req.params.name;
        const { transport, mode: requestedMode } = req.body || {};
        let { url } = req.body || {};
        const existing = state.readClients().find((c) => c.name === name);
        if (!existing) {
            res.status(404).json({ error: `client '${name}' not found` });
            return;
        }
        if (!state.isValidTransport(transport)) {
            res.status(400).json({
                error: `unsupported transport '${transport}' (allowed: ${state.VALID_TRANSPORTS.join(', ')})`,
            });
            return;
        }
        const mode = requestedMode || existing.mode || state.DEFAULT_MODE;
        if (!state.isValidMode(mode)) {
            res.status(400).json({
                error: `unsupported mode '${mode}' (allowed: ${state.VALID_MODES.join(', ')})`,
            });
            return;
        }
        // Leaving url blank for cupsonline keeps the existing rooms instead of
        // requiring a fresh bootstrap on every edit; any other transport still
        // needs url re-entered.
        if (!url && transport === 'cupsonline') {
            url = existing.url;
        }
        if (!url) {
            res.status(400).json({ error: 'url is required' });
            return;
        }

        const key = state.readKeyFile(name);
        try {
            await dockerClient.removeContainer(existing.container);
        } catch (err) {
            res.status(500).json({
                error: `failed to stop existing container '${existing.container}': ${err.message}`,
            });
            return;
        }
        try {
            await dockerClient.runContainer({
                containerName: existing.container,
                transport,
                url,
                key,
                mode,
            });
        } catch (err) {
            res.status(500).json({
                error: `failed to restart container '${existing.container}': ${err.message}`,
            });
            return;
        }
        state.replaceClientFields(name, { transport, url, mode });
        const link = await captureAndStoreLink(dockerClient, name, existing.container);
        res.json({
            name,
            transport,
            url,
            mode,
            container: existing.container,
            key: key || undefined,
            link,
        });
    });

    router.delete('/:name', async (req, res) => {
        const name = req.params.name;
        const existing = state.readClients().find((c) => c.name === name);
        if (!existing) {
            res.json({
                ok: true,
                warning: `client '${name}' not found, nothing to remove`,
            });
            return;
        }
        try {
            await dockerClient.removeContainer(existing.container);
        } catch (err) {
            res.status(500).json({
                error: `failed to remove container '${existing.container}': ${err.message}`,
            });
            return;
        }
        state.removeKeyFile(name);
        state.removeLinkFile(name);
        state.removeClient(name);
        res.json({ ok: true });
    });

    router.post('/:name/stop', async (req, res) => {
        const name = req.params.name;
        const existing = state.readClients().find((c) => c.name === name);
        if (!existing) {
            res.status(404).json({ error: `client '${name}' not found` });
            return;
        }
        try {
            await dockerClient.stopContainer(existing.container);
        } catch (err) {
            res.status(500).json({
                error: `failed to stop container '${existing.container}': ${err.message}`,
            });
            return;
        }
        res.json({ ok: true });
    });

    router.post('/:name/start', async (req, res) => {
        const name = req.params.name;
        const existing = state.readClients().find((c) => c.name === name);
        if (!existing) {
            res.status(404).json({ error: `client '${name}' not found` });
            return;
        }
        try {
            await dockerClient.startContainer(existing.container);
        } catch (err) {
            res.status(500).json({
                error: `failed to start container '${existing.container}': ${err.message}`,
            });
            return;
        }
        res.json({ ok: true });
    });

    router.post('/:name/rekey', async (req, res) => {
        const name = req.params.name;
        const existing = state.readClients().find((c) => c.name === name);
        if (!existing) {
            res.status(404).json({ error: `client '${name}' not found` });
            return;
        }

        const key = state.generateKey();
        try {
            await dockerClient.removeContainer(existing.container);
        } catch (err) {
            res.status(500).json({
                error: `failed to stop existing container '${existing.container}': ${err.message}`,
            });
            return;
        }
        try {
            await dockerClient.runContainer({
                containerName: existing.container,
                transport: existing.transport,
                url: existing.url,
                key,
                mode: existing.mode,
            });
        } catch (err) {
            res.status(500).json({
                error: `failed to restart container '${existing.container}': ${err.message}`,
            });
            return;
        }
        state.writeKeyFile(name, key);
        const link = await captureAndStoreLink(dockerClient, name, existing.container);
        res.json({ name, key, link });
    });

    return router;
}

module.exports = { createClientsRouter };
