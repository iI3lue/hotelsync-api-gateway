import {
  createWakeBroadcaster,
  healthUrl,
} from "../../src/proxy/wake-broadcast.js";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function okResponse() {
  return {
    ok: true,
    status: 200,
    body: { cancel: async () => undefined },
  };
}

function failResponse() {
  return {
    ok: false,
    status: 502,
    body: { cancel: async () => undefined },
  };
}

function targets(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    name: `svc-${index}`,
    url: `http://127.0.0.1:${3000 + index}/health`,
  }));
}

describe("healthUrl", () => {
  it("maps a /v1 base to /health", () => {
    expect(healthUrl("http://localhost:3001/v1")).toBe("http://localhost:3001/health");
  });

  it("maps a nested base to /health", () => {
    expect(healthUrl("https://hotelsync-channel-manager.onrender.com/v1/simulator")).toBe(
      "https://hotelsync-channel-manager.onrender.com/health"
    );
  });

  it("drops query and hash", () => {
    expect(healthUrl("http://localhost:3001/v1?x=1#y")).toBe(
      "http://localhost:3001/health"
    );
  });
});

describe("createWakeBroadcaster", () => {
  it("pings every target once and logs a summary", async () => {
    const calls: string[] = [];
    const logs: Array<{ level: string; message: string; fields?: Record<string, unknown> }> = [];
    const broadcaster = createWakeBroadcaster({
      targets: targets(3),
      intervalMs: 1_800_000,
      timeoutMs: 1_000,
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return okResponse();
      }) as unknown as typeof fetch,
      logFn: (level, message, fields) => logs.push({ level, message, fields }),
    });

    broadcaster.maybeWake();
    await flush();

    expect(calls).toEqual([
      "http://127.0.0.1:3000/health",
      "http://127.0.0.1:3001/health",
      "http://127.0.0.1:3002/health",
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: "info",
      message: "wake.broadcast",
      fields: { targets: 3, failed: 0 },
    });
  });

  it("does not repeat inside the interval window", async () => {
    let nowMs = 1_000;
    const calls: string[] = [];
    const broadcaster = createWakeBroadcaster({
      targets: targets(1),
      intervalMs: 1_800_000,
      timeoutMs: 1_000,
      now: () => nowMs,
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return okResponse();
      }) as unknown as typeof fetch,
      logFn: () => undefined,
    });

    broadcaster.maybeWake();
    await flush();
    nowMs += 1_799_999;
    broadcaster.maybeWake();
    await flush();

    expect(calls).toHaveLength(1);
  });

  it("fires again after the interval window", async () => {
    let nowMs = 1_000;
    const calls: string[] = [];
    const broadcaster = createWakeBroadcaster({
      targets: targets(1),
      intervalMs: 1_800_000,
      timeoutMs: 1_000,
      now: () => nowMs,
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return okResponse();
      }) as unknown as typeof fetch,
      logFn: () => undefined,
    });

    broadcaster.maybeWake();
    await flush();
    nowMs += 1_800_000;
    broadcaster.maybeWake();
    await flush();

    expect(calls).toHaveLength(2);
  });

  it("returns immediately instead of waiting for slow upstreams", async () => {
    let release: (() => void) | undefined;
    const logs: unknown[] = [];
    const broadcaster = createWakeBroadcaster({
      targets: targets(1),
      intervalMs: 1_800_000,
      timeoutMs: 1_000,
      fetchImpl: ((_url: string) =>
        new Promise((resolve) => {
          release = () => resolve(okResponse());
        })) as unknown as typeof fetch,
      logFn: (_level, message) => logs.push(message),
    });

    broadcaster.maybeWake();

    expect(logs).toHaveLength(0);

    release?.();
    await flush();

    expect(logs).toEqual(["wake.broadcast"]);
  });

  it("logs a warning when targets fail", async () => {
    const logs: Array<{ level: string; fields?: Record<string, unknown> }> = [];
    const broadcaster = createWakeBroadcaster({
      targets: targets(2),
      intervalMs: 1_800_000,
      timeoutMs: 1_000,
      fetchImpl: (async (url: string) => {
        if (url.includes(":3001")) throw new Error("ECONNRESET");
        return failResponse();
      }) as unknown as typeof fetch,
      logFn: (level, _message, fields) => logs.push({ level, fields }),
    });

    broadcaster.maybeWake();
    await flush();

    expect(logs[0]).toMatchObject({ level: "warn", fields: { targets: 2, failed: 2 } });
  });

  it("does nothing when disabled", async () => {
    const calls: string[] = [];
    const broadcaster = createWakeBroadcaster({
      targets: targets(2),
      intervalMs: 1_800_000,
      timeoutMs: 1_000,
      enabled: false,
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return okResponse();
      }) as unknown as typeof fetch,
      logFn: () => undefined,
    });

    broadcaster.maybeWake();
    await flush();

    expect(calls).toHaveLength(0);
  });
});
