"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classifyLine, stripAnsi } from "@/lib/ansi";
import type { ConsoleAccess, ConsoleLine } from "@/server/providers/types";

const MAX_LINES = 500;
const MAX_BACKOFF_MS = 15_000;

export type SocketState = "connecting" | "live" | "unavailable";

async function fetchAccess(serverId: string): Promise<ConsoleAccess | null> {
  try {
    const response = await fetch(`/api/servers/${serverId}/console/token`, { cache: "no-store" });
    if (!response.ok) return null;
    return ((await response.json()) as { access: ConsoleAccess | null }).access;
  } catch {
    return null;
  }
}

function toLines(chunk: string): ConsoleLine[] {
  const ts = new Date().toISOString();
  return stripAnsi(chunk)
    .split(/\r?\n/)
    .filter((text) => text.trim().length > 0)
    .map((text) => ({ ts, level: classifyLine(text), text }));
}

/**
 * Live console over the node's (Wings) websocket. The browser connects to the
 * node directly with a short-lived token from our API. When the provider has
 * no socket (mock, suspended server) the state is "unavailable" and the caller
 * falls back to polling.
 */
export function useServerSocket(
  serverId: string,
  enabled: boolean,
  onStatus: (state: string) => void,
) {
  const [state, setState] = useState<SocketState>("connecting");
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const append = (chunk: string) =>
      setLines((previous) => [...previous, ...toLines(chunk)].slice(-MAX_LINES));

    async function connect() {
      const access = await fetchAccess(serverId);
      if (disposed) return;
      if (!access) {
        setState("unavailable");
        return;
      }

      const socket = new WebSocket(access.socketUrl);
      socketRef.current = socket;
      const send = (event: string, args: unknown[] = [null]) =>
        socket.send(JSON.stringify({ event, args }));

      socket.onopen = () => send("auth", [access.token]);

      socket.onmessage = async (message) => {
        let payload: { event?: string; args?: string[] };
        try {
          payload = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const arg = payload.args?.[0] ?? "";
        switch (payload.event) {
          case "auth success":
            failures = 0;
            setState("live");
            // Wings replays recent output; start clean to avoid duplicates on reconnect.
            setLines([]);
            send("send logs");
            break;
          case "console output":
          case "install output":
            append(arg);
            break;
          case "daemon message":
            append(`[Daemon] ${arg}`);
            break;
          case "status":
            onStatusRef.current(arg);
            break;
          case "token expiring": {
            const next = await fetchAccess(serverId);
            if (next && socket.readyState === WebSocket.OPEN) send("auth", [next.token]);
            break;
          }
          case "token expired":
          case "jwt error":
            socket.close();
            break;
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        setState("connecting");
        failures += 1;
        timer = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures, 4)));
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [serverId, enabled]);

  const sendCommand = useCallback(
    async (command: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event: "send command", args: [command] }));
        return true;
      }
      const response = await fetch(`/api/servers/${serverId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      return response.ok;
    },
    [serverId],
  );

  return { state: enabled ? state : ("unavailable" as const), lines, sendCommand };
}
