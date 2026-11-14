import { json, refuse } from "@/lib/guard";

/* "Ask first": streams Gemini's answer back as server-sent events.
   The page sends the same body it would send to Gemini; the server fixes the model and caps the size. */
export const dynamic = "force-dynamic";

const ASK_MODEL = "gemini-3.5-flash-lite";
const MAX_BODY = 600_000; // page context (~90k chars) plus a short recorded question

type Part = { text?: string; inlineData?: { mimeType?: string; data?: string } };
type Body = { systemInstruction?: { parts?: Part[] }; contents?: { role?: string; parts?: Part[] }[] };

export async function POST(req: Request): Promise<Response> {
  const blocked = refuse(req, "ask", 12);
  if (blocked) return blocked;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: { message: "No Gemini key on the server" } }, 503);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: { message: "Question too large" } }, 413);
  let body: Body;
  try { body = JSON.parse(raw) as Body; } catch { return json({ error: { message: "Bad request" } }, 400); }

  // keep only text and short WAV audio; drop anything else
  const clean = (parts: Part[] = []): Part[] =>
    parts.flatMap((p): Part[] =>
      typeof p.text === "string" ? [{ text: p.text }]
      : p.inlineData?.mimeType === "audio/wav" && typeof p.inlineData.data === "string" ? [{ inlineData: { mimeType: "audio/wav", data: p.inlineData.data } }]
      : []);
  const contents = (body.contents ?? []).slice(-9).map((c) => ({ role: c.role === "model" ? "model" : "user", parts: clean(c.parts) }));
  if (!contents.length) return json({ error: { message: "Empty question" } }, 400);

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ASK_MODEL}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: clean(body.systemInstruction?.parts) },
      contents,
      generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
    }),
  });
  return new Response(r.body, {
    status: r.status,
    headers: { "content-type": r.ok ? "text/event-stream" : "application/json", "cache-control": "no-store" },
  });
}
