import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { apiBase } from "./config";
import type { Job, JobStatus } from "./types";

let socket: Socket | null = null;

function getSocket() {
  if (!socket) {
    socket = io(apiBase() || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

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
  const queryClient = useQueryClient();

  useEffect(() => {
    const client = getSocket();

    function onUpdated(job: Job) {
      queryClient.setQueryData(["jobs", job.id], (current: { job: Job } | undefined) =>
        current?.job ? { job: { ...current.job, ...job } } : { job },
      );
      let seen = false;
      queryClient.setQueriesData({ queryKey: ["jobs"] }, (current) => {
        if (!current || typeof current !== "object" || !("jobs" in current) || !Array.isArray((current as { jobs: Job[] }).jobs)) {
          return current;
        }
        const list = (current as { jobs: Job[] }).jobs;
        if (!list.some((item) => item.id === job.id)) {
          return current;
        }
        seen = true;
        return { jobs: list.map((item) => (item.id === job.id ? { ...item, ...job } : item)) };
      });
      if (!seen) {
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }
      queryClient.invalidateQueries({ queryKey: ["dispatch"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }

    client.on("job:updated", onUpdated);
    return () => {
      client.off("job:updated", onUpdated);
    };
  }, [queryClient]);
}
