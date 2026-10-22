// admin-ui/server/src/index.js
const path = require('path');
const Docker = require('dockerode');
const { createDockerClient } = require('./docker');
const { createApp } = require('./createApp');

const dockerClient = createDockerClient(new Docker({ socketPath: '/var/run/docker.sock' }));
const staticDir = path.join(__dirname, '..', 'public');
const server = createApp(dockerClient, staticDir);

const port = process.env.ADMIN_UI_PORT || 9027;
server.listen(port, () => console.log(`admin-ui listening on :${port}`));

module.exports = { server };
