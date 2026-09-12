import type { JobStatus } from "../../lib/types";
import type { MessageKey } from "../../i18n/messages";

export function portalStatusKey(status: JobStatus, submittedByCustomer: boolean): MessageKey {
  if (status === "new" && submittedByCustomer) {
    return "portal.status.received";
  }
  return `portal.status.${status}` as MessageKey;
}

export function isPortalActive(status: JobStatus) {
  return status === "new" || status === "scheduled" || status === "in_progress";
}
