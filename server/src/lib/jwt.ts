import jwt from "jsonwebtoken";
import type { AuthUser } from "../types.ts";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

export function signToken(payload: AuthUser) {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, getSecret()) as Omit<AuthUser, "role"> & { role?: string; scope?: string };
  if (payload.scope === "customer") {
    throw new Error("Staff token required");
  }
  return {
    userId: payload.userId,
    email: payload.email,
    role: payload.role === "technician" ? "technician" : "dispatcher",
  };
}
