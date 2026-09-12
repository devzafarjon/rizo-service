import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { signCustomerToken } from "../lib/customer-jwt.ts";
import { consumeCustomerToken, digits, issueCustomerToken, portalBaseUrl } from "../lib/customer-tokens.ts";
import { requireCustomer } from "../middleware/customer.ts";

export const customerAuthRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(80),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
});

function publicCustomer(customer: { id: string; name: string; email: string | null; phone: string | null; emailVerified: boolean }) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    emailVerified: customer.emailVerified,
  };
}

function tokenResponse(customer: { id: string; name: string; email: string | null; phone: string | null; emailVerified: boolean }) {
  if (!customer.email) {
    throw new Error("Customer email is required");
  }
  return {
    token: signCustomerToken({ customerId: customer.id, email: customer.email, scope: "customer" }),
    customer: publicCustomer(customer),
  };
}

async function findByPhone(phone: string) {
  const want = digits(phone);
  if (want.length < 7) {
    return null;
  }
  const candidates = await prisma.customer.findMany({
    where: { phone: { not: null } },
    include: { locations: true },
  });
  return candidates.find((item) => digits(item.phone ?? "").endsWith(want.slice(-9))) ?? null;
}

customerAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or password" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer?.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const matches = await bcrypt.compare(parsed.data.password, customer.passwordHash);
  if (!matches) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  res.json(tokenResponse(customer));
});

customerAuthRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid signup" });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const phone = parsed.data.phone || null;
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const byEmail = await prisma.customer.findUnique({ where: { email }, include: { locations: true } });
  const byPhone = !byEmail && phone ? await findByPhone(phone) : null;
  const existing = byEmail ?? byPhone;

  if (existing?.passwordHash) {
    res.status(409).json({ error: "This shop already has a portal account. Sign in." });
    return;
  }

  let customer;
  if (existing) {
    customer = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        email: existing.email ?? email,
        phone: existing.phone ?? phone,
        emailVerified: Boolean(existing.email),
      },
    });
  } else {
    const city = parsed.data.city || "Toshkent";
    const address = parsed.data.address || "—";
    customer = await prisma.customer.create({
      data: {
        name: parsed.data.name,
        email,
        phone,
        passwordHash,
        emailVerified: false,
        locations: { create: [{ address, city }] },
      },
    });
  }

  if (!customer.emailVerified && customer.email) {
    const { raw } = await issueCustomerToken(customer.id, "verify", 72);
    const verifyUrl = `${portalBaseUrl()}/portal/verify?token=${raw}`;
    console.log(`[portal] Verify email for ${customer.email}: ${verifyUrl}`);
  }

  res.status(201).json(tokenResponse(customer));
});

customerAuthRouter.post("/forgot", async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const payload: { ok: true; resetUrl?: string } = { ok: true };
  const customer = email ? await prisma.customer.findUnique({ where: { email } }) : null;
  if (customer?.passwordHash && customer.email) {
    const { raw } = await issueCustomerToken(customer.id, "reset", 2);
    const resetUrl = `${portalBaseUrl()}/portal/reset?token=${raw}`;
    console.log(`[portal] Password reset for ${customer.email}: ${resetUrl}`);
    if (process.env.NODE_ENV !== "production") {
      payload.resetUrl = resetUrl;
    }
  }
  res.json(payload);
});

customerAuthRouter.post("/reset", async (req, res) => {
  const token = String(req.body?.token ?? "");
  const password = String(req.body?.password ?? "");
  if (!token || password.length < 8) {
    res.status(400).json({ error: "Invalid reset" });
    return;
  }
  const customer = await consumeCustomerToken(token, "reset");
  if (!customer) {
    res.status(400).json({ error: "Reset link is invalid or expired" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.customer.update({ where: { id: customer.id }, data: { passwordHash } });
  res.json({ ok: true });
});

customerAuthRouter.post("/verify", async (req, res) => {
  const token = String(req.body?.token ?? req.query.token ?? "");
  const customer = token ? await consumeCustomerToken(token, "verify") : null;
  if (!customer) {
    res.status(400).json({ error: "Verify link is invalid or expired" });
    return;
  }
  await prisma.customer.update({ where: { id: customer.id }, data: { emailVerified: true } });
  res.json({ ok: true });
});

customerAuthRouter.get("/me", requireCustomer, async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.customer!.customerId },
    include: { locations: { orderBy: { address: "asc" } } },
  });
  if (!customer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({
    customer: {
      ...publicCustomer(customer),
      locations: customer.locations.map((location) => ({
        id: location.id,
        address: location.address,
        city: location.city,
      })),
    },
  });
});
