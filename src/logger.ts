export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export function log(level: LogLevel, message: string, fields: LogFields = {}): void {
  const line = `${JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  })}\n`;

  if (level === "error") process.stderr.write(line);
  else process.stdout.write(line);
}
