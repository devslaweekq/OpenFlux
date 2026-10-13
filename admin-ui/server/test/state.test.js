const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function withTempState(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-ui-state-'));
    const file = path.join(dir, 'clients.tsv');
    const prev = process.env.OPENFLUX_STATE_FILE;
    process.env.OPENFLUX_STATE_FILE = file;
    try {
        fn(file);
    } finally {
        if (prev === undefined) delete process.env.OPENFLUX_STATE_FILE;
        else process.env.OPENFLUX_STATE_FILE = prev;
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('ensureStateFile creates an empty 0600 file', () => {
    withTempState((file) => {
        const state = require('../src/state');
        state.ensureStateFile();
        assert.equal(fs.readFileSync(file, 'utf8'), '');
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    });
});

test('appendClient then readClients round-trips all 6 fields', () => {
    withTempState(() => {
        const state = require('../src/state');
        const created = state.appendClient({
            name: 'alice',
            transport: 'mailru',
            url: 'https://cloud.mail.ru/public/AAAA/1111',
            container: 'openflux-alice',
        });
        const rows = state.readClients();
        assert.equal(rows.length, 1);
        assert.deepEqual(rows[0], {
            name: 'alice',
            transport: 'mailru',
            url: 'https://cloud.mail.ru/public/AAAA/1111',
            container: 'openflux-alice',
            created,
            mode: 'l3',
        });
    });
});

test('appendClient with an explicit mode round-trips it', () => {
    withTempState(() => {
        const state = require('../src/state');
        state.appendClient({
            name: 'frank',
            transport: 'yandex',
            url: 'https://f',
            container: 'openflux-frank',
            mode: 'l4',
        });
        assert.equal(state.readClients()[0].mode, 'l4');
    });
});

test('readClients defaults mode to l3 for rows written before --mode existed', () => {
    withTempState((file) => {
        const state = require('../src/state');
        fs.writeFileSync(file, 'alice\tmailru\thttps://x\topenflux-alice\t2026-01-01T00:00:00Z\n');
        assert.equal(state.readClients()[0].mode, 'l3');
    });
});

test('readClients skips comment and blank lines, removeClient preserves them', () => {
    withTempState((file) => {
        const state = require('../src/state');
        fs.writeFileSync(
            file,
            '# a comment\n\nalice\tmailru\thttps://x\topenflux-alice\t2026-01-01T00:00:00Z\nbob\tyandex\thttps://y\topenflux-bob\t2026-01-02T00:00:00Z\n',
        );
        assert.equal(state.readClients().length, 2);
        state.removeClient('alice');
        const remaining = fs.readFileSync(file, 'utf8');
        assert.match(remaining, /^# a comment$/m);
        assert.equal(state.readClients().length, 1);
        assert.equal(state.readClients()[0].name, 'bob');
    });
});

test('replaceClientFields updates transport/url, keeps name/container/created', () => {
    withTempState(() => {
        const state = require('../src/state');
        const created = state.appendClient({
            name: 'carol',
            transport: 'yandex',
            url: 'https://old',
            container: 'openflux-carol',
        });
        state.replaceClientFields('carol', {
            transport: 'mailru',
            url: 'https://new',
        });
        const row = state.readClients()[0];
        assert.deepEqual(row, {
            name: 'carol',
            transport: 'mailru',
            url: 'https://new',
            container: 'openflux-carol',
            created,
            mode: 'l3',
        });
    });
});

test('key file round-trip: write, read, remove', () => {
    withTempState(() => {
        const state = require('../src/state');
        state.writeKeyFile('dave', 'deadbeef');
        assert.equal(state.readKeyFile('dave'), 'deadbeef');
        assert.equal(fs.statSync(state.keyFileFor('dave')).mode & 0o777, 0o600);
        state.removeKeyFile('dave');
        assert.equal(state.readKeyFile('dave'), null);
    });
});

test('generateKey returns a 64-char hex string, distinct each call', () => {
    const state = require('../src/state');
    const a = state.generateKey();
    const b = state.generateKey();
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
});

test('isValidName / isValidTransport enforce the CLI rules', () => {
    const state = require('../src/state');
    assert.equal(state.isValidName('alice-1_2'), true);
    assert.equal(state.isValidName('bad name!'), false);
    assert.equal(state.isValidName(''), false);
    assert.equal(state.isValidTransport('mailru'), true);
    assert.equal(state.isValidTransport('oneme'), false);
    assert.equal(state.isValidMode('l3'), true);
    assert.equal(state.isValidMode('l4'), true);
    assert.equal(state.isValidMode('l5'), false);
});

test('appendClient writes created in date -Iseconds format (local time, +HH:MM offset, no Z)', () => {
    withTempState((file) => {
        const state = require('../src/state');
        const created = state.appendClient({
            name: 'erin',
            transport: 'cupsonline',
            url: 'https://z',
            container: 'openflux-erin',
        });
        assert.match(created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
        assert.equal(state.readClients()[0].created, created);
        assert.match(fs.readFileSync(file, 'utf8').trimEnd(), /\t\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\tl3$/);
    });
});
