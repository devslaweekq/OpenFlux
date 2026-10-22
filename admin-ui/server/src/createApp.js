// admin-ui/server/src/createApp.js
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const auth = require('./auth');
const { createClientsRouter } = require('./routes/clients');
const { attachLogsWebSocket } = require('./ws');

function createApp(dockerClient, staticDir) {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    app.post('/api/login', auth.login);
    app.post('/api/logout', auth.logout);
    app.use('/api/clients', auth.requireAuth, createClientsRouter(dockerClient));

    app.use(express.static(staticDir));
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) {
            res.status(404).json({ error: 'not found' });
            return;
        }
        res.sendFile(path.join(staticDir, 'index.html'));
    });

    const server = http.createServer(app);
    attachLogsWebSocket(server, dockerClient);
    return server;
}

module.exports = { createApp };
