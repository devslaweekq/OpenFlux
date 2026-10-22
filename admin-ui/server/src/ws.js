// admin-ui/server/src/ws.js
const { WebSocketServer } = require('ws');
const cookie = require('cookie');
const state = require('./state');
const { verify, COOKIE_NAME } = require('./auth');

function attachLogsWebSocket(server, dockerClient) {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        const match = req.url.match(/^\/api\/clients\/([a-zA-Z0-9_-]+)\/logs$/);
        if (!match) {
            socket.destroy();
            return;
        }

        const cookies = cookie.parse(req.headers.cookie || '');
        const payload = verify(cookies[COOKIE_NAME]);
        if (!payload) {
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            handleConnection(ws, match[1], dockerClient);
        });
    });
}

async function handleConnection(ws, name, dockerClient) {
    const client = state.readClients().find((c) => c.name === name);
    if (!client) {
        ws.send(JSON.stringify({ type: 'error', message: `client '${name}' not found` }));
        ws.close();
        return;
    }

    let closed = false;
    ws.on('close', () => {
        closed = true;
    });

    let stream;
    try {
        stream = await dockerClient.streamLogs(
            client.container,
            (line) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ type: 'line', line })),
            (err) => {
                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'error', message: err.message }));
                ws.close();
            },
        );
    } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        ws.close();
        return;
    }

    // If the client disconnected while streamLogs() was still resolving, the 'close'
    // listener above already fired and set `closed` before we could attach a listener
    // that destroys the stream. EventEmitter doesn't replay past events, so check the
    // flag explicitly and clean up immediately instead of leaking the log-tail stream.
    if (closed) {
        stream.destroy();
        return;
    }
    ws.on('close', () => stream.destroy());
}

module.exports = { attachLogsWebSocket };
