import { useEffect, useState } from "react";

const MAX_LINES = 2000;

export function reduceLogEvent(state, event) {
  if (event.type === "line") {
    const lines = [...state.lines, event.line];
    return {
      ...state,
      lines:
        lines.length > MAX_LINES
          ? lines.slice(lines.length - MAX_LINES)
          : lines,
    };
  }
  if (event.type === "error") {
    return { ...state, error: event.message };
  }
  return state;
}

export function useClientLogs(name) {
  const [state, setState] = useState({ lines: [], error: null });

  useEffect(() => {
    setState({ lines: [], error: null });
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${window.location.host}/api/clients/${name}/logs`,
    );
    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      setState((prev) => reduceLogEvent(prev, event));
    };
    return () => ws.close();
  }, [name]);

  return state;
}
