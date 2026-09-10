import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Customer, Job, ServiceLocation } from "../../lib/types";
import { useI18n } from "../../i18n/LanguageContext";
import { useToast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Card, GhostButton, Label, PageTitle, PrimaryButton, TextArea, TextField } from "../../components/ui";
import { StatusBadge } from "../../components/JobCard";

export function CustomersPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["customers", q],
    queryFn: () => api<{ customers: Customer[] }>(`/customers?q=${encodeURIComponent(q)}`),
  });

  return (
    <div>
      <PageTitle
        title={t("customers.title")}
        subtitle={t("customers.subtitle")}
        actions={
          <Link to="/customers/new" className="inline-flex min-h-11 items-center rounded-lg bg-[#B439FD] px-4 font-bold text-white hover:bg-[#CA73FD]">
            {t("customers.new")}
          </Link>
        }
      />
      <TextField value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="mb-6 max-w-md" />
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !data?.customers.length ? (
        <EmptyState title={t("customers.emptyTitle")} description={t("customers.emptyDescription")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.customers.map((customer) => (
            <Link key={customer.id} to={`/customers/${customer.id}`}>
              <Card>
                <p className="text-xl font-semibold text-black">{customer.name}</p>
                <p className="mt-2 text-sm text-gray-600">{customer.phone || customer.email || "—"}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {customer.locations?.length ?? 0} · {customer._count?.jobs ?? 0} {t("nav.jobs").toLowerCase()}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerFormPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { data } = useQuery({
    queryKey: ["customers", id],
    queryFn: () => api<{ customer: Customer }>(`/customers/${id}`),
    enabled: isEdit,
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!data) {
      return;
    }
    setName(data.customer.name);
    setPhone(data.customer.phone ?? "");
    setEmail(data.customer.email ?? "");
    setNotes(data.customer.notes ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api<{ customer: Customer }>(isEdit ? `/customers/${id}` : "/customers", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify({ name, phone, email, notes }),
      }),
    onSuccess: (result) => {
      notify(t("customers.saved"));
      navigate(`/customers/${result.customer.id}`);
    },
    onError: () => notify(t("common.failed"), "error"),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title={isEdit ? t("customers.edit") : t("customers.new")} />
      <Card>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div>
            <Label>{t("customers.name")}</Label>
            <TextField value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>{t("common.phone")}</Label>
            <TextField value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>{t("common.email")}</Label>
            <TextField type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>{t("common.notes")}</Label>
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <PrimaryButton type="submit" disabled={save.isPending}>
              {t("common.save")}
            </PrimaryButton>
            <GhostButton onClick={() => navigate(-1)}>{t("common.cancel")}</GhostButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showLocation, setShowLocation] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Toshkent");
  const [locNotes, setLocNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customers", id],
    queryFn: () =>
      api<{ customer: Customer & { jobs: Array<Pick<Job, "id" | "title" | "status">>; locations: ServiceLocation[] } }>(`/customers/${id}`),
  });

  const addLocation = useMutation({
    mutationFn: () =>
      api(`/customers/${id}/locations`, {
        method: "POST",
        body: JSON.stringify({ address, city, notes: locNotes }),
      }),
    onSuccess: () => {
      notify(t("customers.locationSaved"));
      setShowLocation(false);
      setAddress("");
      queryClient.invalidateQueries({ queryKey: ["customers", id] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      notify(t("customers.deleted"));
      navigate("/customers");
    },
    onError: () => notify(t("customers.deleteBlocked"), "error"),
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const customer = data.customer;

  return (
    <div>
      <PageTitle
        title={customer.name}
        subtitle={[customer.phone, customer.email].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link to={`/jobs/new?customerId=${customer.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-[#B439FD] px-4 font-bold text-white hover:bg-[#CA73FD]">
              {t("jobs.new")}
            </Link>
            <Link to={`/customers/${customer.id}/edit`} className="inline-flex min-h-11 items-center rounded-lg bg-gray-100 px-4 font-bold text-[#B439FD] hover:bg-gray-200">
              {t("common.edit")}
            </Link>
          </>
        }
      />
      {customer.notes ? <p className="mb-8 text-gray-600">{customer.notes}</p> : null}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-black">{t("customers.locations")}</h2>
        <GhostButton onClick={() => setShowLocation(true)}>{t("customers.addLocation")}</GhostButton>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {customer.locations.map((location) => (
          <Card key={location.id}>
            <p className="font-semibold text-black">{location.address}</p>
            <p className="text-sm text-gray-600">{location.city}</p>
            {location.notes ? <p className="mt-2 text-sm text-gray-500">{location.notes}</p> : null}
          </Card>
        ))}
      </div>

      {showLocation ? (
        <form
          className="mt-4 grid gap-3 rounded-3xl bg-white p-6 shadow-[0_0_10px_rgba(0,0,0,0.1)] md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            addLocation.mutate();
          }}
        >
          <div>
            <Label>{t("common.address")}</Label>
            <TextField value={address} onChange={(e) => setAddress(e.target.value)} required />
          </div>
          <div>
            <Label>{t("common.city")}</Label>
            <TextField value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
          <div className="md:col-span-2">
            <Label>{t("common.notes")}</Label>
            <TextField value={locNotes} onChange={(e) => setLocNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <PrimaryButton type="submit">{t("common.add")}</PrimaryButton>
            <GhostButton onClick={() => setShowLocation(false)}>{t("common.cancel")}</GhostButton>
          </div>
        </form>
      ) : null}

      <h2 className="mt-12 mb-4 text-2xl font-semibold text-black">{t("customers.jobs")}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {customer.jobs.map((job) => (
          <Link key={job.id} to={`/jobs/${job.id}`} className="block">
            <Card>
              <p className="font-semibold text-black">{job.title}</p>
              <div className="mt-2">
                <StatusBadge status={job.status} />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <GhostButton className="mt-8 !text-red-500 hover:!bg-red-50" onClick={() => remove.mutate()}>
        {t("common.delete")}
      </GhostButton>
    </div>
  );
}
