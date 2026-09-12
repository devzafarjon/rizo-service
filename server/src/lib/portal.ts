import type { JobKind, JobStatus, Prisma } from "@prisma/client";
import { asNumber, invoiceAmount } from "./money.ts";

const portalInclude = {
  location: { select: { id: true, address: true, city: true } },
  assignedTechnician: { select: { name: true } },
  relatedSale: { select: { id: true, productName: true } },
  notes: {
    where: { visibleToCustomer: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, noteText: true, createdAt: true },
  },
  invoices: { orderBy: { createdAt: "desc" } },
  partsUsed: true,
  feedback: true,
} satisfies Prisma.JobInclude;

export const portalJobInclude = portalInclude;

export type PortalJobRow = Prisma.JobGetPayload<{ include: typeof portalInclude }>;

export function firstName(name: string | null | undefined) {
  if (!name) {
    return null;
  }
  return name.trim().split(/\s+/)[0] ?? null;
}

export function serializePortalJob(job: PortalJobRow) {
  const publicInvoices = job.invoices
    .filter((invoice) => invoice.status === "sent" || invoice.status === "paid")
    .map((invoice) => ({
      id: invoice.id,
      amount: asNumber(invoice.amount) ?? 0,
      status: invoice.status,
    }));
  const laborHours = asNumber(job.laborHours);
  const computed =
    job.status === "completed" || job.status === "invoiced"
      ? invoiceAmount(job.partsUsed, laborHours)
      : null;

  return {
    id: job.id,
    title: job.title,
    description: job.description,
    kind: job.kind,
    status: job.status,
    orderRef: job.orderRef,
    submittedByCustomer: job.submittedByCustomer,
    scheduledDate: job.scheduledDate,
    scheduledTimeStart: job.scheduledTimeStart,
    scheduledTimeEnd: job.scheduledTimeEnd,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    location: job.location,
    technicianName: firstName(job.assignedTechnician?.name),
    relatedSale: job.relatedSale,
    notes: job.notes,
    payment:
      publicInvoices[0] ??
      (computed != null
        ? { id: null, amount: computed, status: job.status === "invoiced" ? "paid" : "draft" }
        : null),
    feedback: job.feedback
      ? { id: job.feedback.id, rating: job.feedback.rating, comment: job.feedback.comment, createdAt: job.feedback.createdAt }
      : null,
  };
}

export function canRate(status: JobStatus) {
  return status === "completed" || status === "invoiced";
}

export const PORTAL_KINDS: JobKind[] = ["repair", "maintenance"];
export const PORTAL_FILTER_KINDS: JobKind[] = ["repair", "maintenance", "installation"];

export const DEFAULT_PORTAL_TITLE: Record<"repair" | "maintenance", string> = {
  repair: "Ta’mir so‘rovi",
  maintenance: "Texnik xizmat so‘rovi",
};
