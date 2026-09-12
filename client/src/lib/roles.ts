import type { Role } from "./types";
import type { MessageKey } from "../i18n/messages";

export function homePath(role: Role) {
  return role === "technician" ? "/my-jobs" : "/dashboard";
}

export function roleLabelKey(role: Role): MessageKey {
  return role === "technician" ? "roles.technician" : "roles.dispatcher";
}

export function isOfficeRole(role: Role) {
  return role === "dispatcher";
}
