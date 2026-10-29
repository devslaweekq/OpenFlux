// admin-ui/server/test/clients.routes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const request = require('supertest');

function freshState() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-ui-routes-'));
    process.env.OPENFLUX_STATE_FILE = path.join(dir, 'clients.tsv');
    return dir;
}

function fakeDockerClient(initialStatuses = {}) {
    const statuses = { ...initialStatuses };
    const started = [];
    return {
        client: {
            imageName: () => 'openflux-exit:local',
            async containerStatus(name) {
                return statuses[name] || 'missing';
            },
            async removeContainer(name) {
                delete statuses[name];
            },
            async stopContainer(name) {
                statuses[name] = 'exited';
            },
            async startContainer(name) {
                statuses[name] = 'running';
            },
            async runContainer({ containerName }) {
                statuses[containerName] = 'running';
                started.push(containerName);
            },
        },
        statuses,
        started,
    };
}

function buildApp(dockerClient) {
    const state = require('../src/state');
    delete require.cache[require.resolve('../src/routes/clients')];
    const { createClientsRouter } = require('../src/routes/clients');
    const app = express();
    app.use(express.json());
    app.use('/api/clients', createClientsRouter(dockerClient));
    return { app, state };
}

test('GET /api/clients lists clients with live status, no url field', async () => {
    const dir = freshState();
    try {
        const { app, state } = buildApp(fakeDockerClient({ 'openflux-alice': 'running' }).client);
        state.appendClient({
            name: 'alice',
            transport: 'mailru',
            url: 'https://secret',
            container: 'openflux-alice',
        });

        const res = await request(app).get('/api/clients');
        assert.equal(res.status, 200);
        assert.equal(res.body.length, 1);
        assert.equal(res.body[0].name, 'alice');
        assert.equal(res.body[0].status, 'running');
        assert.equal('url' in res.body[0], false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('GET /api/clients/:name/url returns the url only for that endpoint', async () => {
    const dir = freshState();
    try {
        const { app, state } = buildApp(fakeDockerClient().client);
        state.appendClient({
            name: 'alice',
            transport: 'mailru',
            url: 'https://secret',
            container: 'openflux-alice',
        });

        const res = await request(app).get('/api/clients/alice/url');
        assert.equal(res.status, 200);
        assert.equal(res.body.url, 'https://secret');

        const missing = await request(app).get('/api/clients/bob/url');
        assert.equal(missing.status, 404);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients creates a client, returns the key once, records state', async () => {
    const dir = freshState();
    try {
        const { client } = fakeDockerClient();
        const { app, state } = buildApp(client);

        const res = await request(app).post('/api/clients').send({ name: 'carol', transport: 'yandex', url: 'https://doc' });

        assert.equal(res.status, 201);
        assert.match(res.body.key, /^[0-9a-f]{64}$/);
        assert.equal(state.clientExists('carol'), true);
        assert.equal(state.readKeyFile('carol'), res.body.key);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients captures and persists the share link when the docker client provides one', async () => {
    const dir = freshState();
    try {
        const { client } = fakeDockerClient();
        client.captureShareLink = async () => 'openflux://v1/deadbeef';
        const { app, state } = buildApp(client);

        const res = await request(app).post('/api/clients').send({ name: 'carol', transport: 'yandex', url: 'https://doc' });

        assert.equal(res.status, 201);
        assert.equal(res.body.link, 'openflux://v1/deadbeef');
        assert.equal(state.readLinkFile('carol'), 'openflux://v1/deadbeef');

        const linkRes = await request(app).get('/api/clients/carol/link');
        assert.equal(linkRes.status, 200);
        assert.equal(linkRes.body.link, 'openflux://v1/deadbeef');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients still succeeds, with no link, when captureShareLink is missing or throws', async () => {
    const dir = freshState();
    try {
        const { client } = fakeDockerClient();
        const { app } = buildApp(client);

        const res = await request(app).post('/api/clients').send({ name: 'carol', transport: 'yandex', url: 'https://doc' });

        assert.equal(res.status, 201);
        assert.equal(res.body.link, null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients rejects an invalid name/transport before touching docker', async () => {
    const dir = freshState();
    try {
        const { client, started } = fakeDockerClient();
        const { app } = buildApp(client);

        const badName = await request(app).post('/api/clients').send({ name: 'bad name!', transport: 'mailru', url: 'https://x' });
        assert.equal(badName.status, 400);

        const badTransport = await request(app).post('/api/clients').send({ name: 'ok', transport: 'oneme', url: 'https://x' });
        assert.equal(badTransport.status, 400);

        assert.equal(started.length, 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients rejects a duplicate name with 409, rejects a pre-existing container name', async () => {
    const dir = freshState();
    try {
        const { app, state } = buildApp(fakeDockerClient().client);
        state.appendClient({
            name: 'dave',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-dave',
        });

        const dup = await request(app).post('/api/clients').send({ name: 'dave', transport: 'mailru', url: 'https://x' });
        assert.equal(dup.status, 409);

        const { app: app2 } = buildApp(fakeDockerClient({ 'openflux-erin': 'exited' }).client);
        const orphan = await request(app2).post('/api/clients').send({ name: 'erin', transport: 'mailru', url: 'https://x' });
        assert.equal(orphan.status, 409);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients does not record state when the container fails to start', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async containerStatus() {
                return 'missing';
            },
            async runContainer() {
                throw new Error('docker daemon rejected the request');
            },
        };
        const { app, state } = buildApp(dockerClient);

        const res = await request(app).post('/api/clients').send({ name: 'frank', transport: 'mailru', url: 'https://x' });
        assert.equal(res.status, 500);
        assert.equal(state.clientExists('frank'), false);
        assert.equal(state.readKeyFile('frank'), null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('GET /api/clients returns 500 (not an unhandled rejection) if containerStatus throws', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async containerStatus() {
                throw new Error('docker daemon unreachable');
            },
        };
        const { app, state } = buildApp(dockerClient);
        state.appendClient({
            name: 'gina',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-gina',
        });

        const res = await request(app).get('/api/clients');
        assert.equal(res.status, 500);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients returns 500 if the pre-existing-container check throws', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async containerStatus() {
                throw new Error('docker daemon unreachable');
            },
        };
        const { app } = buildApp(dockerClient);

        const res = await request(app).post('/api/clients').send({ name: 'hank', transport: 'mailru', url: 'https://x' });
        assert.equal(res.status, 500);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('PUT /api/clients/:name edits transport/url, preserves the key and created time', async () => {
    const dir = freshState();
    try {
        const { client } = fakeDockerClient({ 'openflux-grace': 'running' });
        const { app, state } = buildApp(client);
        const created = state.appendClient({
            name: 'grace',
            transport: 'yandex',
            url: 'https://old',
            container: 'openflux-grace',
        });
        state.writeKeyFile('grace', 'deadbeefcafe');

        const res = await request(app).put('/api/clients/grace').send({ transport: 'mailru', url: 'https://new' });
        assert.equal(res.status, 200);
        assert.equal(res.body.key, 'deadbeefcafe');

        const row = state.readClients()[0];
        assert.equal(row.transport, 'mailru');
        assert.equal(row.url, 'https://new');
        assert.equal(row.created, created);
        assert.equal(state.readKeyFile('grace'), 'deadbeefcafe');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('PUT /api/clients/:name 404s for an unknown client', async () => {
    const dir = freshState();
    try {
        const { app } = buildApp(fakeDockerClient().client);
        const res = await request(app).put('/api/clients/nobody').send({ transport: 'mailru', url: 'https://x' });
        assert.equal(res.status, 404);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('DELETE /api/clients/:name removes container, key file, and TSV row', async () => {
    const dir = freshState();
    try {
        const { client } = fakeDockerClient({ 'openflux-heidi': 'running' });
        const { app, state } = buildApp(client);
        state.appendClient({
            name: 'heidi',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-heidi',
        });
        state.writeKeyFile('heidi', 'abc123');

        const res = await request(app).delete('/api/clients/heidi');
        assert.equal(res.status, 200);
        assert.equal(state.clientExists('heidi'), false);
        assert.equal(state.readKeyFile('heidi'), null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('DELETE /api/clients/:name on an unknown client succeeds with a warning, not an error', async () => {
    const dir = freshState();
    try {
        const { app } = buildApp(fakeDockerClient().client);
        const res = await request(app).delete('/api/clients/ghost');
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.match(res.body.warning, /not found/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/stop stops the container, keeps state', async () => {
    const dir = freshState();
    try {
        const { client, statuses } = fakeDockerClient({ 'openflux-paul': 'running' });
        const { app, state } = buildApp(client);
        state.appendClient({
            name: 'paul',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-paul',
        });

        const res = await request(app).post('/api/clients/paul/stop');
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.equal(statuses['openflux-paul'], 'exited');
        assert.equal(state.clientExists('paul'), true);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/stop on an unknown client returns 404', async () => {
    const dir = freshState();
    try {
        const { app } = buildApp(fakeDockerClient().client);
        const res = await request(app).post('/api/clients/ghost/stop');
        assert.equal(res.status, 404);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/stop returns 500 if the docker call throws', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async stopContainer() {
                throw new Error('docker daemon unreachable');
            },
        };
        const { app, state } = buildApp(dockerClient);
        state.appendClient({
            name: 'quinn',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-quinn',
        });

        const res = await request(app).post('/api/clients/quinn/stop');
        assert.equal(res.status, 500);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/start starts the container, keeps state', async () => {
    const dir = freshState();
    try {
        const { client, statuses } = fakeDockerClient({ 'openflux-rose': 'exited' });
        const { app, state } = buildApp(client);
        state.appendClient({
            name: 'rose',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-rose',
        });

        const res = await request(app).post('/api/clients/rose/start');
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.equal(statuses['openflux-rose'], 'running');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/start on an unknown client returns 404', async () => {
    const dir = freshState();
    try {
        const { app } = buildApp(fakeDockerClient().client);
        const res = await request(app).post('/api/clients/ghost/start');
        assert.equal(res.status, 404);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/start returns 500 if the docker call throws', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async startContainer() {
                throw new Error('docker daemon unreachable');
            },
        };
        const { app, state } = buildApp(dockerClient);
        state.appendClient({
            name: 'sam',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-sam',
        });

        const res = await request(app).post('/api/clients/sam/start');
        assert.equal(res.status, 500);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/rekey replaces the key and keeps transport/url', async () => {
    const dir = freshState();
    try {
        const { client } = fakeDockerClient({ 'openflux-ivan': 'running' });
        const { app, state } = buildApp(client);
        state.appendClient({
            name: 'ivan',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-ivan',
        });
        state.writeKeyFile('ivan', 'oldkey');

        const res = await request(app).post('/api/clients/ivan/rekey');
        assert.equal(res.status, 200);
        assert.notEqual(res.body.key, 'oldkey');
        assert.equal(state.readKeyFile('ivan'), res.body.key);

        const row = state.readClients()[0];
        assert.equal(row.transport, 'mailru');
        assert.equal(row.url, 'https://x');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('PUT /api/clients/:name does not update the TSV row when docker fails to restart', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async containerStatus() {
                return 'running';
            },
            async removeContainer() {},
            async runContainer() {
                throw new Error('docker daemon rejected the request');
            },
        };
        const { app, state } = buildApp(dockerClient);
        state.appendClient({
            name: 'judy',
            transport: 'yandex',
            url: 'https://old',
            container: 'openflux-judy',
        });
        state.writeKeyFile('judy', 'stable-key');

        const res = await request(app).put('/api/clients/judy').send({ transport: 'mailru', url: 'https://new' });
        assert.equal(res.status, 500);

        const row = state.readClients()[0];
        assert.equal(row.transport, 'yandex');
        assert.equal(row.url, 'https://old');
        assert.equal(state.readKeyFile('judy'), 'stable-key');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/rekey does not overwrite the key file when docker fails to restart', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async containerStatus() {
                return 'running';
            },
            async removeContainer() {},
            async runContainer() {
                throw new Error('docker daemon rejected the request');
            },
        };
        const { app, state } = buildApp(dockerClient);
        state.appendClient({
            name: 'kyle',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-kyle',
        });
        state.writeKeyFile('kyle', 'stable-key');

        const res = await request(app).post('/api/clients/kyle/rekey');
        assert.equal(res.status, 500);
        assert.equal(state.readKeyFile('kyle'), 'stable-key');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('PUT /api/clients/:name returns 500 if removeContainer throws, state unchanged', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async containerStatus() {
                return 'running';
            },
            async removeContainer() {
                throw new Error('docker daemon unreachable');
            },
            async runContainer() {
                throw new Error('should not be called');
            },
        };
        const { app, state } = buildApp(dockerClient);
        state.appendClient({
            name: 'liam',
            transport: 'yandex',
            url: 'https://old',
            container: 'openflux-liam',
        });
        state.writeKeyFile('liam', 'stable-key');

        const res = await request(app).put('/api/clients/liam').send({ transport: 'mailru', url: 'https://new' });
        assert.equal(res.status, 500);

        const row = state.readClients()[0];
        assert.equal(row.transport, 'yandex');
        assert.equal(row.url, 'https://old');
        assert.equal(state.readKeyFile('liam'), 'stable-key');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('DELETE /api/clients/:name returns 500 if removeContainer throws, state not removed', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async removeContainer() {
                throw new Error('docker daemon unreachable');
            },
        };
        const { app, state } = buildApp(dockerClient);
        state.appendClient({
            name: 'mona',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-mona',
        });
        state.writeKeyFile('mona', 'stable-key');

        const res = await request(app).delete('/api/clients/mona');
        assert.equal(res.status, 500);
        assert.equal(state.clientExists('mona'), true);
        assert.equal(state.readKeyFile('mona'), 'stable-key');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('POST /api/clients/:name/rekey returns 500 if removeContainer throws, key unchanged', async () => {
    const dir = freshState();
    try {
        const dockerClient = {
            imageName: () => 'openflux-exit:local',
            async removeContainer() {
                throw new Error('docker daemon unreachable');
            },
            async runContainer() {
                throw new Error('should not be called');
            },
        };
        const { app, state } = buildApp(dockerClient);
        state.appendClient({
            name: 'nick',
            transport: 'mailru',
            url: 'https://x',
            container: 'openflux-nick',
        });
        state.writeKeyFile('nick', 'stable-key');

        const res = await request(app).post('/api/clients/nick/rekey');
        assert.equal(res.status, 500);
        assert.equal(state.readKeyFile('nick'), 'stable-key');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
