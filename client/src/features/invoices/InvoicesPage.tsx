import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Invoice, Job, InvoiceStatus } from "../../lib/types";
import { LABOR_RATE } from "../../lib/invoice";
import { money } from "../../lib/format";
import { useI18n } from "../../i18n/LanguageContext";
import type { MessageKey } from "../../i18n/messages";
import { useToast } from "../../components/Toast";
import { EmptyState, LoadError } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Card, GhostButton, PageTitle, PrimaryButton } from "../../components/ui";

type InvoiceRow = Invoice & { job: Job };

export function InvoicesPage() {
  const { t, locale } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api<{ invoices: InvoiceRow[] }>("/invoices"),
  });

  return (
    <div>
      <PageTitle title={t("invoices.title")} subtitle={t("invoices.subtitle")} />
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : isError ? (
        <LoadError />
      ) : !data?.invoices.length ? (
        <EmptyState title={t("invoices.emptyTitle")} description={t("invoices.emptyDescription")} />
      ) : (
        <div className="grid gap-4">
          {data.invoices.map((invoice) => (
            <Link key={invoice.id} to={`/invoices/${invoice.id}`}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold text-black">{invoice.job.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{invoice.job.customer.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-black">{money(invoice.amount, locale)}</p>
                    <p className="text-sm text-[#9103E4]">{t(`invoiceStatus.${invoice.status}` as MessageKey)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["invoices", id],
    queryFn: () => api<{ invoice: InvoiceRow }>(`/invoices/${id}`),
  });

  const update = useMutation({
    mutationFn: (status: InvoiceStatus) => api(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      notify(t("invoices.updated"));
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
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

  const invoice = data.invoice;
  const laborTotal = (invoice.job.laborHours ?? 0) * LABOR_RATE;

  return (
    <div className="mx-auto max-w-2xl print:max-w-none">
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <Link to="/invoices" className="font-bold text-[#B439FD]">
          ← {t("common.back")}
        </Link>
        <GhostButton onClick={() => window.print()}>{t("invoices.print")}</GhostButton>
        {invoice.status === "draft" ? <PrimaryButton onClick={() => update.mutate("sent")}>{t("invoices.markSent")}</PrimaryButton> : null}
        {invoice.status !== "paid" ? <GhostButton onClick={() => update.mutate("paid")}>{t("invoices.markPaid")}</GhostButton> : null}
      </div>
      <Card>
        <img src="/rizo-logo.png" alt="RIZO" className="h-20 w-20 object-contain" />
        <h1 className="mt-2 text-3xl font-bold text-black">{t("invoices.title")}</h1>
        <p className="text-sm text-gray-600">#{invoice.id.slice(-6).toUpperCase()} · {t(`invoiceStatus.${invoice.status}` as MessageKey)}</p>
        <div className="mt-6 grid gap-1 text-sm">
          <p className="font-bold text-black">{invoice.job.customer.name}</p>
          <p className="text-gray-600">
            {invoice.job.location.address}, {invoice.job.location.city}
          </p>
          <p className="text-gray-600">{invoice.job.title}</p>
        </div>
        <table className="mt-8 w-full text-left text-sm">
          <thead>
            <tr className="text-gray-500">
              <th className="pb-2 font-medium">{t("jobs.partName")}</th>
              <th className="pb-2 font-medium">{t("jobs.quantity")}</th>
              <th className="pb-2 font-medium text-right">{t("invoices.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.job.partsUsed.map((part) => (
              <tr key={part.id} className="border-t border-gray-100">
                <td className="py-2">{part.partName}</td>
                <td>{part.quantity}</td>
                <td className="text-right">{money(part.quantity * part.unitCost, locale)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-100">
              <td className="py-2">{t("invoices.labor")}</td>
              <td>{invoice.job.laborHours ?? 0}</td>
              <td className="text-right">{money(laborTotal, locale)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-6 text-right text-2xl font-bold text-black">
          {t("invoices.total")}: {money(invoice.amount, locale)}
        </p>
      </Card>
    </div>
  );
}
