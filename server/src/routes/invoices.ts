import { Router } from "express";
import { z } from "zod";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { emitJobUpdated, jobInclude, serializeJob } from "../lib/jobs.ts";
import { asNumber, invoiceAmount } from "../lib/money.ts";

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireRole("admin", "dispatcher"));

invoicesRouter.get("/", async (req, res) => {
  const status = String(req.query.status ?? "");
  const invoices = await prisma.invoice.findMany({
    where: status === "draft" || status === "sent" || status === "paid" ? { status } : undefined,
    include: {
      job: {
        include: {
          customer: true,
          location: true,
          assignedTechnician: { select: { id: true, name: true } },
          partsUsed: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    invoices: invoices.map((invoice) => ({
      ...invoice,
      amount: asNumber(invoice.amount) ?? 0,
      job: {
        ...invoice.job,
        laborHours: asNumber(invoice.job.laborHours),
        partsUsed: invoice.job.partsUsed.map((part) => ({
          ...part,
          unitCost: asNumber(part.unitCost) ?? 0,
        })),
      },
    })),
  });
});

invoicesRouter.get("/:id", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      job: {
        include: {
          customer: true,
          location: true,
          assignedTechnician: { select: { id: true, name: true, phone: true } },
          partsUsed: true,
        },
      },
    },
  });
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json({
    invoice: {
      ...invoice,
      amount: asNumber(invoice.amount) ?? 0,
      job: {
        ...invoice.job,
        laborHours: asNumber(invoice.job.laborHours),
        partsUsed: invoice.job.partsUsed.map((part) => ({
          ...part,
          unitCost: asNumber(part.unitCost) ?? 0,
        })),
      },
    },
  });
});

invoicesRouter.post("/", async (req, res) => {
  const parsed = z.object({ jobId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Job is required" });
    return;
  }

  const job = await prisma.job.findUnique({
    where: { id: parsed.data.jobId },
    include: { partsUsed: true, invoices: true },
  });
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.status !== "completed") {
    res.status(400).json({ error: "Invoice only from completed jobs" });
    return;
  }
  if (job.invoices.length > 0) {
    res.status(400).json({ error: "Invoice already exists" });
    return;
  }

  const amount = invoiceAmount(job.partsUsed, asNumber(job.laborHours));
  const invoice = await prisma.invoice.create({
    data: { jobId: job.id, amount, status: "draft" },
  });
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "invoiced" },
  });
  const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude });
  emitJobUpdated(req.app.get("io") as Server | undefined, serializeJob(updated));
  res.status(201).json({ invoice: { ...invoice, amount } });
});

invoicesRouter.patch("/:id", async (req, res) => {
  const parsed = z.object({ status: z.enum(["draft", "sent", "paid"]) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status },
    });
    res.json({ invoice: { ...invoice, amount: asNumber(invoice.amount) ?? 0 } });
  } catch {
    res.status(404).json({ error: "Invoice not found" });
  }
});
