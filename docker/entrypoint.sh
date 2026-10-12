#!/bin/sh
# Maps environment variables to openflux flags and, for an l3 exit node,
# installs the kernel-RST-drop rule *inside this container's netns*.
#
# Why the rule (l3 only): l3's TCP connections live in a userspace (gVisor)
# stack, so the kernel has no socket for them and answers every inbound
# SYN-ACK with an RST, tearing the tunnel down. Confining the DROP to the
# container netns is the scoped variant of upstream's host-wide rule — it
# cannot affect the host or other containers. l3 is the default here
# (needs CAP_NET_RAW/CAP_NET_ADMIN, see docker-compose.yml/openflux-ctl);
# set MODE=l4 for the unprivileged, no-raw-sockets backend instead.
set -eu

role="${ROLE:-client}"
transport="${TRANSPORT:-yandex}"
listen="${SOCKS5_LISTEN:-:1080}"
mode="${MODE:-l3}"

case "$role" in
  client|exit-node) ;;
  *)
    echo "ROLE must be 'client' or 'exit-node' (got '$role')" >&2
    exit 2
    ;;
esac

case "$transport" in
  yandex|vyandex|oneme|cupsonline|mailru|telemost) ;;
  *)
    echo "TRANSPORT must be one of yandex, vyandex, oneme, cupsonline, mailru, telemost (got '$transport')" >&2
    exit 2
    ;;
esac

case "$mode" in
  l3|l4) ;;
  *)
    echo "MODE must be 'l3' or 'l4' (got '$mode')" >&2
    exit 2
    ;;
esac

# openflux's own --role values are client|exit (--exit-node is a deprecated
# alias that logs a warning on every start and may be removed upstream).
if [ "$role" = exit-node ]; then
  set -- --role exit --transport "$transport" --mode "$mode"
else
  set -- --role client --transport "$transport"
fi

if [ "$role" = client ]; then
  set -- "$@" --socks5 "$listen"
fi

if [ -n "${URL:-}" ]; then
  set -- "$@" --url "$URL"
fi
if [ -n "${MAX_TOKEN:-}" ]; then
  set -- "$@" --maxToken "$MAX_TOKEN"
fi
if [ -n "${MAX_UID:-}" ]; then
  set -- "$@" --maxUid "$MAX_UID"
fi
if [ -n "${LOCAL_IP:-}" ]; then
  # Optional: pin the egress IP (alias IP) so the RST drop could be scoped
  # with `-s <ip>` too; inside a dedicated container netns it's usually
  # unnecessary.
  set -- "$@" --local-ip "$LOCAL_IP"
fi
if [ -n "${ENCRYPTION_KEY:-}" ]; then
  # The secret itself only ever lives in this env var and this file, both
  # inside the container's own filesystem/namespace; never logged (the exec
  # line below logs the --encryption-key-file *path*, not its content).
  key_file="/tmp/openflux-encryption-key"
  (umask 077 && printf '%s' "$ENCRYPTION_KEY" > "$key_file")
  set -- "$@" --encryption-key-file "$key_file"
fi
case "${DEBUG:-0}" in
  0) ;;
  1|true|yes) set -- "$@" --debug=1 ;;
  2|3) set -- "$@" --debug="$DEBUG" ;;
  *)
    echo "DEBUG must be 0, 1, 2, or 3 (got '$DEBUG')" >&2
    exit 2
    ;;
esac

if [ "$role" = exit-node ] && [ "$mode" = l3 ]; then
  echo "[entrypoint] dropping outbound TCP RSTs inside the container netns"
  if ! iptables -A OUTPUT -p tcp --tcp-flags RST RST -j DROP; then
    echo "[entrypoint] WARNING: iptables failed (missing NET_ADMIN?); kernel RSTs will kill tunnel connections" >&2
  fi
fi

echo "[entrypoint] exec: openflux $*"
exec openflux "$@"
