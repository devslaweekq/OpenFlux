const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: '.',
    webServer: {
        // OPENFLUX_STATE_FILE is pinned to a path inside this directory because the
        // real default (/state/clients.tsv) requires root/a mounted volume that
        // doesn't exist in this sandbox; in the real deployment this is irrelevant
        // since docker-compose always mounts /state.
        command:
            'ADMIN_UI_USER=admin ADMIN_UI_PASSWORD=testpass E2E_PORT=9028 OPENFLUX_STATE_FILE=./.e2e-state/clients.tsv node fake-admin-server.js',
        cwd: __dirname,
        port: 9028,
        // Reuse an already-running fake-admin-server across repeated local runs
        // (iterating on the test while developing shouldn't pay a fresh
        // start/stop every time) -- CI always gets a clean one.
        reuseExistingServer: !process.env.CI,
    },
    use: {
        baseURL: 'http://127.0.0.1:9028',
    },
});
