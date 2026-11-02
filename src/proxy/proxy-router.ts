import { Router } from "express";
import type { Request, Response } from "express";
import { log } from "../logger.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

const STRIPPED_REQUEST_HEADERS = new Set([
  "cookie",
  "x-service-key",
  "x-loyalty-key",
  "x-provider-key",
  "x-gateway-secret",
  "x-request-id",
  "x-client-ip",
]);

const RESPONSE_SKIP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
]);

export interface ProxyTarget {
  upstreamUrl: string;
  timeoutMs: number;
}

function errorJson(res: Response, statusCode: number, error: string, message: string): void {
  res.status(statusCode).json({ error, message, statusCode });
}

async function readBody(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function isStrippedHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return STRIPPED_REQUEST_HEADERS.has(lower) || lower.startsWith("x-internal-");
}

function buildUpstreamHeaders(req: Request, requestId: string, clientIp: string): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP.has(key.toLowerCase()) || isStrippedHeader(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  headers.set("x-request-id", requestId);
  headers.set("x-client-ip", clientIp);
  return headers;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

function errorName(value: unknown): unknown {
  return typeof value === "object" && value !== null
    ? (value as { name?: unknown }).name
    : undefined;
}

function isTimeout(err: unknown): boolean {
  const names = [errorName(err), errorName((err as { cause?: unknown } | null)?.cause)];
  return names.some((name) => name === "TimeoutError" || name === "AbortError");
}

export function createProxyRouter(target: ProxyTarget): Router {
  const router = Router();
  const baseUrl = target.upstreamUrl.replace(/\/+$/, "");

  router.all("*", (req: Request, res: Response) => {
    void (async () => {
      const requestId = String(res.locals.requestId ?? "");
      const forwardedClientIp = req.header("x-client-ip");
      const clientIp =
        res.locals.gatewayAuthenticated === true && forwardedClientIp
          ? forwardedClientIp
          : String(res.locals.clientIp ?? "");
      const url = `${baseUrl}${req.url}`;

      let body: Buffer | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        try {
          body = await readBody(req);
        } catch {
          errorJson(res, 400, "BadRequest", "No se pudo leer el cuerpo de la petición");
          return;
        }
      }

      try {
        const upstream = await fetch(url, {
          method: req.method,
          headers: buildUpstreamHeaders(req, requestId, clientIp),
          body: body && body.length > 0 ? toArrayBuffer(body) : undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(target.timeoutMs),
        });

        res.status(upstream.status);
        upstream.headers.forEach((value, key) => {
          if (!RESPONSE_SKIP.has(key.toLowerCase())) res.setHeader(key, value);
        });
        const setCookies = upstream.headers.getSetCookie?.() ?? [];
        if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);

        const payload = Buffer.from(await upstream.arrayBuffer());
        res.send(payload);
      } catch (err) {
        if (isTimeout(err)) {
          log("warn", "proxy.upstream_timeout", {
            request_id: requestId,
            method: req.method,
            path: req.originalUrl,
            timeout_ms: target.timeoutMs,
          });
          if (!res.headersSent) {
            errorJson(res, 504, "GatewayTimeout", "El servicio upstream no respondió a tiempo");
          }
          return;
        }

        log("error", "proxy.upstream_unavailable", {
          request_id: requestId,
          method: req.method,
          path: req.originalUrl,
          upstream: baseUrl,
          reason: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) {
          errorJson(res, 502, "BadGateway", "El servicio upstream no está disponible");
        }
      }
    })();
  });

  return router;
}
