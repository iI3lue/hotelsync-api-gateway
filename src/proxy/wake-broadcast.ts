import { log } from "../logger.js";
import type { LogFields, LogLevel } from "../logger.js";

export type WakeTarget = {
  name: string;
  url: string;
};

export type WakeBroadcasterOptions = {
  targets: WakeTarget[];
  intervalMs: number;
  timeoutMs: number;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logFn?: (level: LogLevel, message: string, fields?: LogFields) => void;
};

export type WakeBroadcaster = {
  maybeWake: () => void;
};

/** `http://host:3001/v1` y `http://host/v1/simulator` → `http://host/health`. */
export function healthUrl(base: string): string {
  const url = new URL(base);
  url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/**
 * Despierta los servicios free de Render cuando llega tráfico.
 *
 * En free tier un servicio dormido tarda decenas de segundos en arrancar y el
 * edge de Render responde 502 mientras tanto. El primer request autenticado
 * que cruza el gateway dispara un `/health` a todos los servicios, sin
 * bloquear la respuesta. La ventana `intervalMs` evita ráfagas: si ya se
 * despertó hace menos, no se repite.
 */
export function createWakeBroadcaster(
  options: WakeBroadcasterOptions
): WakeBroadcaster {
  const {
    targets,
    intervalMs,
    timeoutMs,
    enabled = true,
    fetchImpl = fetch,
    now = Date.now,
    logFn = log,
  } = options;

  let lastWakeAt: number | undefined;

  async function wakeAll(): Promise<void> {
    const startedAt = Date.now();
    const results = await Promise.allSettled(
      targets.map(async ({ url }) => {
        const response = await fetchImpl(url, {
          method: "GET",
          signal: AbortSignal.timeout(timeoutMs),
        });
        await response.body?.cancel();
        return response.ok;
      })
    );

    const failed = results.filter(
      (result) => result.status === "rejected" || result.value === false
    ).length;

    logFn(failed === 0 ? "info" : "warn", "wake.broadcast", {
      targets: targets.length,
      failed,
      duration_ms: Date.now() - startedAt,
    });
  }

  function maybeWake(): void {
    if (!enabled) return;
    const at = now();
    if (lastWakeAt !== undefined && at - lastWakeAt < intervalMs) return;
    lastWakeAt = at;
    void wakeAll();
  }

  return { maybeWake };
}
