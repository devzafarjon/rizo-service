import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { calendarDate, jobInclude, serializeJob, startOfDay } from "../lib/jobs.ts";
import { asNumber } from "../lib/money.ts";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireRole("admin", "dispatcher"));

dashboardRouter.get("/", async (_req, res) => {
  const today = startOfDay(calendarDate());

  const [openJobs, overdue, unassigned, urgent, invoicesDue, todayJobs, completedToday, recentJobs] =
    await Promise.all([
      prisma.job.count({ where: { status: { in: ["new", "scheduled", "in_progress"] } } }),
      prisma.job.count({
        where: {
          status: { in: ["new", "scheduled"] },
          scheduledDate: { lt: today },
        },
      }),
      prisma.job.count({ where: { assignedTechnicianId: null, status: { in: ["new", "scheduled"] } } }),
      prisma.job.count({ where: { priority: "urgent", status: { in: ["new", "scheduled", "in_progress"] } } }),
      prisma.invoice.count({ where: { status: { in: ["draft", "sent"] } } }),
      prisma.job.count({
        where: {
          scheduledDate: today,
          status: { notIn: ["cancelled"] },
        },
      }),
      prisma.job.count({
        where: { status: { in: ["completed", "invoiced"] }, completedAt: { gte: today } },
      }),
      prisma.job.findMany({
        where: { status: { not: "cancelled" } },
        include: jobInclude,
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

  const dueInvoices = await prisma.invoice.findMany({
    where: { status: { in: ["draft", "sent"] } },
    select: { amount: true },
  });
  const dueAmount = dueInvoices.reduce((sum, invoice) => sum + (asNumber(invoice.amount) ?? 0), 0);

  res.json({
    stats: {
      openJobs,
      invoicesDue,
      overdue,
      unassigned,
      urgent,
      todayJobs,
      completedToday,
      dueAmount,
    },
    recentJobs: recentJobs.map(serializeJob),
  });
});
