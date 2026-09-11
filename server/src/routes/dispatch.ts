import { Router } from "express";
import { z } from "zod";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { calendarDate, emitJobUpdated, jobInclude, serializeJob, startOfDay } from "../lib/jobs.ts";
import { toPublicUser } from "../lib/users.ts";

export const dispatchRouter = Router();
dispatchRouter.use(requireAuth, requireRole("dispatcher"));

dispatchRouter.get("/technicians", async (_req, res) => {
  const technicians = await prisma.user.findMany({
    where: { role: "technician" },
    orderBy: { name: "asc" },
  });
  res.json({ technicians: technicians.map(toPublicUser) });
});

dispatchRouter.get("/", async (req, res) => {
  const date = String(req.query.date ?? calendarDate());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }

  const day = startOfDay(date);
  const technicians = await prisma.user.findMany({
    where: { role: "technician" },
    orderBy: { name: "asc" },
  });

  const jobs = await prisma.job.findMany({
    where: {
      status: { in: ["new", "scheduled", "in_progress"] },
      OR: [{ scheduledDate: day }, { scheduledDate: null, status: "new" }],
    },
    include: jobInclude,
    orderBy: [{ scheduledTimeStart: "asc" }, { createdAt: "asc" }],
  });

  res.json({
    date,
    technicians: technicians.map(toPublicUser),
    jobs: jobs.map(serializeJob),
  });
});

dispatchRouter.post("/auto-plan", async (req, res) => {
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }

  const day = startOfDay(parsed.data.date);
  const technicians = await prisma.user.findMany({
    where: { role: "technician" },
    orderBy: { name: "asc" },
  });
  if (technicians.length === 0) {
    res.status(400).json({ error: "No technicians" });
    return;
  }

  const open = await prisma.job.findMany({
    where: {
      assignedTechnicianId: null,
      status: { in: ["new", "scheduled"] },
      OR: [{ scheduledDate: day }, { scheduledDate: null }],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  const load = new Map(technicians.map((tech) => [tech.id, 0]));
  const existing = await prisma.job.groupBy({
    by: ["assignedTechnicianId"],
    where: {
      scheduledDate: day,
      assignedTechnicianId: { not: null },
      status: { notIn: ["cancelled"] },
    },
    _count: { _all: true },
  });
  for (const row of existing) {
    if (row.assignedTechnicianId) {
      load.set(row.assignedTechnicianId, row._count._all);
    }
  }

  const updatedJobs = [];
  for (const job of open) {
    let best = technicians[0];
    for (const tech of technicians) {
      if ((load.get(tech.id) ?? 0) < (load.get(best.id) ?? 0)) {
        best = tech;
      }
    }
    const updated = await prisma.job.update({
      where: { id: job.id },
      data: {
        assignedTechnicianId: best.id,
        scheduledDate: day,
        status: "scheduled",
      },
      include: jobInclude,
    });
    load.set(best.id, (load.get(best.id) ?? 0) + 1);
    const serialized = serializeJob(updated);
    updatedJobs.push(serialized);
    emitJobUpdated(req.app.get("io") as Server | undefined, serialized);
  }

  res.json({ assigned: updatedJobs.length, jobs: updatedJobs });
});
