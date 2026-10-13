const test = require("node:test");
const assert = require("node:assert/strict");

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("sign/verify round-trips a payload", () => {
  withEnv({ ADMIN_UI_PASSWORD: "secretpass" }, () => {
    const auth = require("../src/auth");
    const token = auth.sign({ u: "admin", exp: Date.now() + 10000 });
    const payload = auth.verify(token);
    assert.equal(payload.u, "admin");
  });
});

test("verify rejects a tampered token", () => {
  withEnv({ ADMIN_UI_PASSWORD: "secretpass" }, () => {
    const auth = require("../src/auth");
    const token = auth.sign({ u: "admin", exp: Date.now() + 10000 });
    const [b64] = token.split(".");
    assert.equal(auth.verify(`${b64}.wrongsignature`), null);
  });
});

test("verify rejects an expired token", () => {
  withEnv({ ADMIN_UI_PASSWORD: "secretpass" }, () => {
    const auth = require("../src/auth");
    const token = auth.sign({ u: "admin", exp: Date.now() - 1000 });
    assert.equal(auth.verify(token), null);
  });
});

test("verify rejects missing/malformed tokens", () => {
  const auth = require("../src/auth");
  assert.equal(auth.verify(undefined), null);
  assert.equal(auth.verify(""), null);
  assert.equal(auth.verify("garbage"), null);
});

test("login rejects when ADMIN_UI_PASSWORD is not configured", () => {
  withEnv({ ADMIN_UI_PASSWORD: "" }, () => {
    delete process.env.ADMIN_UI_PASSWORD;
    const auth = require("../src/auth");
    let statusSeen, bodySeen;
    const req = { body: { user: "admin", password: "anything" } };
    const res = {
      status(code) {
        statusSeen = code;
        return this;
      },
      json(body) {
        bodySeen = body;
      },
      cookie() {},
    };
    auth.login(req, res);
    assert.equal(statusSeen, 500);
    assert.match(bodySeen.error, /not configured/);
  });
});

test("login rejects wrong credentials, accepts right ones and sets a cookie", () => {
  withEnv({ ADMIN_UI_USER: "admin", ADMIN_UI_PASSWORD: "correct" }, () => {
    const auth = require("../src/auth");
    let statusSeen = 200;
    let cookieSet = false;
    const res = {
      status(code) {
        statusSeen = code;
        return this;
      },
      json() {},
      cookie() {
        cookieSet = true;
      },
    };
    auth.login({ body: { user: "admin", password: "wrong" } }, res);
    assert.equal(statusSeen, 401);

    statusSeen = 200;
    auth.login({ body: { user: "admin", password: "correct" } }, res);
    assert.equal(statusSeen, 200);
    assert.equal(cookieSet, true);
  });
});

test("requireAuth passes through with a valid cookie, rejects without", () => {
  withEnv({ ADMIN_UI_PASSWORD: "secretpass" }, () => {
    const auth = require("../src/auth");
    const token = auth.sign({ u: "admin", exp: Date.now() + 10000 });

    let nextCalled = false;
    auth.requireAuth({ cookies: { admin_ui_session: token } }, {}, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);

    let statusSeen;
    const res = {
      status(code) {
        statusSeen = code;
        return this;
      },
      json() {},
    };
    auth.requireAuth({ cookies: {} }, res, () => {
      throw new Error("should not call next");
    });
    assert.equal(statusSeen, 401);
  });
});

test("verify rejects a correctly-signed token when ADMIN_UI_PASSWORD is not configured", () => {
  const crypto = require("node:crypto");
  withEnv({ ADMIN_UI_PASSWORD: "", ADMIN_UI_SESSION_SECRET: "" }, () => {
    const auth = require("../src/auth");
    const payload = { u: "admin", exp: Date.now() + 10000 };
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto
      .createHmac("sha256", "dev-secret")
      .update(b64)
      .digest("base64url");
    assert.equal(auth.verify(`${b64}.${sig}`), null);
  });
});

test("verify does not throw on a signature of a different length", () => {
  withEnv({ ADMIN_UI_PASSWORD: "secretpass" }, () => {
    const auth = require("../src/auth");
    const token = auth.sign({ u: "admin", exp: Date.now() + 10000 });
    const [b64] = token.split(".");
    assert.doesNotThrow(() => auth.verify(`${b64}.short`));
    assert.equal(auth.verify(`${b64}.short`), null);
  });
});

test("login sets the secure cookie flag only when ADMIN_UI_SECURE_COOKIE=true", () => {
  withEnv(
    {
      ADMIN_UI_USER: "admin",
      ADMIN_UI_PASSWORD: "correct",
      ADMIN_UI_SECURE_COOKIE: "",
    },
    () => {
      const auth = require("../src/auth");
      let cookieOpts;
      const res = {
        status() {
          return this;
        },
        json() {},
        cookie(name, value, opts) {
          cookieOpts = opts;
        },
      };
      auth.login({ body: { user: "admin", password: "correct" } }, res);
      assert.equal(cookieOpts.secure, false);

      process.env.ADMIN_UI_SECURE_COOKIE = "true";
      auth.login({ body: { user: "admin", password: "correct" } }, res);
      assert.equal(cookieOpts.secure, true);
    },
  );
});
