import type { JobStatus, Prisma } from "@prisma/client";
import type { Server } from "socket.io";
import { prisma } from "./prisma.ts";
import { asNumber, laborHoursFor } from "./money.ts";
import { parseChecklist } from "./checklists.ts";

export const jobInclude = {
  customer: true,
  location: true,
  assignedTechnician: {
    select: { id: true, name: true, email: true, phone: true, role: true },
  },
  notes: {
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  },
  photos: { orderBy: { createdAt: "desc" } },
  partsUsed: true,
  invoices: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.JobInclude;

export type JobWithRelations = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

const STATUS_FLOW: Record<JobStatus, JobStatus[]> = {
  new: ["scheduled", "in_progress", "cancelled"],
  scheduled: ["new", "in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["invoiced"],
  cancelled: [],
  invoiced: [],
};

export function canTransition(from: JobStatus, to: JobStatus) {
  return STATUS_FLOW[from].includes(to);
}

export function isClosedStatus(status: JobStatus) {
  return status === "cancelled" || status === "invoiced";
}

export function serializeJob(job: JobWithRelations) {
  return {
    ...job,
    laborHours: asNumber(job.laborHours),
    checklist: parseChecklist(job.checklist, job.kind),
    partsUsed: job.partsUsed.map((part) => ({
      ...part,
      unitCost: asNumber(part.unitCost) ?? 0,
    })),
    invoices: job.invoices.map((invoice) => ({
      ...invoice,
      amount: asNumber(invoice.amount) ?? 0,
    })),
  };
}

export function emitJobUpdated(io: Server | undefined, job: ReturnType<typeof serializeJob>) {
  io?.emit("job:updated", job);
}

export async function applyJobStatus(jobId: string, nextStatus: JobStatus, actorRole: "dispatcher" | "technician") {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return { error: "Job not found" as const, status: 404 };
  }

  if (actorRole === "technician") {
    const allowed =
      (nextStatus === "in_progress" && (job.status === "new" || job.status === "scheduled")) ||
      (nextStatus === "completed" && job.status === "in_progress");
    if (!allowed) {
      return { error: "Forbidden status change" as const, status: 403 };
    }
  } else if (!canTransition(job.status, nextStatus) && job.status !== nextStatus) {
    return { error: "Invalid status change" as const, status: 400 };
  }

  const now = new Date();
  const data: Prisma.JobUpdateInput = { status: nextStatus };

  if (nextStatus === "in_progress" && !job.startedAt) {
    data.startedAt = now;
  }
  if (nextStatus === "completed") {
    data.completedAt = now;
    if (!job.laborHours) {
      data.laborHours = laborHoursFor(job, now);
    }
    if (job.kind === "maintenance") {
      await scheduleNextMaintenance(job.customerId);
    }
  }
  if (nextStatus === "cancelled") {
    data.completedAt = now;
  }
  if (nextStatus === "new") {
    data.assignedTechnician = { disconnect: true };
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data,
    include: jobInclude,
  });

  return { job: serializeJob(updated) };
}

export function startOfDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function calendarDate(timeZone = "Asia/Tashkent") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

async function scheduleNextMaintenance(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return;
  }
  const months = customer.maintenanceIntervalMonths > 0 ? customer.maintenanceIntervalMonths : 3;
  await prisma.customer.update({
    where: { id: customerId },
    data: { nextMaintenanceOn: addMonths(startOfDay(calendarDate()), months) },
  });
}
