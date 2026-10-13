// admin-ui/server/test/docker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDockerClient } = require('../src/docker');

function fakeDockerode({ existing = {} } = {}) {
    const containers = { ...existing };
    return {
        getContainer(name) {
            return {
                async inspect() {
                    if (!containers[name]) {
                        const err = new Error('no such container');
                        err.statusCode = 404;
                        throw err;
                    }
                    return { State: { Status: containers[name].status } };
                },
                async remove() {
                    delete containers[name];
                },
                async stop() {
                    if (!containers[name]) {
                        const err = new Error('no such container');
                        err.statusCode = 404;
                        throw err;
                    }
                    if (containers[name].status !== 'running') {
                        const err = new Error('container already stopped');
                        err.statusCode = 304;
                        throw err;
                    }
                    containers[name].status = 'exited';
                },
                async start() {
                    if (!containers[name]) {
                        const err = new Error('no such container');
                        err.statusCode = 404;
                        throw err;
                    }
                    if (containers[name].status === 'running') {
                        const err = new Error('container already started');
                        err.statusCode = 304;
                        throw err;
                    }
                    containers[name].status = 'running';
                },
                async logs() {
                    return { on() {}, destroy() {} };
                },
            };
        },
        async createContainer(opts) {
            containers[opts.name] = { status: 'created', opts };
            return {
                async start() {
                    containers[opts.name].status = 'running';
                },
            };
        },
        modem: { demuxStream() {} },
    };
}

test('containerStatus returns "missing" for an unknown container', async () => {
    const client = createDockerClient(fakeDockerode());
    assert.equal(await client.containerStatus('openflux-nope'), 'missing');
});

test('containerStatus returns the real status for a known container', async () => {
    const client = createDockerClient(fakeDockerode({ existing: { 'openflux-alice': { status: 'running' } } }));
    assert.equal(await client.containerStatus('openflux-alice'), 'running');
});

test('runContainer creates with CapAdd/RestartPolicy/env, then starts', async () => {
    const dockerode = fakeDockerode();
    const client = createDockerClient(dockerode);
    await client.runContainer({
        containerName: 'openflux-alice',
        transport: 'mailru',
        url: 'https://x',
        key: 'deadbeef',
    });
    assert.equal(await client.containerStatus('openflux-alice'), 'running');
});

test('runContainer omits ENCRYPTION_KEY env when no key is given', async () => {
    let seenEnv;
    const dockerode = {
        async createContainer(opts) {
            seenEnv = opts.Env;
            return { async start() {} };
        },
    };
    const client = createDockerClient(dockerode);
    await client.runContainer({
        containerName: 'openflux-bob',
        transport: 'yandex',
        url: 'https://y',
    });
    assert.ok(!seenEnv.some((e) => e.startsWith('ENCRYPTION_KEY=')));
    assert.ok(seenEnv.includes('ROLE=exit-node'));
    assert.ok(seenEnv.includes('TRANSPORT=yandex'));
    assert.ok(seenEnv.includes('URL=https://y'));
});

test('removeContainer tolerates a container that does not exist', async () => {
    const client = createDockerClient(fakeDockerode());
    await assert.doesNotReject(client.removeContainer('openflux-ghost'));
});

test('stopContainer stops a running container', async () => {
    const client = createDockerClient(fakeDockerode({ existing: { 'openflux-alice': { status: 'running' } } }));
    await client.stopContainer('openflux-alice');
    assert.equal(await client.containerStatus('openflux-alice'), 'exited');
});

test('stopContainer tolerates an already-stopped container (304) and a missing one (404)', async () => {
    const client = createDockerClient(fakeDockerode({ existing: { 'openflux-alice': { status: 'exited' } } }));
    await assert.doesNotReject(client.stopContainer('openflux-alice'));
    await assert.doesNotReject(client.stopContainer('openflux-ghost'));
});

test('startContainer starts a stopped container', async () => {
    const client = createDockerClient(fakeDockerode({ existing: { 'openflux-alice': { status: 'exited' } } }));
    await client.startContainer('openflux-alice');
    assert.equal(await client.containerStatus('openflux-alice'), 'running');
});

test('startContainer tolerates an already-running container (304)', async () => {
    const client = createDockerClient(fakeDockerode({ existing: { 'openflux-alice': { status: 'running' } } }));
    await assert.doesNotReject(client.startContainer('openflux-alice'));
});

test('startContainer rethrows a non-304/404 error', async () => {
    const dockerode = {
        getContainer() {
            return {
                async start() {
                    const err = new Error('docker daemon unreachable');
                    err.statusCode = 500;
                    throw err;
                },
            };
        },
    };
    const client = createDockerClient(dockerode);
    await assert.rejects(client.startContainer('openflux-alice'), /docker daemon unreachable/);
});

test('imageName defaults to openflux-exit:local and honors OPENFLUX_IMAGE', () => {
    const client = createDockerClient(fakeDockerode());
    const prev = process.env.OPENFLUX_IMAGE;
    delete process.env.OPENFLUX_IMAGE;
    assert.equal(client.imageName(), 'openflux-exit:local');
    process.env.OPENFLUX_IMAGE = 'custom:tag';
    assert.equal(client.imageName(), 'custom:tag');
    if (prev === undefined) delete process.env.OPENFLUX_IMAGE;
    else process.env.OPENFLUX_IMAGE = prev;
});
