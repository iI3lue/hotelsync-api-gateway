import type { GatewayConfig } from "../../src/config.js";
import { SERVICE_ROUTES } from "../../src/routes.js";
import type { ServiceUrlKey } from "../../src/routes.js";

const DEFAULT_UPSTREAM = "http://127.0.0.1:1/v1";

export const TEST_SECRET = "test-gateway-secret-0123456789abcdef";

export function serviceUrls(baseUrl = DEFAULT_UPSTREAM): Record<ServiceUrlKey, string> {
  return Object.fromEntries(
    SERVICE_ROUTES.map(({ urlKey }) => [urlKey, baseUrl])
  ) as Record<ServiceUrlKey, string>;
}

export function testConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    NODE_ENV: "test",
    PORT: 0,
    UPSTREAM_TIMEOUT_MS: 1_000,
    GATEWAY_SHARED_SECRET: TEST_SECRET,
    ...serviceUrls(),
    ...overrides,
  };
}
