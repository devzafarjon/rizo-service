import { Router } from "express";
import { z } from "zod";
import type { JobStatus, Priority } from "@prisma/client";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { applyJobStatus, emitJobUpdated, jobInclude, serializeJob, startOfDay } from "../lib/jobs.ts";

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

const STATUSES = ["new", "scheduled", "in_progress", "completed", "cancelled", "invoiced"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const jobSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  priority: z.enum(PRIORITIES).optional(),
  customerId: z.string().min(1),
  locationId: z.string().min(1),
  assignedTechnicianId: z.string().min(1).nullable().optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  scheduledTimeStart: z.string().max(8).nullable().optional(),
  scheduledTimeEnd: z.string().max(8).nullable().optional(),
});

function getIo(req: { app: { get: (key: string) => unknown } }) {
  return req.app.get("io") as Server | undefined;
}

jobsRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const status = STATUSES.includes(String(req.query.status) as JobStatus) ? (req.query.status as JobStatus) : undefined;
  const technicianId = String(req.query.technicianId ?? "");
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  const mine = req.query.mine === "1";

  if (req.user!.role === "technician" && !mine) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const jobs = await prisma.job.findMany({
    where: {
      ...(mine || req.user!.role === "technician" ? { assignedTechnicianId: req.user!.userId } : {}),
      ...(status ? { status } : {}),
      ...(technicianId ? { assignedTechnicianId: technicianId } : {}),
      ...(from || to
        ? {
            scheduledDate: {
              ...(from ? { gte: startOfDay(from) } : {}),
              ...(to ? { lte: startOfDay(to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { location: { address: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: jobInclude,
    orderBy: [{ scheduledDate: "asc" }, { createdAt: "desc" }],
  });

  res.json({ jobs: jobs.map(serializeJob) });
});

jobsRouter.get("/:id", async (req, res) => {
  const job = await prisma.job.findUnique({
    where: { id: String(req.params.id) },
    include: jobInclude,
  });
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (req.user!.role === "technician" && job.assignedTechnicianId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({ job: serializeJob(job) });
});

jobsRouter.post("/", requireRole("admin", "dispatcher"), async (req, res) => {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job" });
    return;
  }

  const location = await prisma.serviceLocation.findFirst({
    where: { id: parsed.data.locationId, customerId: parsed.data.customerId },
  });
  if (!location) {
    res.status(400).json({ error: "Location does not belong to this customer" });
    return;
  }

  const assigned = parsed.data.assignedTechnicianId || null;
  const date = parsed.data.scheduledDate ? startOfDay(parsed.data.scheduledDate) : null;
  const status: JobStatus = assigned && date ? "scheduled" : "new";

  const job = await prisma.job.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      priority: (parsed.data.priority as Priority | undefined) ?? "medium",
      customerId: parsed.data.customerId,
      locationId: parsed.data.locationId,
      assignedTechnicianId: assigned,
      scheduledDate: date,
      scheduledTimeStart: parsed.data.scheduledTimeStart || null,
      scheduledTimeEnd: parsed.data.scheduledTimeEnd || null,
      status,
    },
    include: jobInclude,
  });

  const serialized = serializeJob(job);
  emitJobUpdated(getIo(req), serialized);
  res.status(201).json({ job: serialized });
});

jobsRouter.patch("/:id", requireRole("admin", "dispatcher"), async (req, res) => {
  const parsed = jobSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job" });
    return;
  }

  const existing = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (parsed.data.customerId && parsed.data.locationId) {
    const location = await prisma.serviceLocation.findFirst({
      where: { id: parsed.data.locationId, customerId: parsed.data.customerId },
    });
    if (!location) {
      res.status(400).json({ error: "Location does not belong to this customer" });
      return;
    }
  }

  const assigned =
    parsed.data.assignedTechnicianId === undefined ? existing.assignedTechnicianId : parsed.data.assignedTechnicianId;
  const date =
    parsed.data.scheduledDate === undefined
      ? existing.scheduledDate
      : parsed.data.scheduledDate
        ? startOfDay(parsed.data.scheduledDate)
        : null;

  let status = existing.status;
  if (status === "new" && assigned && date) {
    status = "scheduled";
  }
  if (status === "scheduled" && !assigned) {
    status = "new";
  }

  const job = await prisma.job.update({
    where: { id: String(req.params.id) },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.customerId !== undefined ? { customerId: parsed.data.customerId } : {}),
      ...(parsed.data.locationId !== undefined ? { locationId: parsed.data.locationId } : {}),
      assignedTechnicianId: assigned,
      scheduledDate: date,
      ...(parsed.data.scheduledTimeStart !== undefined ? { scheduledTimeStart: parsed.data.scheduledTimeStart || null } : {}),
      ...(parsed.data.scheduledTimeEnd !== undefined ? { scheduledTimeEnd: parsed.data.scheduledTimeEnd || null } : {}),
      status,
    },
    include: jobInclude,
  });

  const serialized = serializeJob(job);
  emitJobUpdated(getIo(req), serialized);
  res.json({ job: serialized });
});

jobsRouter.post("/:id/status", async (req, res) => {
  const nextStatus = String(req.body?.status ?? "") as JobStatus;
  if (!STATUSES.includes(nextStatus)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const existing = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (req.user!.role === "technician" && existing.assignedTechnicianId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const result = await applyJobStatus(String(req.params.id), nextStatus, req.user!.role);
  if ("error" in result && result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  emitJobUpdated(getIo(req), result.job!);
  res.json({ job: result.job });
});

jobsRouter.post("/:id/notes", async (req, res) => {
  const noteText = String(req.body?.noteText ?? "").trim();
  if (!noteText) {
    res.status(400).json({ error: "Note is required" });
    return;
  }
  const job = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (req.user!.role === "technician" && job.assignedTechnicianId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await prisma.jobNote.create({
    data: { jobId: job.id, userId: req.user!.userId, noteText },
  });
  const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude });
  const serialized = serializeJob(updated);
  emitJobUpdated(getIo(req), serialized);
  res.status(201).json({ job: serialized });
});

jobsRouter.post("/:id/photos", async (req, res) => {
  const photoUrl = String(req.body?.photoUrl ?? "");
  if (!photoUrl.startsWith("data:image/") || photoUrl.length > 1_400_000) {
    res.status(400).json({ error: "Photo must be a small image" });
    return;
  }
  const job = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (req.user!.role === "technician" && job.assignedTechnicianId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await prisma.jobPhoto.create({
    data: { jobId: job.id, photoUrl, uploadedBy: req.user!.userId },
  });
  const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude });
  const serialized = serializeJob(updated);
  emitJobUpdated(getIo(req), serialized);
  res.status(201).json({ job: serialized });
});

jobsRouter.post("/:id/parts", async (req, res) => {
  const partName = String(req.body?.partName ?? "").trim();
  const quantity = Number(req.body?.quantity ?? 0);
  const unitCost = Number(req.body?.unitCost ?? 0);
  if (!partName || !Number.isFinite(quantity) || quantity < 1 || !Number.isFinite(unitCost) || unitCost < 0) {
    res.status(400).json({ error: "Invalid part" });
    return;
  }
  const job = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (req.user!.role === "technician" && job.assignedTechnicianId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await prisma.partUsed.create({
    data: { jobId: job.id, partName, quantity: Math.round(quantity), unitCost },
  });
  const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude });
  const serialized = serializeJob(updated);
  emitJobUpdated(getIo(req), serialized);
  res.status(201).json({ job: serialized });
});
