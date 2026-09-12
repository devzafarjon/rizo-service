export function apiBase() {
  return String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
}

export function apiUrl(path: string) {
  return `${apiBase()}${path}`;
}
