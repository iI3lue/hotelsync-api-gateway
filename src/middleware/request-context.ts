import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { log } from "../logger.js";

export const REQUEST_ID_HEADER = "x-request-id";
export const CLIENT_IP_HEADER = "x-client-ip";

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const clientIp = req.ip ?? req.socket.remoteAddress ?? "";

  res.locals.requestId = requestId;
  res.locals.clientIp = clientIp;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    log("info", "request.completed", {
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Math.round(durationMs * 100) / 100,
    });
  });

  next();
}
