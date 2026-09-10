import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Job, User } from "../../lib/types";
import { jobWhen, priorityDot, todayIso } from "../../lib/format";
import { useI18n } from "../../i18n/LanguageContext";
import { useToast } from "../../components/Toast";
import { PageTitle, PrimaryButton, SelectField, TextField } from "../../components/ui";
import { Spinner } from "../../components/Spinner";

type Board = { date: string; technicians: User[]; jobs: Job[] };

export function DispatchPage() {
  const { t } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());

  const { data, isLoading } = useQuery({
    queryKey: ["dispatch", date],
    queryFn: () => api<Board>(`/dispatch?date=${date}`),
    refetchInterval: 4000,
  });

  const assign = useMutation({
    mutationFn: ({ jobId, technicianId }: { jobId: string; technicianId: string | null }) =>
      api(`/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedTechnicianId: technicianId, scheduledDate: date }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispatch"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => notify(t("jobs.failed"), "error"),
  });

  const autoPlan = useMutation({
    mutationFn: () => api("/dispatch/auto-plan", { method: "POST", body: JSON.stringify({ date }) }),
    onSuccess: () => {
      notify(t("dispatch.autoPlanned"));
      queryClient.invalidateQueries({ queryKey: ["dispatch"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: () => notify(t("jobs.failed"), "error"),
  });

  function onDrop(technicianId: string | null, event: DragEvent) {
    event.preventDefault();
    const jobId = event.dataTransfer.getData("text/plain").trim();
    if (jobId) {
      assign.mutate({ jobId, technicianId });
    }
  }

  const unassigned = data?.jobs.filter((job) => !job.assignedTechnicianId) ?? [];
  const technicians = data?.technicians ?? [];

  return (
    <div>
      <PageTitle
        title={t("dispatch.title")}
        subtitle={t("dispatch.subtitle")}
        actions={
          <>
            <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
            <PrimaryButton onClick={() => autoPlan.mutate()} disabled={autoPlan.isPending}>
              {t("dispatch.autoPlan")}
            </PrimaryButton>
            <Link to="/jobs/new" className="inline-flex min-h-11 items-center rounded-lg bg-gray-100 px-4 font-bold text-[#B439FD] hover:bg-gray-200">
              {t("jobs.new")}
            </Link>
          </>
        }
      />

      {isLoading || !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_repeat(auto-fit,minmax(220px,1fr))]">
          <BoardColumn
            title={t("dispatch.unassigned")}
            jobs={unassigned}
            technicians={technicians}
            assignLabel={t("dispatch.assignTo")}
            unassignedLabel={t("jobs.unassigned")}
            onAssign={(jobId, technicianId) => assign.mutate({ jobId, technicianId })}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => onDrop(null, e)}
            empty={t("dispatch.dropHere")}
          />
          {technicians.map((tech) => (
            <BoardColumn
              key={tech.id}
              title={tech.name}
              jobs={data.jobs.filter((job) => job.assignedTechnicianId === tech.id)}
              technicians={technicians}
              assignLabel={t("dispatch.assignTo")}
              unassignedLabel={t("jobs.unassigned")}
              onAssign={(jobId, technicianId) => assign.mutate({ jobId, technicianId })}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => onDrop(tech.id, e)}
              empty={t("dispatch.dropHere")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  title,
  jobs,
  empty,
  technicians,
  assignLabel,
  unassignedLabel,
  onAssign,
  onDragOver,
  onDrop,
}: {
  title: string;
  jobs: Job[];
  empty: string;
  technicians: User[];
  assignLabel: string;
  unassignedLabel: string;
  onAssign: (jobId: string, technicianId: string | null) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}) {
  return (
    <section
      className="min-h-72 rounded-3xl bg-white p-4 shadow-[0_0_10px_rgba(0,0,0,0.1)]"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <h2 className="mb-4 text-lg font-semibold text-black">{title}</h2>
      <div className="space-y-3">
        {jobs.map((job) => (
          <article
            key={job.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", job.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            className="cursor-grab rounded-2xl bg-gray-50 p-3 active:cursor-grabbing"
          >
            <span className={`mb-2 inline-block h-2.5 w-2.5 rounded-full ${priorityDot(job.priority)}`} />
            <Link to={`/jobs/${job.id}`} className="block font-bold text-black">
              {job.title}
            </Link>
            <p className="text-sm text-gray-600">{job.customer.name}</p>
            <p className="text-xs text-gray-500">{jobWhen(job)}</p>
            <label className="mt-2 block" onPointerDown={(event) => event.stopPropagation()}>
              <span className="sr-only">{assignLabel}</span>
              <SelectField
                value={job.assignedTechnicianId ?? ""}
                draggable={false}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onAssign(job.id, event.target.value || null)}
                className="mt-1 h-9 text-xs"
              >
                <option value="">{unassignedLabel}</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </SelectField>
            </label>
          </article>
        ))}
        {jobs.length === 0 ? <p className="text-sm text-gray-400">{empty}</p> : null}
      </div>
    </section>
  );
}
