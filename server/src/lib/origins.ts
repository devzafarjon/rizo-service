export function allowedOrigins() {
  return (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | undefined) {
  const list = allowedOrigins();
  return !origin || list.includes("*") || list.includes(origin);
}

export function publicAppUrl() {
  return allowedOrigins()[0] ?? "http://localhost:5173";
}
