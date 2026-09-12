const API_PATHS = ["/api/*", "/socket.io/*"];

export default async (request: Request) => {
  const base = (process.env.API_ORIGIN ?? "").replace(/\/$/, "");
  if (!base) {
    return Response.json(
      { error: "API_ORIGIN is not set. Point Netlify at the Express API host." },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, `${base}/`);
  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(target, init);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch {
    return Response.json({ error: "API is unreachable" }, { status: 502 });
  }
};

export const config = { path: API_PATHS };
