import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

function loadLocalEnv(): void {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // Sin .env: la configuración viene del entorno del proceso.
  }
}

loadLocalEnv();

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.PORT, () => {
  log("info", "gateway.started", { port: config.PORT, env: config.NODE_ENV });
});

function shutdown(signal: string): void {
  log("info", "gateway.stopping", { signal });
  server.close(() => {
    log("info", "gateway.stopped", {});
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
