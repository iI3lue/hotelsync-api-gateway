import express from "express";
import type { GatewayConfig } from "./config.js";
import { requireGatewaySecret } from "./middleware/gateway-secret.js";
import { requestContext } from "./middleware/request-context.js";
import { createProxyRouter } from "./proxy/proxy-router.js";
import { SERVICE_ROUTES } from "./routes.js";

export function createApp(config: GatewayConfig) {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestContext);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "api-gateway",
      timestamp: new Date().toISOString(),
    });
  });

  app.use(requireGatewaySecret(config.GATEWAY_SHARED_SECRET));

  for (const route of SERVICE_ROUTES) {
    app.use(
      route.prefix,
      createProxyRouter({
        upstreamUrl: config[route.urlKey],
        timeoutMs: config.UPSTREAM_TIMEOUT_MS,
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
