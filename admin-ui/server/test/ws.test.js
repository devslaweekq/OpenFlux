const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const WebSocket = require("ws");

function freshState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-ui-ws-"));
  process.env.OPENFLUX_STATE_FILE = path.join(dir, "clients.tsv");
  return dir;
}

function startServer(dockerClient) {
  const { attachLogsWebSocket } = require("../src/ws");
  const server = http.createServer((req, res) => res.end());
  attachLogsWebSocket(server, dockerClient);
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

test("rejects a log connection with no session cookie before touching docker", async () => {
  const dir = freshState();
  try {
    let streamCalled = false;
    const dockerClient = {
      async streamLogs() {
        streamCalled = true;
      },
    };
    const server = await startServer(dockerClient);
    const port = server.address().port;

    await new Promise((resolve) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/api/clients/anyone/logs`,
      );
      // Rejecting the upgrade means destroying the raw socket, which the ws client
      // surfaces as both an 'error' (ECONNRESET) and a 'close' event. The rejection
      // itself is asserted via the close code below; swallow the expected error so
      // it doesn't fail the test as an unhandled exception.
      ws.on("error", () => {});
      ws.on("close", (code) => {
        assert.notEqual(code, 1000);
        resolve();
      });
      ws.on("open", () => {
        throw new Error("should not open without a valid cookie");
      });
    });
    assert.equal(streamCalled, false);
    server.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("streams log lines for a known, authenticated client", async () => {
  process.env.ADMIN_UI_PASSWORD = "secretpass";
  const auth = require("../src/auth");
  const state = require("../src/state");
  const dir = freshState();
  try {
    state.appendClient({
      name: "jane",
      transport: "mailru",
      url: "https://x",
      container: "openflux-jane",
    });
    const dockerClient = {
      async streamLogs(containerName, onLine) {
        assert.equal(containerName, "openflux-jane");
        setImmediate(() => onLine("hello from the container"));
        return { destroy() {} };
      },
    };
    const server = await startServer(dockerClient);
    const port = server.address().port;
    const token = auth.sign({ u: "admin", exp: Date.now() + 10000 });

    const received = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/clients/jane/logs`, {
        headers: { Cookie: `admin_ui_session=${token}` },
      });
      ws.on("message", (data) => {
        resolve(JSON.parse(data.toString()));
        ws.close();
      });
      ws.on("error", reject);
    });
    assert.equal(received.type, "line");
    assert.equal(received.line, "hello from the container");
    server.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.ADMIN_UI_PASSWORD;
  }
});

test("destroys the log stream if the client disconnects while streamLogs is still resolving", async () => {
  process.env.ADMIN_UI_PASSWORD = "secretpass";
  const auth = require("../src/auth");
  const state = require("../src/state");
  const dir = freshState();
  try {
    state.appendClient({
      name: "oscar",
      transport: "mailru",
      url: "https://x",
      container: "openflux-oscar",
    });
    let destroyed = false;
    let resolveStreamLogs;
    const dockerClient = {
      async streamLogs() {
        await new Promise((resolve) => {
          resolveStreamLogs = resolve;
        });
        return {
          destroy: () => {
            destroyed = true;
          },
        };
      },
    };
    const server = await startServer(dockerClient);
    const port = server.address().port;
    const token = auth.sign({ u: "admin", exp: Date.now() + 10000 });

    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/clients/oscar/logs`, {
      headers: { Cookie: `admin_ui_session=${token}` },
    });

    await new Promise((resolve) => ws.on("open", resolve));
    ws.close();
    await new Promise((resolve) => ws.on("close", resolve));

    resolveStreamLogs();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(destroyed, true);
    server.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.ADMIN_UI_PASSWORD;
  }
});
