import { Link } from "react-router-dom";
import type { Job, JobKind, JobStatus, Priority } from "../lib/types";
import { jobWhen, kindDot, priorityDot, statusDot } from "../lib/format";
import { useI18n } from "../i18n/LanguageContext";
import type { MessageKey } from "../i18n/messages";

export function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-600">
      <span className={`h-2.5 w-2.5 rounded-full ${statusDot(status)}`} />
      {t(`status.${status}` as MessageKey)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-600">
      <span className={`h-2.5 w-2.5 rounded-full ${priorityDot(priority)}`} />
      {t(`priority.${priority}` as MessageKey)}
    </span>
  );
}

export function KindBadge({ kind }: { kind: JobKind }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-600">
      <span className={`h-2.5 w-2.5 rounded-full ${kindDot(kind)}`} />
      {t(`kind.${kind}` as MessageKey)}
    </span>
  );
}

export function JobCard({
  job,
  to,
  compact,
  onOpen,
}: {
  job: Job;
  to?: string;
  compact?: boolean;
  onOpen?: (jobId: string) => void;
}) {
  const { t } = useI18n();
  const card = (
    <div className="relative overflow-hidden rounded-3xl bg-white p-5 shadow-[0_0_10px_rgba(0,0,0,0.1)] transition hover:shadow-[0_0_16px_rgba(0,0,0,0.12)]">
      <span className={`absolute top-4 right-4 h-3.5 w-3.5 rounded-full ${priorityDot(job.priority)}`} />
      <p className="pr-6 font-semibold text-black">{job.title}</p>
      <p className="mt-1 text-sm text-gray-600">
        {job.customer.name} · {job.location.city}
        {job.kind === "installation" && job.orderRef ? ` · ${job.orderRef}` : ""}
      </p>
      {compact ? null : (
        <p className="mt-1 text-sm text-gray-500">
          {jobWhen(job)} · {job.assignedTechnician?.name ?? "—"}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <KindBadge kind={job.kind} />
        <StatusBadge status={job.status} />
        {job.submittedByCustomer ? (
          <span className="inline-flex items-center rounded-lg bg-[#f6e9ff] px-2 py-0.5 text-xs font-bold text-[#9103E4]">
            {t("jobs.fromCustomer")}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (onOpen) {
    return (
      <button type="button" className="block w-full text-left" onClick={() => onOpen(job.id)}>
        {card}
      </button>
    );
  }

  return (
    <Link to={to ?? `/jobs/${job.id}`} className="block">
      {card}
    </Link>
  );
}
