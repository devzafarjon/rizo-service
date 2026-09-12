import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Job, JobKind, JobStatus, Priority, User } from "../../lib/types";
import { todayIso } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../../i18n/LanguageContext";
import type { MessageKey } from "../../i18n/messages";
import { EmptyState, LoadError } from "../../components/EmptyState";
import { JobCard } from "../../components/JobCard";
import { JobDrawer } from "../../components/JobDrawer";
import { JobKanban } from "../../components/JobKanban";
import { PageTitle, SelectField, TextField } from "../../components/ui";

const STATUSES: JobStatus[] = ["new", "scheduled", "in_progress", "completed", "cancelled", "invoiced"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const KINDS: JobKind[] = ["installation", "maintenance", "repair"];
const OPEN: JobStatus[] = ["new", "scheduled", "in_progress"];

export function JobQueue({
  mine,
  listPath,
  title,
  subtitle,
  showTechnicianFilter,
  showCreate,
  groupedList,
}: {
  mine?: boolean;
  listPath: string;
  title: string;
  subtitle: string;
  showTechnicianFilter?: boolean;
  showCreate?: boolean;
  groupedList?: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [search, setSearch] = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const kind = search.get("kind") ?? "";
  const view = search.get("view") === "list" ? "list" : "board";
  const openJobId = search.get("job");

  function patchSearch(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(search);
    mutate(next);
    setSearch(next, { replace: true });
  }

  function setKind(value: string) {
    patchSearch((next) => {
      if (value) {
        next.set("kind", value);
      } else {
        next.delete("kind");
      }
    });
  }

  function setView(nextView: "board" | "list") {
    patchSearch((next) => {
      if (nextView === "list") {
        next.set("view", "list");
      } else {
        next.delete("view");
      }
    });
  }

  function openJob(jobId: string) {
    patchSearch((next) => {
      next.set("job", jobId);
    });
  }

  function closeJob() {
    patchSearch((next) => {
      next.delete("job");
    });
  }

  const params = new URLSearchParams();
  if (mine) {
    params.set("mine", "1");
  }
  if (q) {
    params.set("q", q);
  }
  if (kind) {
    params.set("kind", kind);
  }
  if (priority) {
    params.set("priority", priority);
  }
  if (technicianId) {
    params.set("technicianId", technicianId);
  }
  if (view === "list" && status) {
    params.set("status", status);
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["jobs", mine ? "mine" : "all", q, kind, priority, technicianId, view === "list" ? status : ""],
    queryFn: () => api<{ jobs: Job[] }>(`/jobs?${params.toString()}`),
    refetchInterval: 5000,
  });
  const techs = useQuery({
    queryKey: ["technicians"],
    queryFn: () => api<{ technicians: User[] }>("/dispatch/technicians"),
    enabled: Boolean(showTechnicianFilter),
  });

  const jobs = data?.jobs ?? [];
  const role = user?.role ?? "dispatcher";

  return (
    <div className="min-w-0">
      <PageTitle
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex w-full flex-wrap gap-2">
            <ScopeToggle mine={Boolean(mine)} />
            <ViewToggle view={view} onChange={setView} />
            {showCreate ? (
              <Link to="/jobs/new" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-[#B439FD] px-4 font-bold text-white hover:bg-[#CA73FD] sm:flex-none">
                {t("jobs.new")}
              </Link>
            ) : null}
          </div>
        }
      />

      <div className={`mb-6 grid gap-3 sm:grid-cols-2 ${showTechnicianFilter || view === "list" ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <TextField value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kanban.search")} />
        <SelectField value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("jobs.kind")}>
          <option value="">{t("jobs.kind")}: {t("common.all")}</option>
          {KINDS.map((item) => (
            <option key={item} value={item}>
              {t(`kind.${item}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        <SelectField value={priority} onChange={(e) => setPriority(e.target.value)} aria-label={t("jobs.priority")}>
          <option value="">{t("jobs.priority")}: {t("common.all")}</option>
          {PRIORITIES.map((item) => (
            <option key={item} value={item}>
              {t(`priority.${item}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        {showTechnicianFilter ? (
          <SelectField value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} aria-label={t("jobs.technician")}>
            <option value="">{t("jobs.technician")}: {t("common.all")}</option>
            {techs.data?.technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name}
              </option>
            ))}
          </SelectField>
        ) : null}
        {view === "list" ? (
          <SelectField value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("jobs.status")}>
            <option value="">{t("jobs.status")}: {t("common.all")}</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`status.${item}` as MessageKey)}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>

      {isError ? (
        <LoadError />
      ) : view === "board" ? (
        <JobKanban jobs={jobs} loading={isLoading} role={role} onOpen={openJob} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-36 animate-pulse rounded-3xl bg-gray-50" />
          <div className="h-36 animate-pulse rounded-3xl bg-gray-50" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState title={t("jobs.emptyTitle")} description={t("jobs.emptyDescription")} />
      ) : groupedList ? (
        <GroupedJobList jobs={jobs} onOpen={openJob} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onOpen={openJob} />
          ))}
        </div>
      )}

      <JobDrawer jobId={openJobId} listPath={listPath} onClose={closeJob} />
    </div>
  );
}

function ScopeToggle({ mine }: { mine: boolean }) {
  const { t } = useI18n();
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      <span className={`rounded-md px-2 py-2 text-xs font-bold sm:px-3 sm:text-sm ${mine ? "text-gray-400" : "bg-white text-[#9103E4]"}`}>
        {t("kanban.allJobs")}
      </span>
      <span className={`rounded-md px-2 py-2 text-xs font-bold sm:px-3 sm:text-sm ${mine ? "bg-white text-[#9103E4]" : "text-gray-400"}`}>
        {t("kanban.myJobs")}
      </span>
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: "board" | "list"; onChange: (view: "board" | "list") => void }) {
  const { t } = useI18n();
  const pill = (active: boolean) =>
    `rounded-md px-2 py-2 text-xs font-bold sm:px-3 sm:text-sm ${active ? "bg-white text-[#9103E4]" : "text-gray-500 hover:text-[#9103E4]"}`;
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      <button type="button" className={pill(view === "board")} onClick={() => onChange("board")}>
        {t("kanban.board")}
      </button>
      <button type="button" className={pill(view === "list")} onClick={() => onChange("list")}>
        {t("kanban.list")}
      </button>
    </div>
  );
}

function GroupedJobList({ jobs, onOpen }: { jobs: Job[]; onOpen: (jobId: string) => void }) {
  const { t } = useI18n();
  const today = todayIso();
  const visible = jobs.filter((job) => job.status !== "cancelled");
  const todayJobs = visible.filter(
    (job) =>
      job.status === "in_progress" ||
      (OPEN.includes(job.status) && (!job.scheduledDate || job.scheduledDate.slice(0, 10) <= today)),
  );
  const later = visible.filter(
    (job) =>
      job.status !== "in_progress" &&
      OPEN.includes(job.status) &&
      Boolean(job.scheduledDate && job.scheduledDate.slice(0, 10) > today),
  );
  const done = visible.filter((job) => job.status === "completed" || job.status === "invoiced");

  if (!visible.length) {
    return <EmptyState title={t("myJobs.emptyTitle")} description={t("myJobs.emptyDescription")} />;
  }

  return (
    <div className="grid max-w-xl gap-4">
      {todayJobs.length > 0 && (later.length > 0 || done.length > 0) ? (
        <h2 className="text-xl font-semibold text-black">{t("common.today")}</h2>
      ) : null}
      {todayJobs.map((job) => (
        <JobCard key={job.id} job={job} onOpen={onOpen} />
      ))}
      {later.length ? <h2 className="mt-4 text-xl font-semibold text-black">{t("myJobs.upcoming")}</h2> : null}
      {later.map((job) => (
        <JobCard key={job.id} job={job} onOpen={onOpen} />
      ))}
      {done.length ? <h2 className="mt-4 text-xl font-semibold text-black">{t("myJobs.done")}</h2> : null}
      {done.map((job) => (
        <JobCard key={job.id} job={job} onOpen={onOpen} />
      ))}
    </div>
  );
}
