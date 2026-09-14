import type { Job, JobStatus } from "./types";

export function patchJobInCache(current: unknown, jobId: string, patch: Partial<Job>) {
  if (!current || typeof current !== "object") {
    return current;
  }
  if ("jobs" in current && Array.isArray((current as { jobs: Job[] }).jobs)) {
    return {
      jobs: (current as { jobs: Job[] }).jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job)),
    };
  }
  if ("job" in current && (current as { job: Job }).job?.id === jobId) {
    return { job: { ...(current as { job: Job }).job, ...patch } };
  }
  return current;
}

export function patchJobStatus(current: unknown, jobId: string, status: JobStatus) {
  return patchJobInCache(current, jobId, { status });
}

export function useJobSocket() {
  // Demo mode has no live socket server.
}
