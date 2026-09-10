import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Job } from "../../lib/types";
import { todayIso } from "../../lib/format";
import { useI18n } from "../../i18n/LanguageContext";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { PageTitle } from "../../components/ui";
import { JobCard } from "../../components/JobCard";
import { JobWorkspace } from "../../components/JobWorkspace";

export function MyJobsPage() {
  const { t } = useI18n();
  const today = todayIso();
  const { data, isLoading } = useQuery({
    queryKey: ["jobs", "mine"],
    queryFn: () => api<{ jobs: Job[] }>("/jobs?mine=1"),
    refetchInterval: 4000,
  });

  const jobs = data?.jobs.filter((job) => job.status !== "cancelled") ?? [];
  const open = ["new", "scheduled", "in_progress"];
  const todayJobs = jobs.filter(
    (job) => open.includes(job.status) && (!job.scheduledDate || job.scheduledDate.slice(0, 10) <= today),
  );
  const later = jobs.filter(
    (job) => open.includes(job.status) && Boolean(job.scheduledDate && job.scheduledDate.slice(0, 10) > today),
  );
  const done = jobs.filter((job) => job.status === "completed" || job.status === "invoiced");

  return (
    <div>
      <PageTitle title={t("myJobs.title")} subtitle={t("myJobs.subtitle")} />
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState title={t("myJobs.emptyTitle")} description={t("myJobs.emptyDescription")} />
      ) : (
        <div className="grid max-w-xl gap-4">
          {todayJobs.map((job) => (
            <JobCard key={job.id} job={job} to={`/my-jobs/${job.id}`} />
          ))}
          {later.length ? <h2 className="mt-4 text-xl font-semibold text-black">{t("myJobs.upcoming")}</h2> : null}
          {later.map((job) => (
            <JobCard key={job.id} job={job} to={`/my-jobs/${job.id}`} />
          ))}
          {done.length ? <h2 className="mt-4 text-xl font-semibold text-black">{t("myJobs.done")}</h2> : null}
          {done.map((job) => (
            <JobCard key={job.id} job={job} to={`/my-jobs/${job.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TechnicianJobPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["jobs", id],
    queryFn: () => api<{ job: Job }>(`/jobs/${id}`),
    refetchInterval: 4000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
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
