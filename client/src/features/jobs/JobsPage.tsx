import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Customer, Job, JobStatus, Priority, User } from "../../lib/types";
import { useI18n } from "../../i18n/LanguageContext";
import type { MessageKey } from "../../i18n/messages";
import { useToast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Card, GhostButton, Label, PageTitle, PrimaryButton, SelectField, TextArea, TextField } from "../../components/ui";
import { JobCard } from "../../components/JobCard";
import { JobWorkspace } from "../../components/JobWorkspace";

const STATUSES: JobStatus[] = ["new", "scheduled", "in_progress", "completed", "cancelled", "invoiced"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export function JobsPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (technicianId) params.set("technicianId", technicianId);

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", q, status, technicianId],
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
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <TextField value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} />
        <SelectField value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("common.all")}</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {t(`status.${item}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        <SelectField value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
          <option value="">{t("jobs.technician")}</option>
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
  const [priority, setPriority] = useState<Priority>("medium");
  const [customerId, setCustomerId] = useState(search.get("customerId") ?? "");
  const [locationId, setLocationId] = useState("");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTimeStart, setScheduledTimeStart] = useState("");
  const [scheduledTimeEnd, setScheduledTimeEnd] = useState("");
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (jobQuery.data && !filled) {
      const job = jobQuery.data.job;
      setTitle(job.title);
      setDescription(job.description ?? "");
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
  const locations = useMemo(
    () => customers.find((item) => item.id === customerId)?.locations ?? [],
    [customers, customerId],
  );

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/jobs" className="font-bold text-[#B439FD]">
          ← {t("common.back")}
        </Link>
        {data.job.status !== "invoiced" && data.job.status !== "cancelled" ? (
          <Link to={`/jobs/${data.job.id}/edit`} className="inline-flex min-h-11 items-center rounded-lg bg-gray-100 px-4 font-bold text-[#B439FD] hover:bg-gray-200">
            {t("common.edit")}
          </Link>
        ) : null}
      </div>
      <JobWorkspace job={data.job} backTo="/jobs" />
    </div>
  );
}
