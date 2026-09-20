// Matches CSI sequences (colours, cursor moves) and OSC sequences (window titles).
const ANSI_PATTERN = /\[[0-9;?]*[ -/]*[@-~]|\][^]*/g;

/** Removes terminal escape codes from a console line. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export type ConsoleLevel = "info" | "warn" | "error";

/** Best-effort severity of a raw server log line, used for colouring only. */
export function classifyLine(text: string): ConsoleLevel {
  if (/\b(ERROR|SEVERE|FATAL)\b/.test(text)) return "error";
  if (/\bWARN(ING)?\b/.test(text)) return "warn";
  return "info";
}
