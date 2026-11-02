import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { TEST_SECRET, testConfig } from "../helpers/config.js";

jest.mock("../../src/logger.js", () => ({ log: jest.fn() }));

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let upstream: Server;
let upstreamUrl: string;
let receivedHeaders: Record<string, string | string[] | undefined> = {};
let upstreamCalls = 0;

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    upstreamCalls += 1;
    receivedHeaders = { ...req.headers };
    next();
  });
  app.all("/*", (_req, res) => res.json({ ok: true }));

  upstream = createServer(app);
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  upstreamUrl = `http://127.0.0.1:${port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

beforeEach(() => {
  upstreamCalls = 0;
  receivedHeaders = {};
});

function gateway() {
  return createApp(testConfig({ PROPERTY_SERVICE_URL: upstreamUrl }));
}

describe("gateway secret", () => {
  it("keeps /health public", async () => {
    const res = await request(gateway()).get("/health");

    expect(res.status).toBe(200);
  });

  it("rejects a proxied request without the secret and never reaches upstream", async () => {
    const res = await request(gateway()).get("/property/hotels");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized", statusCode: 401 });
    expect(res.headers["x-request-id"]).toMatch(UUID_V4);
    expect(upstreamCalls).toBe(0);
  });

  it("rejects a wrong secret", async () => {
    const res = await request(gateway())
      .get("/property/hotels")
      .set("x-gateway-secret", "wrong-secret-value-123456");

    expect(res.status).toBe(401);
    expect(upstreamCalls).toBe(0);
  });

  it("accepts the configured secret", async () => {
    const res = await request(gateway())
      .get("/property/hotels")
      .set("x-gateway-secret", TEST_SECRET);

    expect(res.status).toBe(200);
    expect(upstreamCalls).toBe(1);
  });
});

describe("header hardening", () => {
  async function forward(headers: Record<string, string>) {
    let req = request(gateway()).get("/property/hotels");
    for (const [name, value] of Object.entries(headers)) {
      req = req.set(name, value);
    }
    return req.set("x-gateway-secret", TEST_SECRET);
  }

  it("strips cookies and internal service keys", async () => {
    await forward({
      cookie: "hs_token=secret-jwt",
      "x-service-key": "internal-service-key",
      "x-loyalty-key": "loyalty-key",
      "x-provider-key": "provider-key",
      "x-internal-trace": "trace-value",
    });

    expect(receivedHeaders.cookie).toBeUndefined();
    expect(receivedHeaders["x-service-key"]).toBeUndefined();
    expect(receivedHeaders["x-loyalty-key"]).toBeUndefined();
    expect(receivedHeaders["x-provider-key"]).toBeUndefined();
    expect(receivedHeaders["x-internal-trace"]).toBeUndefined();
  });

  it("does not forward the gateway secret upstream", async () => {
    await forward({});

    expect(receivedHeaders["x-gateway-secret"]).toBeUndefined();
  });

  it("trusts x-client-ip only when the gateway secret authenticated the caller", async () => {
    await forward({ "x-client-ip": "203.0.113.9" });

    expect(receivedHeaders["x-client-ip"]).toBe("203.0.113.9");
  });

  it("falls back to the peer address when the caller sends no x-client-ip", async () => {
    await forward({});

    expect(receivedHeaders["x-client-ip"]).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
  });

  it("forwards Authorization unchanged", async () => {
    await forward({ authorization: "Bearer abc.def.ghi" });

    expect(receivedHeaders.authorization).toBe("Bearer abc.def.ghi");
  });
});
