import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { SERVICE_ROUTES } from "../../src/routes.js";
import type { ServiceUrlKey } from "../../src/routes.js";
import { TEST_SECRET, testConfig } from "../helpers/config.js";

jest.mock("../../src/logger.js", () => ({ log: jest.fn() }));

let upstream: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  app.all("/:service/*", (req, res) => {
    res.json({ service: req.params.service, url: req.originalUrl });
  });

  upstream = createServer(app);
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe.each(SERVICE_ROUTES)("route $prefix", ({ prefix, urlKey }) => {
  it("forwards to the URL declared for that route", async () => {
    const serviceName = prefix.slice(1);
    const overrides = { [urlKey]: `${origin}/${serviceName}` } as Partial<
      Record<ServiceUrlKey, string>
    >;
    const app = createApp(testConfig(overrides));

    const res = await request(app)
      .get(`${prefix}/probe?x=1`)
      .set("x-gateway-secret", TEST_SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      service: serviceName,
      url: `/${serviceName}/probe?x=1`,
    });
  });
});

describe("unknown prefixes", () => {
  it("returns a controlled 404 instead of proxying", async () => {
    const app = createApp(testConfig({ PROPERTY_SERVICE_URL: `${origin}/property` }));

    const res = await request(app)
      .get("/unknown-service/probe")
      .set("x-gateway-secret", TEST_SECRET);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "NotFound", statusCode: 404 });
  });
});
