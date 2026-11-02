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

/** El edge de Render responde esto mientras la instancia free arranca. */
const WAKING_STATUSES = new Set([502, 503, 504]);

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
 *
 * Un 502/503/504 del edge significa que el arranque ya se disparó, así que se
 * cuenta como `waking` y no como fallo: el wake-up ocurrió igual.
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

  async function probe(url: string): Promise<"ok" | "waking" | "failed"> {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    if (response.ok) return "ok";
    return WAKING_STATUSES.has(response.status) ? "waking" : "failed";
  }

  async function wakeAll(): Promise<void> {
    const startedAt = Date.now();
    const results = await Promise.allSettled(targets.map(({ url }) => probe(url)));

    let waking = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === "rejected") failed += 1;
      else if (result.value === "waking") waking += 1;
      else if (result.value === "failed") failed += 1;
    }

    logFn(failed === 0 ? "info" : "warn", "wake.broadcast", {
      targets: targets.length,
      waking,
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
