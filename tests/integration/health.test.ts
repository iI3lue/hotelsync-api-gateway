import request from "supertest";
import { createApp } from "../../src/app.js";
import { TEST_SECRET, testConfig } from "../helpers/config.js";

jest.mock("../../src/logger.js", () => ({ log: jest.fn() }));

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("GET /health", () => {
  const app = createApp(testConfig());

  it("responds 200 without external dependencies", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("api-gateway");
    expect(typeof res.body.timestamp).toBe("string");
  });

  it("generates a request id when the header is missing", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-request-id"]).toMatch(UUID_V4);
  });

  it("overwrites a client-supplied request id", async () => {
    const res = await request(app)
      .get("/health")
      .set("x-request-id", "req-abc-123");

    expect(res.headers["x-request-id"]).toMatch(UUID_V4);
    expect(res.headers["x-request-id"]).not.toBe("req-abc-123");
  });
});

describe("unknown routes", () => {
  const app = createApp(testConfig());

  it("returns a controlled JSON 404 with a valid secret", async () => {
    const res = await request(app)
      .get("/does-not-exist")
      .set("x-gateway-secret", TEST_SECRET);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "NotFound",
      message: "Ruta no encontrada",
      statusCode: 404,
    });
  });

  it("hides unknown routes from callers without the secret", async () => {
    const res = await request(app).get("/does-not-exist");

    expect(res.status).toBe(401);
  });
});
