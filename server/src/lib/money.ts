import type { Prisma } from "@prisma/client";

export const LABOR_RATE = 150_000;

export function asNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

export function hoursBetween(start: Date, end: Date) {
  const ms = Math.max(0, end.getTime() - start.getTime());
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export function laborHoursFor(job: {
  startedAt: Date | null;
  scheduledTimeStart: string | null;
  scheduledTimeEnd: string | null;
}, now: Date) {
  if (job.startedAt) {
    const hours = hoursBetween(job.startedAt, now);
    if (hours > 0 && hours <= 8) {
      return hours;
    }
  }
  if (job.scheduledTimeStart && job.scheduledTimeEnd) {
    const [startH, startM] = job.scheduledTimeStart.split(":").map(Number);
    const [endH, endM] = job.scheduledTimeEnd.split(":").map(Number);
    const minutes = Math.max(30, endH * 60 + endM - (startH * 60 + startM));
    return Math.round((minutes / 60) * 100) / 100;
  }
  return 1;
}

export function invoiceAmount(parts: Array<{ quantity: number; unitCost: Prisma.Decimal | number }>, laborHours: number | null) {
  const partsTotal = parts.reduce((sum, part) => sum + part.quantity * Number(part.unitCost), 0);
  const laborTotal = (laborHours ?? 0) * LABOR_RATE;
  return Math.round((partsTotal + laborTotal) * 100) / 100;
}
