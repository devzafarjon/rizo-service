import type { JobStatus, Role } from "./types";

export const JOB_STATUSES: JobStatus[] = ["new", "scheduled", "in_progress", "completed", "cancelled", "invoiced"];

const STATUS_FLOW: Record<JobStatus, JobStatus[]> = {
  new: ["scheduled", "in_progress", "cancelled"],
  scheduled: ["new", "in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["invoiced"],
  cancelled: [],
  invoiced: [],
};

export function canTransition(from: JobStatus, to: JobStatus) {
  return from !== to && STATUS_FLOW[from].includes(to);
}

export function canMoveJob(from: JobStatus, to: JobStatus, role: Role) {
  if (from === to) {
    return false;
  }
  if (role === "technician") {
    return (
      (to === "in_progress" && (from === "new" || from === "scheduled")) ||
      (to === "completed" && from === "in_progress")
    );
  }
  return canTransition(from, to);
}

export function daysInQueue(createdAt: string) {
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function priorityBorder(priority: string) {
  switch (priority) {
    case "urgent":
      return "border-l-red-400";
    case "high":
      return "border-l-orange-400";
    case "medium":
      return "border-l-yellow-400";
    default:
      return "border-l-green-400";
  }
}
