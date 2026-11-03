import express from "express";
import type { GatewayConfig } from "./config.js";
import { requireGatewaySecret } from "./middleware/gateway-secret.js";
import { requestContext } from "./middleware/request-context.js";
import { createProxyRouter } from "./proxy/proxy-router.js";
import { createWakeBroadcaster, healthUrl } from "./proxy/wake-broadcast.js";
import { SERVICE_ROUTES } from "./routes.js";

export function createApp(config: GatewayConfig) {
  const app = express();
  app.disable("x-powered-by");

  const wakeBroadcaster = createWakeBroadcaster({
    targets: SERVICE_ROUTES.map(({ prefix, urlKey }) => ({
      name: prefix.slice(1),
      url: healthUrl(config[urlKey]),
    })),
    intervalMs: config.WAKE_ALL_INTERVAL_MS,
    timeoutMs: config.WAKE_ALL_TIMEOUT_MS,
    enabled: config.WAKE_ALL_ENABLED,
  });

  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "api-gateway",
      timestamp: new Date().toISOString(),
    });
  });

  app.use(requireGatewaySecret(config.GATEWAY_SHARED_SECRET));

  app.use((_req, _res, next) => {
    wakeBroadcaster.maybeWake();
    next();
  });

  for (const route of SERVICE_ROUTES) {
    const allowedHeaders =
      "allowedHeaders" in route ? route.allowedHeaders : undefined;
    const timeoutMs =
      "timeoutMs" in route ? route.timeoutMs : config.UPSTREAM_TIMEOUT_MS;
    app.use(
      route.prefix,
      createProxyRouter({
        upstreamUrl: config[route.urlKey],
        timeoutMs,
        allowedHeaders,
        gatewaySecret: config.GATEWAY_SHARED_SECRET,
      })
    );
  }

  app.use((_req, res) => {
    res.status(404).json({
      error: "NotFound",
      message: "Ruta no encontrada",
      statusCode: 404,
    });
  });

  return app;
}
