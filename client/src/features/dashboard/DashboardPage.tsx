import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { DashboardData } from "../../lib/types";
import { jobDate, money } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../../i18n/LanguageContext";
import { Card, PageTitle } from "../../components/ui";
import { JobCard } from "../../components/JobCard";
import { Spinner } from "../../components/Spinner";
import { LoadError } from "../../components/EmptyState";

export function DashboardPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/dashboard"),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return <LoadError />;
  }

  const cards = [
    { key: "open", label: t("dashboard.openJobs"), value: data.stats.openJobs, dot: "bg-red-400" },
    { key: "today", label: t("dashboard.todayJobs"), value: data.stats.todayJobs, dot: "bg-green-400" },
    { key: "overdue", label: t("dashboard.overdue"), value: data.stats.overdue, dot: "bg-blue-400" },
    { key: "unassigned", label: t("dashboard.unassigned"), value: data.stats.unassigned, dot: "bg-yellow-400" },
    { key: "urgent", label: t("dashboard.urgent"), value: data.stats.urgent, dot: "bg-pink-400" },
    { key: "due", label: t("dashboard.dueAmount"), value: money(data.stats.dueAmount, locale), dot: "bg-cyan-400" },
  ];

  const serviceCards = [
    { key: "install", label: t("dashboard.installations"), value: data.stats.installationsOpen, to: "/jobs?kind=installation", dot: "bg-[#B439FD]" },
    { key: "maint", label: t("dashboard.maintenance"), value: data.stats.maintenanceOpen, to: "/jobs?kind=maintenance", dot: "bg-cyan-400" },
    { key: "maintDue", label: t("dashboard.maintenanceDue"), value: data.stats.maintenanceDue, to: "/customers", dot: "bg-orange-400" },
  ];

  return (
    <div>
      <PageTitle
        title={t("dashboard.title")}
        subtitle={t("dashboard.welcome", { name: user?.name ?? "" })}
        actions={
          <>
            <Link to="/jobs/new?kind=installation" className="inline-flex min-h-11 items-center rounded-lg bg-[#B439FD] px-4 font-bold text-white hover:bg-[#CA73FD]">
              {t("customers.installOrder")}
            </Link>
            <Link to="/jobs/new?kind=maintenance" className="inline-flex min-h-11 items-center rounded-lg bg-gray-100 px-4 font-bold text-[#B439FD] hover:bg-gray-200">
              {t("customers.scheduleMaintenance")}
            </Link>
            <Link to="/dispatch" className="inline-flex min-h-11 items-center rounded-lg bg-gray-100 px-4 font-bold text-[#B439FD] hover:bg-gray-200">
              {t("nav.dispatch")}
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key} dot={card.dot}>
            <p className="text-xl font-semibold text-black sm:text-2xl">{card.label}</p>
            <p className="mt-4 text-3xl font-bold text-black">{card.value}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-12 mb-6 text-2xl font-semibold text-black">{t("dashboard.serviceTitle")}</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {serviceCards.map((card) => (
          <Link key={card.key} to={card.to} className="block">
            <Card dot={card.dot}>
              <p className="text-xl font-semibold text-black sm:text-2xl">{card.label}</p>
              <p className="mt-4 text-3xl font-bold text-black">{card.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      {data.maintenanceDueShops.length ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {data.maintenanceDueShops.map((shop) => (
            <Link key={shop.id} to={`/customers/${shop.id}`} className="block">
              <Card>
                <p className="font-semibold text-black">{shop.name}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {t("customers.nextMaintenance")}: {jobDate(shop.nextMaintenanceOn)}
                </p>
                <p className="mt-3 font-bold text-[#B439FD]">{t("customers.scheduleMaintenance")}</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}

      <h2 className="mt-12 mb-6 text-2xl font-semibold text-black">{t("dashboard.recent")}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {data.recentJobs.map((job) => (
          <JobCard key={job.id} job={job} to={`/jobs/${job.id}`} />
        ))}
      </div>
      {data.recentJobs.length === 0 ? <p className="text-gray-600">{t("common.noResults")}</p> : null}
    </div>
  );
}
