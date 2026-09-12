import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Job } from "../lib/types";
import type { MessageKey } from "../i18n/messages";
import { mapsUrl, money, statusDot, isClosedJob } from "../lib/format";
import { useI18n } from "../i18n/LanguageContext";
import { Card, GhostButton, Label, PrimaryButton, TextArea, TextField } from "./ui";
import { KindBadge, PriorityBadge, StatusBadge } from "./JobCard";
import { useToast } from "./Toast";
import { useAuth } from "../features/auth/AuthContext";

const LABOR_RATE = 150_000;

export function JobWorkspace({ job, backTo }: { job: Job; backTo: string }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [shareNote, setShareNote] = useState(false);
  const [partName, setPartName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const technician = user?.role === "technician";

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["dispatch"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }

  function rememberJob(result: { job: Job }) {
    queryClient.setQueryData(["jobs", job.id], result);
    invalidate();
  }

  const statusMut = useMutation({
    mutationFn: (status: string) => api<{ job: Job }>(`/jobs/${job.id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: (result) => {
      notify(t("jobs.updated"));
      rememberJob(result);
    },
    onError: () => notify(t("jobs.failed"), "error"),
  });

  const noteMut = useMutation({
    mutationFn: () =>
      api<{ job: Job }>(`/jobs/${job.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ noteText: note, visibleToCustomer: shareNote }),
      }),
    onSuccess: (result) => {
      setNote("");
      setShareNote(false);
      notify(t("jobs.updated"));
      rememberJob(result);
    },
    onError: () => notify(t("jobs.failed"), "error"),
  });

  const partMut = useMutation({
    mutationFn: () =>
      api<{ job: Job }>(`/jobs/${job.id}/parts`, {
        method: "POST",
        body: JSON.stringify({ partName, quantity: Number(quantity), unitCost: Number(unitCost) }),
      }),
    onSuccess: (result) => {
      setPartName("");
      setQuantity("1");
      setUnitCost("");
      notify(t("jobs.updated"));
      rememberJob(result);
    },
    onError: () => notify(t("jobs.failed"), "error"),
  });

  const photoMut = useMutation({
    mutationFn: (photoUrl: string) => api<{ job: Job }>(`/jobs/${job.id}/photos`, { method: "POST", body: JSON.stringify({ photoUrl }) }),
    onSuccess: (result) => {
      notify(t("jobs.updated"));
      rememberJob(result);
    },
    onError: () => notify(t("jobs.failed"), "error"),
  });

  const checklistMut = useMutation({
    mutationFn: (item: { id: string; done: boolean }) =>
      api<{ job: Job }>(`/jobs/${job.id}/checklist`, { method: "POST", body: JSON.stringify(item) }),
    onSuccess: (result) => rememberJob(result),
    onError: () => notify(t("jobs.failed"), "error"),
  });

  const invoiceMut = useMutation({
    mutationFn: () => api<{ invoice: { id: string } }>("/invoices", { method: "POST", body: JSON.stringify({ jobId: job.id }) }),
    onSuccess: (result) => {
      notify(t("invoices.created"));
      invalidate();
      navigate(`/invoices/${result.invoice.id}`);
    },
    onError: (err) =>
      notify(err instanceof ApiError && /already/i.test(err.message) ? t("invoices.already") : t("jobs.failed"), "error"),
  });

  async function onPhoto(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      photoMut.mutate(await compressPhoto(file));
    } catch {
      notify(t("jobs.failed"), "error");
    }
  }

  const partsTotal = job.partsUsed.reduce((sum, part) => sum + part.quantity * part.unitCost, 0);
  const laborTotal = (job.laborHours ?? 0) * LABOR_RATE;
  const canStart = job.status === "new" || job.status === "scheduled";
  const canComplete = job.status === "in_progress";
  const canInvoice = !technician && job.status === "completed" && job.invoices.length === 0;
  const closed = isClosedJob(job.status);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card dot={statusDot(job.status)}>
        <div className="flex flex-wrap gap-3">
          <KindBadge kind={job.kind} />
          <StatusBadge status={job.status} />
          {job.submittedByCustomer ? (
            <span className="inline-flex items-center rounded-lg bg-[#f6e9ff] px-2 py-0.5 text-xs font-bold text-[#9103E4]">
              {t("jobs.fromCustomer")}
            </span>
          ) : null}
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-black">{job.title}</h2>
        <p className="mt-2 text-gray-600">{job.description || "—"}</p>
        <div className="mt-6 grid gap-3 text-sm">
          {job.kind === "installation" && job.orderRef ? (
            <p>
              <span className="font-bold text-black">{t("jobs.orderRef")}: </span>
              {job.orderRef}
            </p>
          ) : null}
          <p>
            <span className="font-bold text-black">{t("jobs.customer")}: </span>
            {job.customer.name} {job.customer.phone ? `· ${job.customer.phone}` : ""}
          </p>
          <p>
            <span className="font-bold text-black">{t("jobs.location")}: </span>
            {job.location.address}, {job.location.city}
          </p>
          <p>
            <span className="font-bold text-black">{t("jobs.technician")}: </span>
            {job.assignedTechnician?.name ?? t("jobs.unassigned")}
          </p>
          <PriorityBadge priority={job.priority} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {canStart ? (
            <PrimaryButton className="min-h-12 flex-1 sm:flex-none" onClick={() => statusMut.mutate("in_progress")}>
              {t("jobs.start")}
            </PrimaryButton>
          ) : null}
          {canComplete ? (
            <PrimaryButton className="min-h-12 flex-1 sm:flex-none" onClick={() => statusMut.mutate("completed")}>
              {t("jobs.complete")}
            </PrimaryButton>
          ) : null}
          <a className={ghostLink()} href={mapsUrl(job.location)} target="_blank" rel="noreferrer">
            {t("jobs.directions")}
          </a>
          {job.customer.phone ? (
            <a className={ghostLink()} href={`tel:${job.customer.phone}`}>
              {t("jobs.call")}
            </a>
          ) : null}
          {canInvoice ? (
            <GhostButton onClick={() => invoiceMut.mutate()}>{t("invoices.create")}</GhostButton>
          ) : null}
          {!technician && job.status !== "cancelled" && job.status !== "invoiced" && job.status !== "completed" ? (
            <GhostButton onClick={() => statusMut.mutate("cancelled")}>{t("jobs.cancelJob")}</GhostButton>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-6">
        <Card>
          <h3 className="text-xl font-semibold text-black">{t("jobs.checklist")}</h3>
          <ul className="mt-4 space-y-2">
            {job.checklist?.map((item) => (
              <li key={item.id}>
                <label className={`flex min-h-11 items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm ${closed ? "" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#B439FD]"
                    checked={item.done}
                    disabled={closed}
                    onChange={(event) => checklistMut.mutate({ id: item.id, done: event.target.checked })}
                  />
                  <span className={item.done ? "text-gray-500 line-through" : "text-black"}>
                    {t(`checklist.${item.id}` as MessageKey)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold text-black">{t("jobs.addNote")}</h3>
          {closed ? null : (
          <form
            className="mt-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (note.trim()) {
                noteMut.mutate();
              }
            }}
          >
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("jobs.notePlaceholder")} />
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={shareNote} onChange={(e) => setShareNote(e.target.checked)} />
              {t("jobs.shareWithShop")}
            </label>
            <PrimaryButton type="submit" className="mt-3" disabled={noteMut.isPending}>
              {t("common.add")}
            </PrimaryButton>
          </form>
          )}
          <ul className="mt-4 space-y-3">
            {job.notes.map((item) => (
              <li key={item.id} className="rounded-xl bg-gray-50 p-3 text-sm">
                <p className="font-bold text-black">{item.user.name}</p>
                {item.visibleToCustomer ? (
                  <p className="text-xs font-bold text-[#9103E4]">{t("jobs.sharedWithShop")}</p>
                ) : null}
                <p className="text-gray-600">{item.noteText}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold text-black">{t("jobs.parts")}</h3>
          {closed ? null : (
          <form
            className="mt-4 grid gap-2 sm:grid-cols-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              partMut.mutate();
            }}
          >
            <div className="sm:col-span-3">
              <Label>{t("jobs.partName")}</Label>
              <TextField value={partName} onChange={(e) => setPartName(e.target.value)} required />
            </div>
            <div>
              <Label>{t("jobs.quantity")}</Label>
              <TextField type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label>{t("jobs.unitCost")}</Label>
              <TextField type="number" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
            </div>
            <div className="flex items-end">
              <PrimaryButton type="submit" className="w-full" disabled={partMut.isPending}>
                {t("common.add")}
              </PrimaryButton>
            </div>
          </form>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {job.partsUsed.map((part) => (
              <li key={part.id} className="flex justify-between gap-3">
                <span>
                  {part.partName} × {part.quantity}
                </span>
                <span className="font-bold">{money(part.quantity * part.unitCost, locale)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-gray-600">
            {t("jobs.labor")}: {job.laborHours ?? "—"} · {t("invoices.total")}: {money(partsTotal + laborTotal, locale)}
          </p>
        </Card>

        <Card>
          <h3 className="text-xl font-semibold text-black">{t("jobs.photos")}</h3>
          {closed ? null : (
          <label className={`${ghostBtn()} mt-4 cursor-pointer`}>
            {t("jobs.addPhoto")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {job.photos.map((photo) => (
              <img key={photo.id} src={photo.photoUrl} alt="" className="h-28 w-full rounded-2xl object-cover" />
            ))}
          </div>
        </Card>
      </div>
      <a href={backTo} className="sr-only">
        {t("common.back")}
      </a>
    </div>
  );
}

function ghostBtn() {
  return "inline-flex min-h-11 items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-[#B439FD] transition-colors hover:bg-gray-200";
}

function ghostLink() {
  return ghostBtn();
}

function compressPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("canvas"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image"));
    };
    image.src = objectUrl;
  });
}
