import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { TEST_SECRET, testConfig } from "../helpers/config.js";

jest.mock("../../src/logger.js", () => ({ log: jest.fn() }));

interface UpstreamCall {
  method: string;
  url: string;
  requestId: string | undefined;
}

let upstream: Server;
let upstreamUrl: string;
const calls: UpstreamCall[] = [];

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    calls.push({
      method: req.method,
      url: req.originalUrl,
      requestId: req.header("x-request-id"),
    });
    next();
  });

  app.get("/v1/hotels", (_req, res) => {
    res.status(200).json([{ hotel_id: "h1", name: "Hotel Sync Centro" }]);
  });
  app.post("/v1/hotels", (req, res) => {
    res.status(201).json({ method: req.method, body: req.body });
  });
  app.get("/v1/boom", (_req, res) => {
    res.status(500).json({ error: "boom" });
  });
  app.get("/v1/slow", (_req, res) => {
    setTimeout(() => res.json({ ok: true }), 1_000);
  });

  upstream = createServer(app);
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  upstreamUrl = `http://127.0.0.1:${port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

beforeEach(() => {
  calls.length = 0;
});

describe("property proxy", () => {
  it("GET /property/hotels matches the direct upstream response", async () => {
    const direct = await request(upstream).get("/v1/hotels");
    const throughGateway = await request(createApp(testConfig({ PROPERTY_SERVICE_URL: upstreamUrl })))
      .get("/property/hotels")
      .set("x-gateway-secret", TEST_SECRET);

    expect(throughGateway.status).toBe(direct.status);
    expect(throughGateway.body).toEqual(direct.body);
    expect(calls[0]).toMatchObject({ method: "GET", url: "/v1/hotels" });
  });

  it("propagates its own x-request-id and ignores the client one", async () => {
    const res = await request(createApp(testConfig({ PROPERTY_SERVICE_URL: upstreamUrl })))
      .get("/property/hotels")
      .set("x-gateway-secret", TEST_SECRET)
      .set("x-request-id", "req-property-1");

    expect(calls[0].requestId).toBe(res.headers["x-request-id"]);
    expect(calls[0].requestId).not.toBe("req-property-1");
  });

  it("preserves the query string", async () => {
    await request(createApp(testConfig({ PROPERTY_SERVICE_URL: upstreamUrl })))
      .get("/property/hotels?city=Buenos%20Aires")
      .set("x-gateway-secret", TEST_SECRET);

    expect(calls[0].url).toBe("/v1/hotels?city=Buenos%20Aires");
  });

  it("preserves method, body and status on POST without retrying", async () => {
    const res = await request(createApp(testConfig({ PROPERTY_SERVICE_URL: upstreamUrl })))
      .post("/property/hotels")
      .set("x-gateway-secret", TEST_SECRET)
      .send({ name: "Nuevo Hotel" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ method: "POST", body: { name: "Nuevo Hotel" } });
    expect(calls).toHaveLength(1);
  });

  it("preserves an upstream error status and body", async () => {
    const res = await request(createApp(testConfig({ PROPERTY_SERVICE_URL: upstreamUrl })))
      .get("/property/boom")
      .set("x-gateway-secret", TEST_SECRET);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "boom" });
  });

  it("returns 502 when the upstream is unreachable", async () => {
    const res = await request(createApp(testConfig({ PROPERTY_SERVICE_URL: "http://127.0.0.1:1/v1" })))
      .get("/property/hotels")
      .set("x-gateway-secret", TEST_SECRET);

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: "BadGateway", statusCode: 502 });
  });

  it("returns 504 when the upstream exceeds the timeout", async () => {
    const res = await request(
      createApp(testConfig({ PROPERTY_SERVICE_URL: upstreamUrl, UPSTREAM_TIMEOUT_MS: 150 }))
    )
      .get("/property/slow")
      .set("x-gateway-secret", TEST_SECRET);

    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({ error: "GatewayTimeout", statusCode: 504 });
  });
});
