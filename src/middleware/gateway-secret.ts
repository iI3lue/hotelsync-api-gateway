import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const GATEWAY_SECRET_HEADER = "x-gateway-secret";

export function requireGatewaySecret(secret: string) {
  const expected = Buffer.from(secret, "utf8");

  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = Buffer.from(req.header(GATEWAY_SECRET_HEADER) ?? "", "utf8");
    const valid =
      provided.length === expected.length && timingSafeEqual(provided, expected);

    if (!valid) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Secreto de gateway inválido",
        statusCode: 401,
      });
      return;
    }

    res.locals.gatewayAuthenticated = true;
    next();
  };
}
