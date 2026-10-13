# openflux-ctl

A small Docker deployment CLI for VPS admins who want to run one isolated OpenFlux **exit node** per client. Each client gets its own Docker
container, bound to its own document/transport link. Client isolation is by design: the underlying transport channel is a single
point-to-point pipe, so one document can only ever serve one client — this tool exists to make "many clients" mean "many containers", not
"many clients fighting over one document."

`openflux-ctl` only manages exit nodes on your VPS. The actual OpenFlux **client** (SOCKS5 proxy / VPN) runs on each end user's own device —
you hand them a `transport` + `url` pair (see [`list`](#list)) and they run `openflux --role=client --transport=<t> --url=<url>` themselves.
See the [main README](../README.md) for client-side usage.

Not the only way to run multiple isolated nodes: the project also ships an official, non-Docker path for this —
[`deploy/node-install.sh`](../deploy/node-install.sh) installs each client as its own systemd service with a prioritized multi-transport
Session (see [docs/node-provisioning.md](../docs/node-provisioning.md)). Prefer `openflux-ctl` if you want Docker-level isolation and a
simple one-transport-per-client model; prefer `node-install.sh` if you want the maintainer's own tested path with failover between several
transports per client.

## Requirements

- A Linux VPS (Ubuntu/Debian recommended). Docker is installed automatically if it's missing — see the `install` command below.
- One document URL per client, created in advance by you (Yandex.Docs, Yandex Volga, Cups.online, or Mail.ru Docs — see
  [Transports](#transports)). **Share it with edit access, not view-only** — `mailru` in particular cannot carry any traffic over a
  view-only link (see [docs/transports.md](../docs/transports.md#mailru-docs-needs-an-editable-link)): it connects and authenticates fine,
  then every data/keep-alive write gets silently rejected and it just reconnects forever with no traffic ever passing. If a client doesn't
  come up, run `openflux-ctl logs <name>` and look for `Auth OK` immediately followed by repeated reconnects — that's the tell; there's no
  separate error line for it yet.

## One-line install (fresh VPS, no manual `git clone`)

On a brand-new Ubuntu/Debian box, this single command fetches the repo, installs Docker if it's not already there, builds the exit-node
image, and puts `openflux-ctl` on `PATH`:

```bash
curl -fsSL https://raw.githubusercontent.com/devslaweekq/OpenFlux/feature/multi-accounting/cli/bootstrap.sh | bash
```

It clones into `~/openflux` by default and symlinks `openflux-ctl` into `/usr/local/bin` (asks for `sudo` when not run as root). Override
with env vars if you need a different target, e.g. a different branch once this lands on `main`:

```bash
OPENFLUX_BRANCH=main OPENFLUX_INSTALL_DIR=/opt/openflux \
  curl -fsSL https://raw.githubusercontent.com/devslaweekq/OpenFlux/feature/multi-accounting/cli/bootstrap.sh | bash
```

Re-running the same command later updates the existing checkout (`git fetch` + hard reset to the branch) and rebuilds the image — safe to
use for upgrades too. After this, skip straight to `openflux-ctl add ...` below (no `./cli/` prefix or `cd` needed, since it's on `PATH`).

Prefer to review the script before piping it into a shell? Download it first: `curl -fsSL .../cli/bootstrap.sh -o bootstrap.sh`, read it,
then `bash bootstrap.sh`.

## Quick start (repo already cloned)

```bash
cd OpenFlux
./cli/openflux-ctl install               # installs Docker if missing, builds the exit-node image
./cli/openflux-ctl add alice --transport=mailru --url='https://cloud.mail.ru/public/AAAA/1111'
./cli/openflux-ctl list                  # see every client's transport + url + status
./cli/openflux-ctl logs alice            # follow a client's container logs (Ctrl-C to stop)
./cli/openflux-ctl remove alice          # stop and forget a client
```

## Commands

### `install [--import <file>]`

One-time (or re-run anytime to rebuild after pulling new code) setup:

1. Checks whether `docker` is on `PATH`. If not, installs it automatically via Docker's official convenience script
   (`curl -fsSL https://get.docker.com | sh`, via `sudo` when not already root) — no separate manual Docker install step needed. If that
   script fails, or `sudo` isn't available, you get an actionable error pointing at the manual install docs.
2. Confirms the Docker daemon is actually reachable (fails with a hint about the `docker` group / re-login if not — a fresh Docker install
   can require starting a new shell session before your user's group membership takes effect).
3. Builds the exit-node image (`openflux-exit:local` by default) from this repo's root `Dockerfile`.
4. If `--import <file>` is given, bulk-adds every client listed in that file (see [Bulk import](#bulk-import) below) right after the build.

### `add <name> --transport=<yandex|vyandex|cupsonline|mailru|telemost> [--url=<url>]`

Creates one new client: starts an isolated `openflux-<name>` container running the exit-node role against the given transport and document
URL. `<name>` may contain letters, digits, `-` and `_`. Fails if a client with that name already exists.

```bash
./cli/openflux-ctl add bob --transport=yandex --url='https://docs.yandex.ru/docs/view?url=...'
```

`--url` is required for every transport except `cupsonline`, which can create its own rooms: leave it out and `add` starts a throwaway
container, waits for it to print its room-list, removes it, then creates the real client with that room-list as its `--url` (same value
you'd otherwise pass by hand, and the same one printed back to you to give the client) — no document/link to create anywhere first.

```bash
./cli/openflux-ctl add carol --transport=cupsonline
```

### `remove <name>`

Stops and removes the client's container and deletes its record. Safe to run on a name that doesn't exist — it prints a warning and exits 0
rather than failing, so scripts calling `remove` don't need to check existence first.

### `stop <name>` / `start <name>`

Stop or (re)start a single client's container without touching its state-file record, keys, or settings — unlike `remove`, nothing is
forgotten, so `start` brings the exact same client back. Useful for pausing a client (maintenance, suspected abuse, debugging) without
losing its transport/URL/encryption key. `list` reflects the change immediately (`exited` after `stop`, `running` after `start`).

### `list`

Prints every client with its transport, live container status (`running`, `exited`, `missing`, ...), the document URL, and when it was
created — this is the table you read from to tell a client what `--transport` / `--url` to run on their own device:

```
NAME         TRANSPORT  STATUS     URL                                           CREATED
alice        mailru     running    https://cloud.mail.ru/public/AAAA/1111        2026-09-21T10:15:00+00:00
bob          yandex     running    https://docs.yandex.ru/docs/view?url=...      2026-09-21T10:16:12+00:00
```

### `logs <name>`

Follows (`docker logs -f`) the given client's container — useful for confirming a client actually connected (look for an auth-success line
for the transport in use) or diagnosing why one isn't.

### `upgrade [--no-build]`

Rebuilds the exit-node image (skipped with `--no-build`) and recreates every client container that is still running an older image, using
the settings from the state file. Containers already on the current image are left alone. Re-running the one-line bootstrap does this
automatically. Expect a brief reconnect for each recreated client.

## Admin UI

```bash
openflux-ctl admin-ui start   # build + start the web dashboard
openflux-ctl admin-ui stop    # stop it
```

`start` checks for `docker compose` (ships with modern Docker Engine installs), then runs the `admin-ui` profile from the repo's
`docker-compose.yml` (see [`admin-ui/`](../admin-ui/) for what it is). On the very first run it asks you to set a password for the dashboard
— leave the prompt empty to have it generate one instead — and saves it to `.env` at the repo root (`chmod 600`, gitignored) under
`ADMIN_UI_PASSWORD`, so later `start` calls never ask again. The login user is `admin` unless you set `ADMIN_UI_USER` in that same `.env`
file yourself. `stop` is a no-op (with a message, not an error) if the dashboard was never started.

The dashboard listens on `http://127.0.0.1:${ADMIN_UI_PORT:-9027}` by default — see `.env.example` for the full set of `ADMIN_UI_*`
variables, including `ADMIN_UI_SECURE_COOKIE` for when you front it with your own TLS-terminating reverse proxy.

## Bulk import

Point `install --import <file>` at a CSV file to provision many clients in one shot — handy for a first-time setup where you already have a
list of clients to bring online:

```
# lines starting with # and blank lines are ignored
alice,mailru,https://cloud.mail.ru/public/AAAA/1111
bob,yandex,https://docs.yandex.ru/docs/view?url=...
carol,cupsonline,https://cups.online/room/xyz
```

Each row is `name,transport,url` — no header row. A bad row (unknown transport, duplicate name, missing field, container that fails to
start) is reported and skipped rather than aborting the whole import, so one typo doesn't cost you the rest of the batch. `install --import`
exits non-zero if _any_ row failed, even though the good rows were still added — check the output for which ones need fixing, then re-run
`add` for just those.

You can also bulk-import later, outside of `install`, by reusing the same flag: `./cli/openflux-ctl install --import more-clients.csv` (this
rebuilds the image too, which is harmless but adds a few seconds).

## Transports

`add`/bulk-import support the five transports that authenticate via a plain document/room URL: `yandex`, `vyandex`, `cupsonline`, `mailru`,
`telemost` (Yandex Telemost — experimental upstream, see [docs/transports.md](../docs/transports.md)).

Not supported here: `oneme`/MAX (authenticates via a token + user id pair instead of a URL — doesn't fit this tool's per-client model) and
`boards`/`direct`/`script` (need structured parameters beyond a single URL, only available through the binary's `--transports=`/`--config`
Session mode). Run any of these directly with the `openflux` binary if you need them — see
[docs/cli-reference.md](../docs/cli-reference.md).

## Exit mode

Every client runs in `l3` mode by default (raw-socket forwarding — faster, single end-to-end TCP connection) — every container
`openflux-ctl` creates gets `--cap-add NET_RAW --cap-add NET_ADMIN` for this. `docker/entrypoint.sh` installs the kernel-RST-drop rule
automatically, scoped to that one container's network namespace. `l4` (unprivileged, works everywhere, no raw sockets) is available by
setting `MODE=l4` if you run a container directly (e.g. via `docker-compose.yml`), but `openflux-ctl`'s own `add`/`rekey`/`upgrade` don't
expose a per-client `--mode` switch yet — every client they manage runs `l3`.

## State and security

Client state lives in `cli/state/clients.tsv` (created automatically, `chmod 600`). **It contains every client's document URL — treat it as
a secret**, the same way you'd treat a password file: those URLs are the actual credential that lets a device connect through that client's
exit node. It's gitignored; never commit it. Back it up if you want to survive losing the VPS, but keep the backup as private as the file
itself.

## Environment variables

All optional — mainly useful for testing or running multiple independent `openflux-ctl` state directories on one host:

| Variable              | Default                 | Purpose                         |
| --------------------- | ----------------------- | ------------------------------- |
| `OPENFLUX_STATE_FILE` | `cli/state/clients.tsv` | Where client records are stored |
| `OPENFLUX_IMAGE`      | `openflux-exit:local`   | Docker image tag to build/run   |

## Testing

`cli/test-openflux-ctl.sh` is a self-contained test harness (stubs `docker`, no real containers touched) covering all of the above logic:

```bash
bash cli/test-openflux-ctl.sh
```
