import { loadConfig } from "../../src/config.js";
import { SERVICE_ROUTES } from "../../src/routes.js";
import { serviceUrls } from "../helpers/config.js";

const VALID_URL = "http://localhost:3001/v1";

function validEnv(): NodeJS.ProcessEnv {
  return {
    GATEWAY_SHARED_SECRET: "0123456789abcdef0123456789abcdef",
    ...serviceUrls(VALID_URL),
  };
}

describe("loadConfig", () => {
  it("applies defaults when every service URL is present", () => {
    const config = loadConfig(validEnv());

    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(8080);
    expect(config.UPSTREAM_TIMEOUT_MS).toBe(10_000);
    expect(config.GATEWAY_SHARED_SECRET).toHaveLength(32);
    expect(config.PROPERTY_SERVICE_URL).toBe(VALID_URL);
  });

  it("coerces numeric strings and accepts a valid secret", () => {
    const config = loadConfig({
      ...validEnv(),
      NODE_ENV: "production",
      PORT: "8090",
      UPSTREAM_TIMEOUT_MS: "2500",
      GATEWAY_SHARED_SECRET: "0123456789abcdef0123456789abcdef",
    });

    expect(config.NODE_ENV).toBe("production");
    expect(config.PORT).toBe(8090);
    expect(config.UPSTREAM_TIMEOUT_MS).toBe(2500);
    expect(config.GATEWAY_SHARED_SECRET).toHaveLength(32);
  });

  it.each(SERVICE_ROUTES)("requires $urlKey", ({ urlKey }) => {
    const env = validEnv();
    delete env[urlKey];

    expect(() => loadConfig(env)).toThrow(new RegExp(urlKey));
  });

  it("rejects an invalid port with a readable message", () => {
    expect(() => loadConfig({ ...validEnv(), PORT: "70000" })).toThrow(/PORT/);
  });

  it("requires the shared secret", () => {
    const env = validEnv();
    delete env.GATEWAY_SHARED_SECRET;

    expect(() => loadConfig(env)).toThrow(/GATEWAY_SHARED_SECRET/);
  });

  it("rejects a secret shorter than 16 characters", () => {
    expect(() => loadConfig({ ...validEnv(), GATEWAY_SHARED_SECRET: "short" })).toThrow(
      /GATEWAY_SHARED_SECRET/
    );
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadConfig({ ...validEnv(), NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});
