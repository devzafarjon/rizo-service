import jwt from "jsonwebtoken";
import type { PortalCustomer } from "../types.ts";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

export function signCustomerToken(payload: PortalCustomer) {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d", audience: "portal" });
}

export function verifyCustomerToken(token: string): PortalCustomer {
  const payload = jwt.verify(token, getSecret(), { audience: "portal" }) as PortalCustomer & { scope?: string };
  if (payload.scope !== "customer" || !payload.customerId || !payload.email) {
    throw new Error("Invalid customer token");
  }
  return {
    customerId: payload.customerId,
    email: payload.email,
    scope: "customer",
  };
}
