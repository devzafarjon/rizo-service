import type { JobKind } from "@prisma/client";

export type ChecklistItem = { id: string; done: boolean };

export const CHECKLIST_IDS: Record<JobKind, string[]> = {
  installation: [
    "confirm_order",
    "install_pos",
    "connect_peripherals",
    "network_login",
    "train_staff",
    "handover",
  ],
  maintenance: [
    "inspect_hardware",
    "update_software",
    "test_receipts",
    "backup_reports",
    "clean_hardware",
    "schedule_next",
  ],
  repair: ["diagnose", "fix_or_replace", "test_after", "photo_result"],
};

export function defaultChecklist(kind: JobKind): ChecklistItem[] {
  return CHECKLIST_IDS[kind].map((id) => ({ id, done: false }));
}

export function parseChecklist(value: unknown, kind: JobKind): ChecklistItem[] {
  const defaults = defaultChecklist(kind);
  if (!Array.isArray(value) || value.length === 0) {
    return defaults;
  }
  const doneById = new Map<string, boolean>();
  for (const item of value) {
    if (item && typeof item === "object" && "id" in item && typeof (item as ChecklistItem).id === "string") {
      doneById.set((item as ChecklistItem).id, Boolean((item as ChecklistItem).done));
    }
  }
  return defaults.map((item) => ({ ...item, done: doneById.get(item.id) ?? false }));
}
