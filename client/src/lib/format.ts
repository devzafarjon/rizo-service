import type { JobStatus, Priority } from "./types";

export function money(amount: number, locale = "uz") {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "uz-UZ", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount) + " so‘m";
}

export function jobDate(value: string | null) {
  if (!value) {
    return "—";
  }
  return value.slice(0, 10);
}

export function jobWhen(job: { scheduledDate: string | null; scheduledTimeStart: string | null; scheduledTimeEnd: string | null }) {
  const date = jobDate(job.scheduledDate);
  if (!job.scheduledTimeStart) {
    return date;
  }
  return `${date} ${job.scheduledTimeStart}${job.scheduledTimeEnd ? `–${job.scheduledTimeEnd}` : ""}`;
}

export function mapsUrl(location: { address: string; city: string; lat: number | null; lng: number | null }) {
  if (location.lat != null && location.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${location.address}, ${location.city}`)}`;
}

export function statusDot(status: JobStatus) {
  switch (status) {
    case "new":
      return "bg-gray-400";
    case "scheduled":
      return "bg-blue-400";
    case "in_progress":
      return "bg-[#B439FD]";
    case "completed":
      return "bg-green-400";
    case "cancelled":
      return "bg-red-400";
    case "invoiced":
      return "bg-pink-400";
    default:
      return "bg-gray-400";
  }
}

export function priorityDot(priority: Priority) {
  switch (priority) {
    case "urgent":
      return "bg-red-400";
    case "high":
      return "bg-orange-400";
    case "medium":
      return "bg-yellow-400";
    default:
      return "bg-green-400";
  }
}

export function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
