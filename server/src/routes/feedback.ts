import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth, requireRole("dispatcher"));

feedbackRouter.get("/", async (_req, res) => {
  const items = await prisma.feedback.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      job: {
        select: {
          id: true,
          title: true,
          kind: true,
          assignedTechnician: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const overallCount = items.length;
  const overallAverage = overallCount
    ? Math.round((items.reduce((sum, item) => sum + item.rating, 0) / overallCount) * 10) / 10
    : 0;

  const byTech = new Map<string, { id: string; name: string; ratings: number[] }>();
  for (const item of items) {
    const tech = item.job.assignedTechnician;
    if (!tech) {
      continue;
    }
    const row = byTech.get(tech.id) ?? { id: tech.id, name: tech.name, ratings: [] };
    row.ratings.push(item.rating);
    byTech.set(tech.id, row);
  }

  res.json({
    overall: { average: overallAverage, count: overallCount },
    technicians: [...byTech.values()].map((tech) => ({
      id: tech.id,
      name: tech.name,
      count: tech.ratings.length,
      average: Math.round((tech.ratings.reduce((sum, value) => sum + value, 0) / tech.ratings.length) * 10) / 10,
    })),
    feedback: items.map((item) => ({
      id: item.id,
      rating: item.rating,
      comment: item.comment,
      createdAt: item.createdAt,
      customerName: item.customer.name,
      jobId: item.job.id,
      jobTitle: item.job.title,
      kind: item.job.kind,
      technicianName: item.job.assignedTechnician?.name ?? null,
    })),
  });
});
