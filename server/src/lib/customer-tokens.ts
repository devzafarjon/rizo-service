import crypto from "node:crypto";
import { prisma } from "./prisma.ts";
import { publicAppUrl } from "./origins.ts";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function issueCustomerToken(customerId: string, purpose: "reset" | "verify", hours: number) {
  const raw = newRawToken();
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  await prisma.customerAuthToken.create({
    data: {
      customerId,
      tokenHash: hashToken(raw),
      purpose,
      expiresAt,
    },
  });
  return { raw, expiresAt };
}

export async function consumeCustomerToken(raw: string, purpose: "reset" | "verify") {
  const row = await prisma.customerAuthToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { customer: true },
  });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  await prisma.customerAuthToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return row.customer;
}

export function portalBaseUrl() {
  return (process.env.PUBLIC_APP_URL ?? publicAppUrl()).replace(/\/$/, "");
}

export function digits(value: string) {
  return value.replace(/\D/g, "");
}
