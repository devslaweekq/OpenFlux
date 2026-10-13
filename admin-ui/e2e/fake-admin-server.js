// admin-ui/e2e/fake-admin-server.js
const path = require('path');
const { createApp } = require('../server/src/createApp');

function fakeDockerClient() {
    const containers = {};
    return {
        imageName: () => 'openflux-exit:local',
        async containerStatus(name) {
            return containers[name] ? containers[name].status : 'missing';
        },
        async removeContainer(name) {
            delete containers[name];
        },
        async stopContainer(name) {
            if (containers[name]) containers[name].status = 'exited';
        },
        async startContainer(name) {
            if (containers[name]) containers[name].status = 'running';
        },
        async runContainer({ containerName }) {
            containers[containerName] = { status: 'running' };
        },
        async bootstrapCupsonlineUrl() {
            return 'https://cups.online/public/fake-bootstrapped-rooms';
        },
        async streamLogs(containerName, onLine) {
            // 50ms (not real exit-node pace) so the e2e smoke test's log
            // assertion resolves fast instead of idling through most of a
            // 500ms cadence on every run -- this is a fake log source for
            // test speed, not a simulation of real log timing.
            const interval = setInterval(() => onLine(`[${new Date().toISOString()}] heartbeat for ${containerName}`), 50);
            return { destroy: () => clearInterval(interval) };
        },
    };
}

const server = createApp(fakeDockerClient(), path.join(__dirname, '..', 'web', 'dist'));
const port = process.env.E2E_PORT || 9028;
server.listen(port, () => console.log(`fake admin-ui listening on :${port}`));
