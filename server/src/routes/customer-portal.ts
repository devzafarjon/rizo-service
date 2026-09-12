import { Router } from "express";
import { z } from "zod";
import type { JobKind, JobStatus } from "@prisma/client";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.ts";
import { requireCustomer } from "../middleware/customer.ts";
import { defaultChecklist } from "../lib/checklists.ts";
import { emitJobUpdated, jobInclude, serializeJob } from "../lib/jobs.ts";
import { canRate, DEFAULT_PORTAL_TITLE, PORTAL_FILTER_KINDS, portalJobInclude, serializePortalJob } from "../lib/portal.ts";

export const customerPortalRouter = Router();
customerPortalRouter.use(requireCustomer);

const ACTIVE: JobStatus[] = ["new", "scheduled", "in_progress"];
const DONE: JobStatus[] = ["completed", "invoiced", "cancelled"];

const requestSchema = z.object({
  kind: z.enum(["repair", "maintenance"]),
  description: z.string().trim().min(4).max(4000),
  locationId: z.string().min(1).optional(),
  relatedSaleId: z.string().min(1).optional().or(z.literal("")),
  title: z.string().trim().max(160).optional().or(z.literal("")),
});

const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
});

customerPortalRouter.get("/jobs", async (req, res) => {
  const group = String(req.query.status ?? "");
  const kind = PORTAL_FILTER_KINDS.includes(String(req.query.kind) as JobKind) ? (req.query.kind as JobKind) : undefined;
  const jobs = await prisma.job.findMany({
    where: {
      customerId: req.customer!.customerId,
      ...(group === "active" ? { status: { in: ACTIVE } } : {}),
      ...(group === "completed" ? { status: { in: DONE } } : {}),
      ...(kind ? { kind } : {}),
    },
    include: portalJobInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json({ jobs: jobs.map(serializePortalJob) });
});

customerPortalRouter.get("/jobs/:id", async (req, res) => {
  const job = await prisma.job.findFirst({
    where: { id: String(req.params.id), customerId: req.customer!.customerId },
    include: portalJobInclude,
  });
  if (!job) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.json({ job: serializePortalJob(job) });
});

customerPortalRouter.post("/jobs", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: req.customer!.customerId },
    include: { locations: true, sales: true },
  });
  if (!customer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const location =
    (parsed.data.locationId
      ? customer.locations.find((item) => item.id === parsed.data.locationId)
      : null) ?? customer.locations[0];
  if (!location) {
    res.status(400).json({ error: "Add a shop address before sending a request" });
    return;
  }

  const relatedSaleId = parsed.data.relatedSaleId || null;
  if (relatedSaleId && !customer.sales.some((sale) => sale.id === relatedSaleId)) {
    res.status(400).json({ error: "That purchase does not belong to this shop" });
    return;
  }

  const kind = parsed.data.kind;
  const created = await prisma.job.create({
    data: {
      title: parsed.data.title || DEFAULT_PORTAL_TITLE[kind],
      description: parsed.data.description,
      kind,
      checklist: defaultChecklist(kind),
      priority: kind === "repair" ? "high" : "medium",
      status: "new",
      submittedByCustomer: true,
      customerId: customer.id,
      locationId: location.id,
      relatedSaleId,
    },
    include: jobInclude,
  });

  emitJobUpdated(req.app.get("io") as Server | undefined, serializeJob(created));
  const portalJob = await prisma.job.findUniqueOrThrow({ where: { id: created.id }, include: portalJobInclude });
  res.status(201).json({ job: serializePortalJob(portalJob) });
});

customerPortalRouter.get("/sales", async (req, res) => {
  const sales = await prisma.sale.findMany({
    where: { customerId: req.customer!.customerId },
    orderBy: { soldOn: "desc" },
  });
  res.json({ sales });
});

customerPortalRouter.post("/jobs/:id/feedback", async (req, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Rating must be 1 to 5 stars" });
    return;
  }

  const job = await prisma.job.findFirst({
    where: { id: String(req.params.id), customerId: req.customer!.customerId },
    include: { feedback: true },
  });
  if (!job) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (!canRate(job.status)) {
    res.status(400).json({ error: "You can rate after the visit is finished" });
    return;
  }
  if (job.feedback) {
    res.status(400).json({ error: "This visit is already rated" });
    return;
  }

  const feedback = await prisma.feedback.create({
    data: {
      jobId: job.id,
      customerId: req.customer!.customerId,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
    },
  });
  res.status(201).json({ feedback });
});
