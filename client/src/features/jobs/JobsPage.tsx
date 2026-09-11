import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Customer, Job, JobKind, JobStatus, Priority, User } from "../../lib/types";
import { isClosedJob } from "../../lib/format";
import { useI18n } from "../../i18n/LanguageContext";
import type { MessageKey } from "../../i18n/messages";
import { useToast } from "../../components/Toast";
import { EmptyState, LoadError } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Card, GhostButton, Label, PageTitle, PrimaryButton, SelectField, TextArea, TextField } from "../../components/ui";
import { JobCard } from "../../components/JobCard";
import { JobWorkspace } from "../../components/JobWorkspace";

const STATUSES: JobStatus[] = ["new", "scheduled", "in_progress", "completed", "cancelled", "invoiced"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const KINDS: JobKind[] = ["installation", "maintenance", "repair"];

export function JobsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const kind = search.get("kind") ?? "";
  const [technicianId, setTechnicianId] = useState("");

  function setKind(value: string) {
    const next = new URLSearchParams(search);
    if (value) {
      next.set("kind", value);
    } else {
      next.delete("kind");
    }
    setSearch(next, { replace: true });
  }
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  if (technicianId) params.set("technicianId", technicianId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["jobs", q, status, kind, technicianId],
    queryFn: () => api<{ jobs: Job[] }>(`/jobs?${params.toString()}`),
  });
  const techs = useQuery({
    queryKey: ["technicians"],
    queryFn: () => api<{ technicians: User[] }>("/dispatch/technicians"),
  });

  return (
    <div>
      <PageTitle
        title={t("jobs.title")}
        subtitle={t("jobs.subtitle")}
        actions={
          <Link to="/jobs/new" className="inline-flex min-h-11 items-center rounded-lg bg-[#B439FD] px-4 font-bold text-white hover:bg-[#CA73FD]">
            {t("jobs.new")}
          </Link>
        }
      />
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TextField value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} />
        <SelectField value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t("common.all")}</option>
          {KINDS.map((item) => (
            <option key={item} value={item}>
              {t(`kind.${item}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        <SelectField value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("common.all")}</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {t(`status.${item}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        <SelectField value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
          <option value="">{t("common.all")}</option>
          {techs.data?.technicians.map((tech) => (
            <option key={tech.id} value={tech.id}>
              {tech.name}
            </option>
          ))}
        </SelectField>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : isError ? (
        <LoadError />
      ) : !data?.jobs.length ? (
        <EmptyState title={t("jobs.emptyTitle")} description={t("jobs.emptyDescription")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.jobs.map((job) => (
            <JobCard key={job.id} job={job} to={`/jobs/${job.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function JobFormPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const customersQuery = useQuery({
    queryKey: ["customers", ""],
    queryFn: () => api<{ customers: Customer[] }>("/customers"),
  });
  const techsQuery = useQuery({
    queryKey: ["technicians"],
    queryFn: () => api<{ technicians: User[] }>("/dispatch/technicians"),
  });
  const jobQuery = useQuery({
    queryKey: ["jobs", id],
    queryFn: () => api<{ job: Job }>(`/jobs/${id}`),
    enabled: isEdit,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<JobKind>(
    KINDS.includes(search.get("kind") as JobKind) ? (search.get("kind") as JobKind) : "repair",
  );
  const [orderRef, setOrderRef] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [customerId, setCustomerId] = useState(search.get("customerId") ?? "");
  const [locationId, setLocationId] = useState("");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTimeStart, setScheduledTimeStart] = useState("");
  const [scheduledTimeEnd, setScheduledTimeEnd] = useState("");
  const [filled, setFilled] = useState(false);

  function defaultTitleFor(next: JobKind) {
    if (next === "installation") {
      return t("jobs.defaultInstallTitle");
    }
    if (next === "maintenance") {
      return t("jobs.defaultMaintenanceTitle");
    }
    return t("jobs.defaultRepairTitle");
  }

  function isDefaultTitle(value: string) {
    return !value || value === t("jobs.defaultInstallTitle") || value === t("jobs.defaultMaintenanceTitle") || value === t("jobs.defaultRepairTitle");
  }

  useEffect(() => {
    if (isEdit) {
      return;
    }
    const fromUrl = search.get("kind");
    if (KINDS.includes(fromUrl as JobKind)) {
      const next = fromUrl as JobKind;
      setKind(next);
      setTitle((current) => (isDefaultTitle(current) ? defaultTitleFor(next) : current));
    }
  }, [search, isEdit, t]);

  useEffect(() => {
    if (isEdit) {
      return;
    }
    setTitle((current) => current || defaultTitleFor(kind));
  }, []);

  useEffect(() => {
    if (jobQuery.data && !filled) {
      const job = jobQuery.data.job;
      setTitle(job.title);
      setDescription(job.description ?? "");
      setKind(job.kind);
      setOrderRef(job.orderRef ?? "");
      setPriority(job.priority);
      setCustomerId(job.customerId);
      setLocationId(job.locationId);
      setAssignedTechnicianId(job.assignedTechnicianId ?? "");
      setScheduledDate(job.scheduledDate?.slice(0, 10) ?? "");
      setScheduledTimeStart(job.scheduledTimeStart ?? "");
      setScheduledTimeEnd(job.scheduledTimeEnd ?? "");
      setFilled(true);
    }
  }, [jobQuery.data, filled]);

  const customers = customersQuery.data?.customers ?? [];
  const selectedCustomer = customers.find((item) => item.id === customerId);
  const locations = useMemo(
    () => selectedCustomer?.locations ?? [],
    [selectedCustomer],
  );

  useEffect(() => {
    if (isEdit || kind !== "maintenance" || scheduledDate || !selectedCustomer?.nextMaintenanceOn) {
      return;
    }
    setScheduledDate(selectedCustomer.nextMaintenanceOn.slice(0, 10));
  }, [isEdit, kind, scheduledDate, selectedCustomer]);

  useEffect(() => {
    if (!locationId && locations[0]) {
      setLocationId(locations[0].id);
    }
  }, [locations, locationId]);

  const save = useMutation({
    mutationFn: () =>
      api<{ job: Job }>(isEdit ? `/jobs/${id}` : "/jobs", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          title,
          description,
          kind,
          orderRef: kind === "installation" ? orderRef : null,
          priority,
          customerId,
          locationId,
          assignedTechnicianId: assignedTechnicianId || null,
          scheduledDate: scheduledDate || null,
          scheduledTimeStart: scheduledTimeStart || null,
          scheduledTimeEnd: scheduledTimeEnd || null,
        }),
      }),
    onSuccess: (result) => {
      notify(t("jobs.saved"));
      navigate(`/jobs/${result.job.id}`);
    },
    onError: () => notify(t("jobs.failed"), "error"),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  if (isEdit && jobQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (isEdit && (jobQuery.isError || !jobQuery.data)) {
    return <LoadError />;
  }

  if (isEdit && jobQuery.data && isClosedJob(jobQuery.data.job.status)) {
    return <Navigate to={`/jobs/${id}`} replace />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title={isEdit ? t("jobs.edit") : t("jobs.new")} />
      <Card>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div>
            <Label>{t("jobs.titleField")}</Label>
            <TextField value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label>{t("jobs.description")}</Label>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("jobs.kind")}</Label>
              <SelectField
                value={kind}
                onChange={(e) => {
                  const next = e.target.value as JobKind;
                  setKind(next);
                  if (!isEdit && isDefaultTitle(title)) {
                    setTitle(defaultTitleFor(next));
                  }
                }}
              >
                {KINDS.map((item) => (
                  <option key={item} value={item}>
                    {t(`kind.${item}` as MessageKey)}
                  </option>
                ))}
              </SelectField>
            </div>
            {kind === "installation" ? (
              <div>
                <Label>
                  {t("jobs.orderRef")} <span className="font-medium text-gray-400">({t("common.optional")})</span>
                </Label>
                <TextField value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="ORD-1042" />
              </div>
            ) : (
              <div />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("jobs.customer")}</Label>
              <SelectField value={customerId} onChange={(e) => { setCustomerId(e.target.value); setLocationId(""); }} required>
                <option value="">—</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div>
              <Label>{t("jobs.location")}</Label>
              <SelectField value={locationId} onChange={(e) => setLocationId(e.target.value)} required disabled={!customerId || locations.length === 0}>
                <option value="">—</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.address}, {location.city}
                  </option>
                ))}
              </SelectField>
              {customerId && locations.length === 0 ? (
                <p className="mt-2 text-sm font-medium text-red-500">{t("jobs.noLocations")}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("jobs.priority")}</Label>
              <SelectField value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {t(`priority.${item}` as MessageKey)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div>
              <Label>{t("jobs.technician")}</Label>
              <SelectField value={assignedTechnicianId} onChange={(e) => setAssignedTechnicianId(e.target.value)}>
                <option value="">{t("jobs.unassigned")}</option>
                {techsQuery.data?.technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>{t("jobs.date")}</Label>
              <TextField type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div>
              <Label>{t("jobs.from")}</Label>
              <TextField type="time" value={scheduledTimeStart} onChange={(e) => setScheduledTimeStart(e.target.value)} />
            </div>
            <div>
              <Label>{t("jobs.to")}</Label>
              <TextField type="time" value={scheduledTimeEnd} onChange={(e) => setScheduledTimeEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <PrimaryButton type="submit" disabled={save.isPending || Boolean(customerId && locations.length === 0)}>
              {t("common.save")}
            </PrimaryButton>
            <GhostButton onClick={() => navigate(-1)}>{t("common.cancel")}</GhostButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function JobDetailPage() {
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/jobs" className="font-bold text-[#B439FD]">
          ← {t("common.back")}
        </Link>
        {isClosedJob(data.job.status) ? null : (
          <Link to={`/jobs/${data.job.id}/edit`} className="inline-flex min-h-11 items-center rounded-lg bg-gray-100 px-4 font-bold text-[#B439FD] hover:bg-gray-200">
            {t("common.edit")}
          </Link>
        )}
      </div>
      <JobWorkspace job={data.job} backTo="/jobs" />
    </div>
  );
}
