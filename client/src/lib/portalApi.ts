import { handlePortalApi } from "./localApi";
import type { PortalCustomer } from "./types";

export const PORTAL_TOKEN_KEY = "fsm_portal_token";

export function getPortalToken() {
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function setPortalToken(token: string) {
  localStorage.setItem(PORTAL_TOKEN_KEY, token);
}

export function clearPortalToken() {
  localStorage.removeItem(PORTAL_TOKEN_KEY);
}

export async function portalApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  return handlePortalApi(path, options) as T;
}

export type PortalSession = { token: string; customer: PortalCustomer };
