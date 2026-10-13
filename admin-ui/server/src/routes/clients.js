// admin-ui/server/src/routes/clients.js
const express = require('express');
const state = require('../state');

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

    router.post('/', async (req, res) => {
        const { name, transport, url } = req.body || {};
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
        if (!url) {
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

        const key = state.generateKey();
        try {
            await dockerClient.runContainer({ containerName, transport, url, key });
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
        });
        res.status(201).json({ name, transport, url, container: containerName, created, key });
    });

    router.put('/:name', async (req, res) => {
        const name = req.params.name;
        const { transport, url } = req.body || {};
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
            });
        } catch (err) {
            res.status(500).json({
                error: `failed to restart container '${existing.container}': ${err.message}`,
            });
            return;
        }
        state.replaceClientFields(name, { transport, url });
        res.json({
            name,
            transport,
            url,
            container: existing.container,
            key: key || undefined,
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
            });
        } catch (err) {
            res.status(500).json({
                error: `failed to restart container '${existing.container}': ${err.message}`,
            });
            return;
        }
        state.writeKeyFile(name, key);
        res.json({ name, key });
    });

    return router;
}

module.exports = { createClientsRouter };
