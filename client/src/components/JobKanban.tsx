import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Job, JobKind, JobStatus, Role } from "../lib/types";
import { jobWhen } from "../lib/format";
import { canMoveJob, daysInQueue, initials, JOB_STATUSES, priorityBorder } from "../lib/jobFlow";
import { patchJobStatus } from "../lib/socket";
import { useI18n } from "../i18n/LanguageContext";
import type { MessageKey } from "../i18n/messages";
import { useToast } from "./Toast";

const KIND_CHIP: Record<JobKind, string> = {
  installation: "bg-[#f6e9ff] text-[#9103E4]",
  maintenance: "bg-cyan-50 text-cyan-700",
  repair: "bg-orange-50 text-orange-700",
};

export function JobKanban({
  jobs,
  loading,
  role,
  onOpen,
}: {
  jobs: Job[];
  loading: boolean;
  role: Role;
  onOpen: (jobId: string) => void;
}) {
  const { t } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const grouped = useMemo(() => {
    const map = Object.fromEntries(JOB_STATUSES.map((status) => [status, [] as Job[]])) as Record<JobStatus, Job[]>;
    for (const job of jobs) {
      map[job.status].push(job);
    }
    return map;
  }, [jobs]);

  const activeJob = jobs.find((job) => job.id === activeId) ?? null;

  const move = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: JobStatus }) =>
      api<{ job: Job }>(`/jobs/${jobId}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onMutate: async ({ jobId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["jobs"] });
      queryClient.setQueriesData({ queryKey: ["jobs"] }, (current) => patchJobStatus(current, jobId, status));
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      notify(t("jobs.failed"), "error");
    },
    onSuccess: (result, variables) => {
      notify(t("kanban.moved", { status: t(`kanban.col.${variables.status}` as MessageKey) }));
      queryClient.setQueryData(["jobs", result.job.id], result);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function resolveStatus(overId: string | undefined): JobStatus | null {
    if (!overId) {
      return null;
    }
    if (JOB_STATUSES.includes(overId as JobStatus)) {
      return overId as JobStatus;
    }
    return jobs.find((job) => job.id === overId)?.status ?? null;
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragCancel() {
    setActiveId(null);
  }

  function onDragEnd(event: DragEndEvent) {
    const jobId = String(event.active.id);
    const job = jobs.find((item) => item.id === jobId);
    const next = resolveStatus(event.over?.id ? String(event.over.id) : undefined);
    setActiveId(null);
    if (!job || !next || !canMoveJob(job.status, next, role)) {
      return;
    }
    move.mutate({ jobId, status: next });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      <div className="flex min-h-[32rem] gap-3 overflow-x-auto pb-4">
        {JOB_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            jobs={grouped[status]}
            loading={loading}
            accept={activeJob ? canMoveJob(activeJob.status, status, role) : false}
            title={t(`kanban.col.${status}` as MessageKey)}
            empty={t("kanban.empty")}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>{activeJob ? <KanbanCardFace job={activeJob} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  jobs,
  loading,
  accept,
  title,
  empty,
  onOpen,
}: {
  status: JobStatus;
  jobs: Job[];
  loading: boolean;
  accept: boolean;
  title: string;
  empty: string;
  onOpen: (jobId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={`flex w-[min(86vw,18rem)] shrink-0 flex-col rounded-2xl bg-gray-50 md:w-72 ${
        isOver && accept ? "ring-2 ring-[#B439FD]/40" : ""
      }`}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-3">
        <h2 className="text-sm font-bold text-black">{title}</h2>
        <span className="inline-flex min-w-6 items-center justify-center rounded-lg bg-[#f6e9ff] px-2 py-0.5 text-xs font-bold text-[#9103E4]">
          {jobs.length}
        </span>
      </header>
      <div className="flex max-h-[min(70dvh,40rem)] flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : jobs.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-8 text-center text-sm text-gray-500 shadow-[0_0_10px_rgba(0,0,0,0.04)]">
            {empty}
          </p>
        ) : (
          jobs.map((job) => <KanbanCard key={job.id} job={job} onOpen={onOpen} />)
        )}
      </div>
    </section>
  );
}

function KanbanCard({ job, onOpen }: { job: Job; onOpen: (jobId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={isDragging ? "cursor-grabbing opacity-40" : "cursor-grab"}
      onClick={() => {
        if (!isDragging) {
          onOpen(job.id);
        }
      }}
      {...listeners}
      {...attributes}
    >
      <KanbanCardFace job={job} />
    </div>
  );
}

function KanbanCardFace({ job, overlay }: { job: Job; overlay?: boolean }) {
  const { t } = useI18n();
  const waiting = !job.scheduledDate;
  const days = daysInQueue(job.createdAt);

  return (
    <article
      className={`overflow-hidden rounded-2xl border-l-4 bg-white p-3 text-left shadow-[0_0_10px_rgba(0,0,0,0.08)] ${priorityBorder(job.priority)} ${
        overlay ? "w-72 rotate-1 shadow-[0_0_18px_rgba(180,57,253,0.18)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-black">{job.customer.name}</p>
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${KIND_CHIP[job.kind]}`}>
          {t(`kind.${job.kind}` as MessageKey)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{job.title}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-gray-600">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f6e9ff] text-[11px] font-bold text-[#9103E4]">
            {job.assignedTechnician ? initials(job.assignedTechnician.name) : "—"}
          </span>
          <span className="truncate">{job.assignedTechnician?.name ?? t("jobs.unassigned")}</span>
        </span>
        <span className="shrink-0 text-[11px] font-bold text-gray-500">{t(`priority.${job.priority}` as MessageKey)}</span>
      </div>
      <p className="mt-2 text-xs text-gray-500">
          {waiting ? (days === 0 ? t("kanban.waitingToday") : t("kanban.waitingDays", { days: String(days) })) : jobWhen(job)}
        {job.kind === "installation" && job.orderRef ? ` · ${job.orderRef}` : ""}
      </p>
      {job.submittedByCustomer ? (
        <span className="mt-2 inline-flex rounded-lg bg-[#f6e9ff] px-2 py-0.5 text-[11px] font-bold text-[#9103E4]">
          {t("jobs.fromCustomer")}
        </span>
      ) : null}
    </article>
  );
}

function SkeletonCard() {
  return <div className="h-28 animate-pulse rounded-2xl bg-white shadow-[0_0_10px_rgba(0,0,0,0.04)]" />;
}
