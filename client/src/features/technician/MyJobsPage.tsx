import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Job } from "../../lib/types";
import { useI18n } from "../../i18n/LanguageContext";
import { LoadError } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { JobWorkspace } from "../../components/JobWorkspace";
import { JobQueue } from "../jobs/JobQueue";

export function MyJobsPage() {
  const { t } = useI18n();
  return (
    <JobQueue
      mine
      listPath="/my-jobs"
      title={t("myJobs.title")}
      subtitle={t("myJobs.subtitle")}
      groupedList
    />
  );
}

export function TechnicianJobPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["jobs", id],
    queryFn: () => api<{ job: Job }>(`/jobs/${id}`),
    refetchInterval: 4000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return <LoadError />;
  }

  return (
    <div>
      <Link to="/my-jobs" className="mb-6 inline-block font-bold text-[#B439FD]">
        ← {t("common.back")}
      </Link>
      <JobWorkspace job={data.job} backTo="/my-jobs" />
    </div>
  );
}
