import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { DashboardData } from "../../lib/types";
import { money } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../../i18n/LanguageContext";
import { Card, PageTitle } from "../../components/ui";
import { JobCard } from "../../components/JobCard";
import { Spinner } from "../../components/Spinner";

export function DashboardPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/dashboard"),
    refetchInterval: 5000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const cards = [
    { key: "open", label: t("dashboard.openJobs"), value: data.stats.openJobs, dot: "bg-red-400" },
    { key: "today", label: t("dashboard.todayJobs"), value: data.stats.todayJobs, dot: "bg-green-400" },
    { key: "overdue", label: t("dashboard.overdue"), value: data.stats.overdue, dot: "bg-blue-400" },
    { key: "unassigned", label: t("dashboard.unassigned"), value: data.stats.unassigned, dot: "bg-yellow-400" },
    { key: "urgent", label: t("dashboard.urgent"), value: data.stats.urgent, dot: "bg-pink-400" },
    { key: "due", label: t("dashboard.dueAmount"), value: money(data.stats.dueAmount, locale), dot: "bg-cyan-400" },
  ];

  return (
    <div>
      <PageTitle
        title={t("dashboard.title")}
        subtitle={t("dashboard.welcome", { name: user?.name ?? "" })}
        actions={
          <>
            <Link to="/jobs/new" className="inline-flex min-h-11 items-center rounded-lg bg-[#B439FD] px-4 font-bold text-white hover:bg-[#CA73FD]">
              {t("jobs.new")}
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
