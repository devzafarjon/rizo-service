import { ApiError, handleStaffApi } from "./localApi";

export type Role = "dispatcher" | "technician";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
};

export const TOKEN_KEY = "fsm_token";
export { ApiError };

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return handleStaffApi(path, options) as T;
}

export function isUnreachableApi(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }
  return error instanceof ApiError && (error.status === 404 || error.status === 502 || error.status === 503);
}
