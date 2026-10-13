// admin-ui/server/src/state.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VALID_TRANSPORTS = [
  "yandex",
  "vyandex",
  "cupsonline",
  "mailru",
  "telemost",
];

function stateFile() {
  return process.env.OPENFLUX_STATE_FILE || "/state/clients.tsv";
}

function keysDir() {
  return path.join(path.dirname(stateFile()), "keys");
}

function keyFileFor(name) {
  return path.join(keysDir(), `${name}.key`);
}

function ensureStateFile() {
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "", { mode: 0o600 });
  }
}

function readRawLines() {
  ensureStateFile();
  const content = fs.readFileSync(stateFile(), "utf8");
  if (content === "") return [];
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function writeRawLines(lines) {
  ensureStateFile();
  const content = lines.length ? lines.join("\n") + "\n" : "";
  fs.writeFileSync(stateFile(), content, { mode: 0o600 });
}

function isDataLine(line) {
  return line.trim() !== "" && !line.startsWith("#");
}

function parseRow(line) {
  const [name, transport, url, container, created] = line.split("\t");
  return { name, transport, url, container, created };
}

function readClients() {
  return readRawLines().filter(isDataLine).map(parseRow);
}

function clientExists(name) {
  return readClients().some((c) => c.name === name);
}

// Matches `date -Iseconds`: local time, second precision, signed +HH:MM offset.
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offM = pad(Math.abs(offsetMin) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${offH}:${offM}`;
}

function appendClient({ name, transport, url, container }) {
  ensureStateFile();
  const created = formatTimestamp();
  fs.appendFileSync(
    stateFile(),
    `${name}\t${transport}\t${url}\t${container}\t${created}\n`,
  );
  return created;
}

function removeClient(name) {
  const lines = readRawLines().filter(
    (line) => !isDataLine(line) || parseRow(line).name !== name,
  );
  writeRawLines(lines);
}

function replaceClientFields(name, fields) {
  const lines = readRawLines().map((line) => {
    if (!isDataLine(line)) return line;
    const row = parseRow(line);
    if (row.name !== name) return line;
    const updated = { ...row, ...fields };
    return `${updated.name}\t${updated.transport}\t${updated.url}\t${updated.container}\t${updated.created}`;
  });
  writeRawLines(lines);
}

function ensureKeysDir() {
  fs.mkdirSync(keysDir(), { recursive: true, mode: 0o700 });
}

function writeKeyFile(name, key) {
  ensureKeysDir();
  fs.writeFileSync(keyFileFor(name), key, { mode: 0o600 });
}

function readKeyFile(name) {
  try {
    return fs.readFileSync(keyFileFor(name), "utf8");
  } catch {
    return null;
  }
}

function removeKeyFile(name) {
  try {
    fs.unlinkSync(keyFileFor(name));
  } catch {
    // already gone
  }
}

function generateKey() {
  return crypto.randomBytes(32).toString("hex");
}

function isValidName(name) {
  return typeof name === "string" && /^[a-zA-Z0-9_-]+$/.test(name);
}

function isValidTransport(t) {
  return VALID_TRANSPORTS.includes(t);
}

module.exports = {
  VALID_TRANSPORTS,
  stateFile,
  keysDir,
  keyFileFor,
  ensureStateFile,
  readClients,
  clientExists,
  appendClient,
  removeClient,
  replaceClientFields,
  writeKeyFile,
  readKeyFile,
  removeKeyFile,
  generateKey,
  isValidName,
  isValidTransport,
};
