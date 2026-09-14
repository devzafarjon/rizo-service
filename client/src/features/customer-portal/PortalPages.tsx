import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portalApi } from "../../lib/portalApi";
import type { JobKind, PortalJob, PortalSale } from "../../lib/types";
import { jobWhen, money, statusDot } from "../../lib/format";
import { useI18n } from "../../i18n/LanguageContext";
import { useToast } from "../../components/Toast";
import { usePortalAuth } from "./PortalAuthContext";
import { portalStatusKey } from "./portalCopy";
import { EmptyState, LoadError } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Card, Label, PageTitle, PrimaryButton, SelectField, TextArea } from "../../components/ui";
import { KindBadge } from "../../components/JobCard";

export function PortalDashboardPage() {
  const { t } = useI18n();
  const { customer } = usePortalAuth();
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-jobs", status, kind],
    queryFn: () => portalApi<{ jobs: PortalJob[] }>(`/jobs?${params.toString()}`),
  });

  return (
    <div>
      <PageTitle
        title={t("portal.dashTitle")}
        subtitle={t("portal.dashSubtitle", { name: customer?.name ?? "" })}
        actions={
          <Link to="/portal/new" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#B439FD] px-4 font-bold text-white hover:bg-[#CA73FD] sm:w-auto">
            {t("portal.nav.new")}
          </Link>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <SelectField value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("common.all")}</option>
          <option value="active">{t("portal.filter.active")}</option>
          <option value="completed">{t("portal.filter.completed")}</option>
        </SelectField>
        <SelectField value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t("common.all")}</option>
          <option value="repair">{t("kind.repair")}</option>
          <option value="maintenance">{t("kind.maintenance")}</option>
          <option value="installation">{t("kind.installation")}</option>
        </SelectField>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : isError ? (
        <LoadError />
      ) : !data?.jobs.length ? (
        <EmptyState title={t("portal.emptyTitle")} description={t("portal.emptyDescription")} />
      ) : (
        <div className="grid gap-4">
          {data.jobs.map((job) => (
            <Link key={job.id} to={`/portal/requests/${job.id}`} className="block">
              <Card>
                <div className="flex flex-wrap items-center gap-3">
                  <KindBadge kind={job.kind} />
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-600">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusDot(job.status)}`} />
                    {t(portalStatusKey(job.status, job.submittedByCustomer))}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-black">{job.title}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {job.location.address}, {job.location.city}
                </p>
                <p className="mt-1 text-sm text-gray-500">{jobWhen(job)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function PortalRequestPage() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-job", id],
    queryFn: () => portalApi<{ job: PortalJob }>(`/jobs/${id}`),
  });

  const rate = useMutation({
    mutationFn: () =>
      portalApi(`/jobs/${id}/feedback`, { method: "POST", body: JSON.stringify({ rating, comment }) }),
    onSuccess: () => {
      notify(t("portal.rated"));
      queryClient.invalidateQueries({ queryKey: ["portal-job", id] });
    },
    onError: () => notify(t("common.failed"), "error"),
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

  const job = data.job;
  const finished = job.status === "completed" || job.status === "invoiced";

  return (
    <div>
      <Link to="/portal" className="mb-6 inline-block font-bold text-[#B439FD]">
        ← {t("common.back")}
      </Link>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <KindBadge kind={job.kind} />
          <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-600">
            <span className={`h-2.5 w-2.5 rounded-full ${statusDot(job.status)}`} />
            {t(portalStatusKey(job.status, job.submittedByCustomer))}
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-bold break-words text-black sm:text-3xl">{job.title}</h1>
        <p className="mt-3 text-gray-600">{job.description || "—"}</p>
        <dl className="mt-6 grid gap-3 text-sm">
          <div>
            <dt className="font-bold text-black">{t("portal.when")}</dt>
            <dd className="text-gray-600">{jobWhen(job)}</dd>
          </div>
          <div>
            <dt className="font-bold text-black">{t("portal.where")}</dt>
            <dd className="text-gray-600">
              {job.location.address}, {job.location.city}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-black">{t("portal.technician")}</dt>
            <dd className="text-gray-600">{job.technicianName ?? t("portal.noTechnician")}</dd>
          </div>
          {job.relatedSale ? (
            <div>
              <dt className="font-bold text-black">{t("portal.product")}</dt>
              <dd className="text-gray-600">{job.relatedSale.productName}</dd>
            </div>
          ) : null}
          {job.payment ? (
            <div>
              <dt className="font-bold text-black">{t("portal.payment")}</dt>
              <dd className="text-gray-600">
                {money(job.payment.amount, locale)} ·{" "}
                {t(
                  job.payment.status === "paid"
                    ? "portal.pay.paid"
                    : job.payment.status === "sent"
                      ? "portal.pay.due"
                      : "portal.pay.estimated",
                )}
              </dd>
            </div>
          ) : null}
        </dl>
        {job.notes.length ? (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-black">{t("portal.updates")}</h2>
            <ul className="mt-3 space-y-2">
              {job.notes.map((note) => (
                <li key={note.id} className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                  {note.noteText}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {finished && !job.feedback ? (
        <Card className="mt-6">
          <h2 className="text-xl font-semibold text-black">{t("portal.rateTitle")}</h2>
          <p className="mt-2 text-sm text-gray-600">{t("portal.rateSubtitle")}</p>
          <div className="mt-4 flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className={`h-11 w-11 rounded-lg text-lg font-bold ${
                  star <= rating ? "bg-[#B439FD] text-white" : "bg-gray-100 text-gray-500"
                }`}
                aria-label={`${star}`}
              >
                {star}
              </button>
            ))}
          </div>
          <TextArea className="mt-4" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("portal.rateComment")} />
          <PrimaryButton className="mt-4" disabled={rating < 1 || rate.isPending} onClick={() => rate.mutate()}>
            {t("portal.sendRating")}
          </PrimaryButton>
        </Card>
      ) : null}

      {job.feedback ? (
        <Card className="mt-6">
          <h2 className="text-xl font-semibold text-black">{t("portal.yourRating")}</h2>
          <p className="mt-2 text-2xl font-bold text-[#B439FD]">{job.feedback.rating} / 5</p>
          {job.feedback.comment ? <p className="mt-2 text-gray-600">{job.feedback.comment}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

export function PortalNewRequestPage() {
  const { t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const { customer } = usePortalAuth();
  const [kind, setKind] = useState<JobKind>("repair");
  const [relatedSaleId, setRelatedSaleId] = useState("");
  const [locationId, setLocationId] = useState(customer?.locations?.[0]?.id ?? "");
  const [description, setDescription] = useState("");

  const sales = useQuery({
    queryKey: ["portal-sales"],
    queryFn: () => portalApi<{ sales: PortalSale[] }>("/sales"),
  });
  const locations = customer?.locations ?? [];

  useEffect(() => {
    if (!locationId && locations[0]?.id) {
      setLocationId(locations[0].id);
    }
  }, [locationId, locations[0]?.id]);

  const create = useMutation({
    mutationFn: () =>
      portalApi<{ job: PortalJob }>("/jobs", {
        method: "POST",
        body: JSON.stringify({ kind, description, relatedSaleId, locationId }),
      }),
    onSuccess: (result) => {
      notify(t("portal.requestSent"));
      navigate(`/portal/requests/${result.job.id}`);
    },
    onError: () => notify(t("common.failed"), "error"),
  });

  return (
    <div>
      <PageTitle title={t("portal.newTitle")} subtitle={t("portal.newSubtitle")} />
      <Card>
        <form
          className="grid gap-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <Label>{t("portal.requestType")}</Label>
            <SelectField value={kind} onChange={(e) => setKind(e.target.value as JobKind)}>
              <option value="repair">{t("kind.repair")}</option>
              <option value="maintenance">{t("kind.maintenance")}</option>
            </SelectField>
          </div>
          <div>
            <Label>{t("portal.product")}</Label>
            <SelectField value={relatedSaleId} onChange={(e) => setRelatedSaleId(e.target.value)}>
              <option value="">{t("portal.otherProduct")}</option>
              {sales.data?.sales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.productName}
                </option>
              ))}
            </SelectField>
          </div>
          {locations.length > 1 ? (
            <div>
              <Label>{t("portal.where")}</Label>
              <SelectField value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.address}, {location.city}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : null}
          <div>
            <Label>{t("portal.issue")}</Label>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={4} />
          </div>
          <PrimaryButton type="submit" disabled={create.isPending}>
            {t("portal.sendRequest")}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
