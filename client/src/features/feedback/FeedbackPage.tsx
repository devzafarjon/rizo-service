import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { JobKind } from "../../lib/types";
import { useI18n } from "../../i18n/LanguageContext";
import { Card, PageTitle } from "../../components/ui";
import { Spinner } from "../../components/Spinner";
import { EmptyState, LoadError } from "../../components/EmptyState";
import { KindBadge } from "../../components/JobCard";

type FeedbackPayload = {
  overall: { average: number; count: number };
  technicians: Array<{ id: string; name: string; average: number; count: number }>;
  feedback: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    customerName: string;
    jobId: string;
    jobTitle: string;
    kind: JobKind;
    technicianName: string | null;
  }>;
};

export function FeedbackPage() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["feedback"],
    queryFn: () => api<FeedbackPayload>("/feedback"),
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
      <PageTitle title={t("feedback.title")} subtitle={t("feedback.subtitle")} />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <p className="text-sm font-bold text-gray-500">{t("feedback.overall")}</p>
          <p className="mt-2 text-3xl font-bold text-black">{data.overall.average || "—"}</p>
          <p className="mt-1 text-sm text-gray-500">{data.overall.count} {t("feedback.reviews")}</p>
        </Card>
        {data.technicians.map((tech) => (
          <Card key={tech.id}>
            <p className="text-sm font-bold text-gray-500">{tech.name}</p>
            <p className="mt-2 text-3xl font-bold text-black">{tech.average}</p>
            <p className="mt-1 text-sm text-gray-500">{tech.count} {t("feedback.reviews")}</p>
          </Card>
        ))}
      </div>
      {!data.feedback.length ? (
        <EmptyState title={t("feedback.emptyTitle")} description={t("feedback.emptyDescription")} />
      ) : (
        <div className="grid gap-4">
          {data.feedback.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-center gap-3">
                <KindBadge kind={item.kind} />
                <span className="text-lg font-bold text-[#B439FD]">{item.rating} / 5</span>
              </div>
              <p className="mt-3 font-semibold text-black">{item.customerName}</p>
              <p className="text-sm text-gray-600">
                <Link to={`/jobs/${item.jobId}`} className="font-bold text-[#B439FD]">
                  {item.jobTitle}
                </Link>
                {item.technicianName ? ` · ${item.technicianName}` : ""}
              </p>
              {item.comment ? <p className="mt-3 text-gray-700">{item.comment}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
