import type { NextFunction, Request, Response } from "express";
import { verifyCustomerToken } from "../lib/customer-jwt.ts";

export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    req.customer = verifyCustomerToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
