/* Shared checks for the API routes: who may call them, how often, and with what. */

const hits = new Map<string, number[]>();

/** Sliding-window rate limit per visitor (IP) and route. Memory only: fine for one server. */
export function rateLimited(req: Request, bucket: string, max: number, windowMs: number): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return recent.length > max;
}

/** Only pages from these sites may use the keys. Browsers always send Origin on POST. */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  // same host as the request (works behind a proxy that keeps the Host header)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return !!host && new URL(origin).host === host; } catch { return false; }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export function refuse(req: Request, bucket: string, max: number): Response | null {
  if (!originAllowed(req)) return json({ error: { message: "This site is not allowed to use the voice service." } }, 403);
  if (rateLimited(req, bucket, max, 60_000)) return json({ error: { message: "Too many requests. Wait a minute." } }, 429);
  return null;
}
