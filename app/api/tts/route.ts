import { json, refuse } from "@/lib/guard";

/* Text to speech through the server's keys.
   Body: { provider: "gemini" | "eleven", text, voice, style? }
   The reply is the provider's own JSON, so tts.js reads it exactly as when it calls the provider directly. */
export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-3.8-flash-lite-tts";
// must match GEMINI_VOICES / ELEVEN_VOICES in public/tts.js
const GEMINI_VOICES = new Set(["Kore", "Sulafat", "Erinome", "Achernar", "Achird", "Charon", "Iapetus", "Sadaltager"]);
const ELEVEN_MODEL = "eleven_flash_v2_5";
const ELEVEN_VOICES = new Set([
  "EXAVITQu4vr4xnSDxMaL", "Xb7hH8MSUJpSbSDYk0k2", "pFZP5JQG7iQjIQuC4Bku", "XrExE9yKIg1WjnnlVkGX", // Sarah, Alice, Lily, Matilda
  "JBFqnCBsd6RMkjVDRZzb", "onwK4e9ZLuTAKqWW03F9", "nPczCjzI2devNBz1zQrb", "bIHbv24MWmeRgasZH58o", // George, Daniel, Brian, Will
]);
const MAX_TEXT = 1200;

type Body = { provider?: string; text?: string; voice?: string; style?: string };

export async function POST(req: Request): Promise<Response> {
  const blocked = refuse(req, "tts", 40);
  if (blocked) return blocked;
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return json({ error: { message: "Bad request" } }, 400); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT) return json({ error: { message: `Text must be 1 to ${MAX_TEXT} characters.` } }, 400);

  if (body.provider === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return json({ error: { message: "No Gemini key on the server" } }, 503);
    const voice = GEMINI_VOICES.has(body.voice ?? "") ? body.voice! : "Kore";
    const part: Record<string, unknown> = { type: "text", text };
    if (typeof body.style === "string" && body.style.length <= 120) part.annotations = [{ type: "speech_metadata", style: body.style }];
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ model: GEMINI_MODEL, input: [{ type: "user_input", content: [part] }], response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] } }),
    });
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }

  if (body.provider === "eleven") {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return json({ detail: { message: "No ElevenLabs key on the server" } }, 503);
    const voice = ELEVEN_VOICES.has(body.voice ?? "") ? body.voice! : "EXAVITQu4vr4xnSDxMaL";
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": key },
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL }),
    });
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }

  return json({ error: { message: "Unknown provider" } }, 400);
}
