import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Job } from "../lib/types";
import { isClosedJob } from "../lib/format";
import { useI18n } from "../i18n/LanguageContext";
import { useAuth } from "../features/auth/AuthContext";
import { LoadError } from "./EmptyState";
import { Spinner } from "./Spinner";
import { JobWorkspace } from "./JobWorkspace";

export function JobDrawer({
  jobId,
  listPath,
  onClose,
}: {
  jobId: string | null;
  listPath: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const enabled = Boolean(jobId);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => api<{ job: Job }>(`/jobs/${jobId}`),
    enabled,
    refetchInterval: enabled ? 4000 : false,
  });

  useEffect(() => {
    if (!jobId) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [jobId, onClose]);

  if (!jobId) {
    return null;
  }

  const job = data?.job;
  const pageTo = user?.role === "technician" ? `${listPath}/${jobId}` : `/jobs/${jobId}`;
  const editTo = `/jobs/${jobId}/edit`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label={t("common.closeMenu")} onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-[0_0_24px_rgba(0,0,0,0.16)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-6">
          <button type="button" className="font-bold text-[#B439FD]" onClick={onClose}>
            ← {t("common.back")}
          </button>
          <div className="flex flex-wrap gap-2">
            <Link to={pageTo} className="inline-flex min-h-11 items-center rounded-lg bg-gray-100 px-4 font-bold text-[#B439FD] hover:bg-gray-200">
              {t("kanban.openPage")}
            </Link>
            {job && !isClosedJob(job.status) && user?.role === "dispatcher" ? (
              <Link to={editTo} className="inline-flex min-h-11 items-center rounded-lg bg-gray-100 px-4 font-bold text-[#B439FD] hover:bg-gray-200">
                {t("common.edit")}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : isError || !job ? (
            <LoadError />
          ) : (
            <JobWorkspace job={job} backTo={listPath} />
          )}
        </div>
      </aside>
    </div>
  );
}
