/* Tells tts.js which voice services the server has keys for (never the keys themselves). */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { gemini: !!process.env.GEMINI_API_KEY, eleven: !!process.env.ELEVENLABS_API_KEY },
    { headers: { "cache-control": "no-store" } },
  );
}
