import { z } from "zod";
import { SERVICE_ROUTES } from "./routes.js";
import type { ServiceUrlKey } from "./routes.js";

const serviceUrlShape = Object.fromEntries(
  SERVICE_ROUTES.map(({ urlKey }) => [urlKey, z.string().url()])
) as Record<ServiceUrlKey, z.ZodString>;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
  GATEWAY_SHARED_SECRET: z.string().min(16),
  ...serviceUrlShape,
});

export type GatewayConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid gateway configuration: ${details}`);
  }
  return parsed.data;
}
