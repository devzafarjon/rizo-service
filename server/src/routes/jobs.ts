import { Router } from "express";
import { z } from "zod";
import type { JobKind, JobStatus, Priority } from "@prisma/client";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { applyJobStatus, emitJobUpdated, isClosedStatus, jobInclude, serializeJob, startOfDay } from "../lib/jobs.ts";
import { defaultChecklist, parseChecklist } from "../lib/checklists.ts";

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

const STATUSES = ["new", "scheduled", "in_progress", "completed", "cancelled", "invoiced"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const KINDS = ["installation", "maintenance", "repair"] as const;

const jobSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  kind: z.enum(KINDS).optional(),
  orderRef: z.string().trim().max(80).optional().or(z.literal("")).nullable(),
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

function writableJob<T extends { assignedTechnicianId: string | null; status: JobStatus }>(
  job: T | null,
  req: { user?: { role: string; userId: string } },
  res: { status: (code: number) => { json: (body: { error: string }) => void } },
): job is T {
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return false;
  }
  if (req.user!.role === "technician" && job.assignedTechnicianId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  if (isClosedStatus(job.status)) {
    res.status(400).json({ error: "Job is closed" });
    return false;
  }
  return true;
}

jobsRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const status = STATUSES.includes(String(req.query.status) as JobStatus) ? (req.query.status as JobStatus) : undefined;
  const technicianId = String(req.query.technicianId ?? "");
  const kind = KINDS.includes(String(req.query.kind) as JobKind) ? (req.query.kind as JobKind) : undefined;
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
      ...(kind ? { kind } : {}),
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
              { orderRef: { contains: q, mode: "insensitive" } },
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

jobsRouter.post("/", requireRole("dispatcher"), async (req, res) => {
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
  const kind = (parsed.data.kind as JobKind | undefined) ?? "repair";

  const job = await prisma.job.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      kind,
      orderRef: kind === "installation" ? parsed.data.orderRef || null : null,
      checklist: defaultChecklist(kind),
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

jobsRouter.patch("/:id", requireRole("dispatcher"), async (req, res) => {
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
  if (isClosedStatus(existing.status)) {
    res.status(400).json({ error: "Job is closed" });
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
  if ((status === "scheduled" || status === "in_progress") && !assigned) {
    status = "new";
  }
  if (status === "scheduled" && !date) {
    status = "new";
  }

  const nextKind = parsed.data.kind ?? existing.kind;
  const nextOrderRef =
    nextKind === "installation"
      ? parsed.data.orderRef !== undefined
        ? parsed.data.orderRef || null
        : existing.orderRef
      : null;

  const job = await prisma.job.update({
    where: { id: String(req.params.id) },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.kind !== undefined
        ? parsed.data.kind !== existing.kind
          ? { kind: parsed.data.kind, checklist: defaultChecklist(parsed.data.kind) }
          : { kind: parsed.data.kind }
        : {}),
      orderRef: nextOrderRef,
      ...(parsed.data.customerId !== undefined ? { customerId: parsed.data.customerId } : {}),
      ...(parsed.data.locationId !== undefined ? { locationId: parsed.data.locationId } : {}),
      assignedTechnicianId: assigned,
      scheduledDate: date,
      ...(parsed.data.scheduledTimeStart !== undefined ? { scheduledTimeStart: parsed.data.scheduledTimeStart || null } : {}),
      ...(parsed.data.scheduledTimeEnd !== undefined ? { scheduledTimeEnd: parsed.data.scheduledTimeEnd || null } : {}),
      status,
      ...(status === "new" && existing.status === "in_progress" ? { startedAt: null } : {}),
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

  const result = await applyJobStatus(
    String(req.params.id),
    nextStatus,
    req.user!.role === "technician" ? "technician" : "dispatcher",
  );
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
  if (!writableJob(job, req, res)) {
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

jobsRouter.post("/:id/checklist", async (req, res) => {
  const itemId = String(req.body?.id ?? "").trim();
  const done = Boolean(req.body?.done);
  if (!itemId) {
    res.status(400).json({ error: "Checklist item is required" });
    return;
  }
  const job = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!writableJob(job, req, res)) {
    return;
  }

  const checklist = parseChecklist(job.checklist, job.kind).map((item) =>
    item.id === itemId ? { ...item, done } : item,
  );
  const updated = await prisma.job.update({
    where: { id: job.id },
    data: { checklist },
    include: jobInclude,
  });
  const serialized = serializeJob(updated);
  emitJobUpdated(getIo(req), serialized);
  res.json({ job: serialized });
});

jobsRouter.post("/:id/photos", async (req, res) => {
  const photoUrl = String(req.body?.photoUrl ?? "");
  if (!photoUrl.startsWith("data:image/") || photoUrl.length > 1_400_000) {
    res.status(400).json({ error: "Photo must be a small image" });
    return;
  }
  const job = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!writableJob(job, req, res)) {
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
  if (!writableJob(job, req, res)) {
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
