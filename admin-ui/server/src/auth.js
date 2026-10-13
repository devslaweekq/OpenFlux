// admin-ui/server/src/auth.js
const crypto = require("crypto");

const COOKIE_NAME = "admin_ui_session";
const SESSION_MS = 1000 * 60 * 60 * 12;

function secret() {
  return (
    process.env.ADMIN_UI_SESSION_SECRET ||
    process.env.ADMIN_UI_PASSWORD ||
    "dev-secret"
  );
}

function sign(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret())
    .update(b64)
    .digest("base64url");
  return `${b64}.${sig}`;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verify(token) {
  if (!process.env.ADMIN_UI_PASSWORD) return null;
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expected = crypto
    .createHmac("sha256", secret())
    .update(b64)
    .digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (typeof payload.exp === "number" && Date.now() > payload.exp)
      return null;
    return payload;
  } catch {
    return null;
  }
}

function login(req, res) {
  const { user, password } = req.body || {};
  const expectedPassword = process.env.ADMIN_UI_PASSWORD;
  if (!expectedPassword) {
    res.status(500).json({ error: "ADMIN_UI_PASSWORD not configured" });
    return;
  }
  const expectedUser = process.env.ADMIN_UI_USER || "admin";
  if (user !== expectedUser || !safeEqual(password || "", expectedPassword)) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  const token = sign({ u: user, exp: Date.now() + SESSION_MS });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.ADMIN_UI_SECURE_COOKIE === "true",
    maxAge: SESSION_MS,
  });
  res.json({ ok: true });
}

function logout(req, res) {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const payload = verify(token);
  if (!payload) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.user = payload.u;
  next();
}

module.exports = { COOKIE_NAME, sign, verify, login, logout, requireAuth };
