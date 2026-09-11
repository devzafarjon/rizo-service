import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { startOfDay } from "../lib/jobs.ts";

export const customersRouter = Router();
customersRouter.use(requireAuth, requireRole("admin", "dispatcher"));

const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  maintenanceIntervalMonths: z.number().int().min(1).max(24).optional(),
  nextMaintenanceOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const locationSchema = z.object({
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(80),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

customersRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      locations: { orderBy: { address: "asc" } },
      _count: { select: { jobs: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ customers });
});

customersRouter.get("/:id", async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      locations: { orderBy: { address: "asc" } },
      jobs: {
        include: {
          location: true,
          assignedTechnician: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json({ customer });
});

customersRouter.post("/", async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid customer" });
    return;
  }
  const customer = await prisma.customer.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
      maintenanceIntervalMonths: parsed.data.maintenanceIntervalMonths ?? 3,
      nextMaintenanceOn: parsed.data.nextMaintenanceOn ? startOfDay(parsed.data.nextMaintenanceOn) : null,
    },
    include: { locations: true, _count: { select: { jobs: true } } },
  });
  res.status(201).json({ customer });
});

customersRouter.patch("/:id", async (req, res) => {
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid customer" });
    return;
  }
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
        ...(parsed.data.maintenanceIntervalMonths !== undefined
          ? { maintenanceIntervalMonths: parsed.data.maintenanceIntervalMonths }
          : {}),
        ...(parsed.data.nextMaintenanceOn !== undefined
          ? { nextMaintenanceOn: parsed.data.nextMaintenanceOn ? startOfDay(parsed.data.nextMaintenanceOn) : null }
          : {}),
      },
      include: { locations: true, _count: { select: { jobs: true } } },
    });
    res.json({ customer });
  } catch {
    res.status(404).json({ error: "Customer not found" });
  }
});

customersRouter.delete("/:id", async (req, res) => {
  const jobs = await prisma.job.count({ where: { customerId: req.params.id } });
  if (jobs > 0) {
    res.status(400).json({ error: "Cannot delete a customer with jobs" });
    return;
  }
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Customer not found" });
  }
});

customersRouter.post("/:id/locations", async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid location" });
    return;
  }
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const location = await prisma.serviceLocation.create({
    data: {
      customerId: customer.id,
      address: parsed.data.address,
      city: parsed.data.city,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      notes: parsed.data.notes || null,
    },
  });
  res.status(201).json({ location });
});
