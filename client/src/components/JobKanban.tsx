import { useEffect, useMemo, useRef, useState } from "react";
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
  const [allowDrag, setAllowDrag] = useState(false);
  const draggedIdRef = useRef<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setAllowDrag(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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
    draggedIdRef.current = String(event.active.id);
    setActiveId(String(event.active.id));
  }

  function clearDragClick(jobId: string) {
    window.setTimeout(() => {
      if (draggedIdRef.current === jobId) {
        draggedIdRef.current = null;
      }
    }, 400);
  }

  function onDragCancel() {
    const jobId = activeId;
    setActiveId(null);
    if (jobId) {
      clearDragClick(jobId);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const jobId = String(event.active.id);
    const job = jobs.find((item) => item.id === jobId);
    const next = resolveStatus(event.over?.id ? String(event.over.id) : undefined);
    setActiveId(null);
    clearDragClick(jobId);
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
      <div className="-mx-3 flex min-h-[28rem] w-auto min-w-0 max-w-none snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-3 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {JOB_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            jobs={grouped[status]}
            loading={loading}
            accept={activeJob ? canMoveJob(activeJob.status, status, role) : false}
            title={t(`kanban.col.${status}` as MessageKey)}
            empty={t("kanban.empty")}
            allowDrag={allowDrag}
            role={role}
            onOpen={onOpen}
            onMove={(jobId, next) => move.mutate({ jobId, status: next })}
            consumeDragClick={(jobId) => {
              if (draggedIdRef.current === jobId) {
                draggedIdRef.current = null;
                return true;
              }
              return false;
            }}
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
  allowDrag,
  role,
  onOpen,
  onMove,
  consumeDragClick,
}: {
  status: JobStatus;
  jobs: Job[];
  loading: boolean;
  accept: boolean;
  title: string;
  empty: string;
  allowDrag: boolean;
  role: Role;
  onOpen: (jobId: string) => void;
  onMove: (jobId: string, status: JobStatus) => void;
  consumeDragClick: (jobId: string) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={`flex w-[min(82vw,17.5rem)] shrink-0 snap-start flex-col rounded-2xl bg-gray-50 sm:w-72 ${
        isOver && accept ? "ring-2 ring-[#B439FD]/40" : ""
      }`}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-3">
        <h2 className="truncate text-sm font-bold text-black">{title}</h2>
        <span className="inline-flex min-w-6 items-center justify-center rounded-lg bg-[#f6e9ff] px-2 py-0.5 text-xs font-bold text-[#9103E4]">
          {jobs.length}
        </span>
      </header>
      <div className="flex max-h-[min(62dvh,38rem)] flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
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
          jobs.map((job) => (
            <KanbanCard
              key={job.id}
              job={job}
              allowDrag={allowDrag}
              role={role}
              onOpen={onOpen}
              onMove={onMove}
              consumeDragClick={consumeDragClick}
            />
          ))
        )}
      </div>
    </section>
  );
}

function KanbanCard({
  job,
  allowDrag,
  role,
  onOpen,
  onMove,
  consumeDragClick,
}: {
  job: Job;
  allowDrag: boolean;
  role: Role;
  onOpen: (jobId: string) => void;
  onMove: (jobId: string, status: JobStatus) => void;
  consumeDragClick: (jobId: string) => boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    disabled: !allowDrag,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={allowDrag ? (isDragging ? "cursor-grabbing opacity-40" : "cursor-grab") : undefined}
      role={allowDrag ? undefined : "button"}
      tabIndex={allowDrag ? undefined : 0}
      onClick={() => {
        if (isDragging || consumeDragClick(job.id)) {
          return;
        }
        onOpen(job.id);
      }}
      onKeyDown={(event) => {
        if (allowDrag) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(job.id);
        }
      }}
      {...(allowDrag ? { ...listeners, ...attributes } : {})}
    >
      <KanbanCardFace job={job} allowDrag={allowDrag} role={role} onMove={onMove} />
    </div>
  );
}

function KanbanCardFace({
  job,
  overlay,
  allowDrag,
  role,
  onMove,
}: {
  job: Job;
  overlay?: boolean;
  allowDrag?: boolean;
  role?: Role;
  onMove?: (jobId: string, status: JobStatus) => void;
}) {
  const { t } = useI18n();
  const waiting = !job.scheduledDate;
  const days = daysInQueue(job.createdAt);
  const moves = role ? JOB_STATUSES.filter((status) => canMoveJob(job.status, status, role)) : [];

  return (
    <article
      className={`overflow-hidden rounded-2xl border-l-4 bg-white p-3 text-left shadow-[0_0_10px_rgba(0,0,0,0.08)] ${priorityBorder(job.priority)} ${
        overlay ? "w-72 rotate-1 shadow-[0_0_18px_rgba(180,57,253,0.18)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-semibold text-black">{job.customer.name}</p>
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${KIND_CHIP[job.kind]}`}>
          {t(`kind.short.${job.kind}` as MessageKey)}
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
      {!allowDrag && !overlay && onMove && moves.length > 0 ? (
        <label className="mt-3 block" onClick={(event) => event.stopPropagation()}>
          <span className="sr-only">{t("kanban.moveTo")}</span>
          <select
            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm text-black"
            value={job.status}
            onChange={(event) => onMove(job.id, event.target.value as JobStatus)}
          >
            <option value={job.status}>{t(`kanban.col.${job.status}` as MessageKey)}</option>
            {moves.map((status) => (
              <option key={status} value={status}>
                {t(`kanban.col.${status}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </article>
  );
}

function SkeletonCard() {
  return <div className="h-28 animate-pulse rounded-2xl bg-white shadow-[0_0_10px_rgba(0,0,0,0.04)]" />;
}
