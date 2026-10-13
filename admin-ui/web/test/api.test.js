// admin-ui/web/test/api.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

test('login posts credentials and returns parsed JSON on success', async () => {
    global.fetch = async (url, opts) => {
        assert.equal(url, '/api/login');
        assert.equal(opts.method, 'POST');
        assert.deepEqual(JSON.parse(opts.body), {
            user: 'admin',
            password: 'secret',
        });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const { api } = await import('../src/api.js');
    const result = await api.login('admin', 'secret');
    assert.deepEqual(result, { ok: true });
});

test('a non-ok response throws an Error with the server message', async () => {
    global.fetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid credentials' }),
    });
    const { api } = await import('../src/api.js');
    await assert.rejects(() => api.login('admin', 'wrong'), /invalid credentials/);
});

test('listClients calls GET /api/clients', async () => {
    global.fetch = async (url, opts) => {
        assert.equal(url, '/api/clients');
        assert.equal(opts.method, undefined);
        return { ok: true, status: 200, json: async () => [{ name: 'alice' }] };
    };
    const { api } = await import('../src/api.js');
    const clients = await api.listClients();
    assert.deepEqual(clients, [{ name: 'alice' }]);
});

test('stopClient posts to /api/clients/:name/stop', async () => {
    global.fetch = async (url, opts) => {
        assert.equal(url, '/api/clients/alice/stop');
        assert.equal(opts.method, 'POST');
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const { api } = await import('../src/api.js');
    const result = await api.stopClient('alice');
    assert.deepEqual(result, { ok: true });
});

test('startClient posts to /api/clients/:name/start', async () => {
    global.fetch = async (url, opts) => {
        assert.equal(url, '/api/clients/alice/start');
        assert.equal(opts.method, 'POST');
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const { api } = await import('../src/api.js');
    const result = await api.startClient('alice');
    assert.deepEqual(result, { ok: true });
});
