# Year 4 Study Hub: source

Live at http://y4t1.chanraksa.com, self-hosted.

The site itself is still plain HTML, JS and CSS. It all lives in `public/` and is served as-is. A small Next.js (TypeScript) server around it holds the voice keys, so they never reach the browser.

| Path | What it is |
|---|---|
| `public/` | The whole study site (every file in the table below). |
| `app/api/tts/route.ts` | Read-aloud. It passes text to Gemini TTS or ElevenLabs with the server's key. The model and voices are fixed, and text is capped at 1200 characters. |
| `app/api/ask/route.ts` | Ask first. It streams Gemini's short answer back. Only text and WAV audio are passed on. |
| `app/api/health/route.ts` | Tells `tts.js` which keys the server has. When a key is there, the page uses the server and not a browser key. |
| `lib/guard.ts` | Only the site's own pages can call the API (`ALLOWED_ORIGINS`, or the same host). Each visitor is rate-limited: read-aloud 40 a minute, Ask 12 a minute. |
| `.env.local` | The keys. Git ignores this file. Copy `.env.example` to start one. |

The files inside `public/`:

| File | What it is |
|---|---|
| `index.html` | The landing page where you pick a subject. |
| `quantum.html` | Quantum Computing, "From Bits to Shor" (the page from your quantum artifact). |
| `lecture.js` | The script behind `quantum.html`: simulator and demos. |
| `ir.html` | Information Retrieval, "From Substring to NDCG". Its script is inside the file. |
| `ml.html` | Machine Learning, "From Rules to Recall". Its script is inside the file. |
| `devops.html` | DevOps, "From Commit to Container". Its script is inside the file. |
| `themes.css`, `themes.js` | The theme picker, the 14 extra themes (each with light and dark) and the light/dark icon button. Every page loads both. |
| `export.js` | The Download and full screen buttons in the contents panel of each subject page (set `SHOW_DOWNLOAD` to false to hide Download). Download makes an A4 PDF, or a zip with one PNG per page, in the current theme. It runs in the browser, so it needs the live site or a local server, not a file opened directly. |
| `tts.js` | The Listen button on each subject page. It reads the page aloud from where you are and highlights the sentence and word being spoken. Formulas are read in words, tables row by row with their column names, figures by caption and image description; demos, quizzes and code are announced, and slide references are skipped. Voices switch automatically between services: reading uses Gemini text-to-speech first and ElevenLabs while Gemini is rate-limited; Ask first answers use ElevenLabs first because it starts faster (and gives exact word timings); a service that fails rests for a while (a minute for a rate limit, 12 hours for a used-up quota) and the device's own voice covers the gap. The keys are never in the page. On the server they come from `.env.local` through `/api/tts` and `/api/ask`. Without the server (any static host), a visitor can paste their own keys in the Listen options, and they're kept in that browser only. The older Puter.js version is still in `tts.js`, switched off by `PROVIDER`. A speaker icon on each heading reads from that section, and while it's playing you can click any paragraph to jump there. **Ask first**: hover the paragraph being read and press ✦ to ask a quick spoken (or typed) question. `gemini-3.5-flash-lite` answers in a few sentences using the page so far as context, the answer streams into the player and is spoken, and **Got it** carries on reading. Questions are kept per page in the browser and listed under the history button on the player. The voice button next to Listen lists the voices of the service reading right now (Gemini, ElevenLabs, or every English voice on this device). Each service remembers its own pick, and the names shown are ours: `GEMINI_VOICES` and `ELEVEN_VOICES` map them to the real voice ids, and `app/api/tts/route.ts` must allow the same ids. Drag the player down or sideways to stop. |
| `quiz.js`, `quiz.css` | The quiz and exam engine: question types, the drag-and-drop circuit builder, marking and saved progress. |
| `quizzes/` | The questions. `<subject>.js` holds the chapter quizzes and `<subject>-exam.js` holds the final exam. |
| `exam-*.html` | One separate final exam page per subject. |
| `favicon.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-*.png`, `site.webmanifest` | Site icons and the install manifest. |
| `robots.txt`, `sitemap.xml`, `assets/og/` | For search engines and link previews. Each page's description, canonical link and share image are in its `<head>`. |
| `materials/` | The original course files offered for download at the end of each page (notebooks are zipped). |
| `assets/` | Figures cropped from the slides and notebooks: `assets/ml`, `assets/ir`, `assets/qc`, `assets/dv`. Publish these along with the pages. |

## Running it

Needs Node 20 or newer.

```bash
cp .env.example .env.local   # then fill in GEMINI_API_KEY and ELEVENLABS_API_KEY
npm install
npm run dev                  # http://localhost:3100, reloads on change
```

For the real server:

```bash
npm run build
PORT=3100 npm start
```

Keep it running with `pm2 start npm --name study-hub -- start` or a systemd service. Port 3000 is already used by the PhumiYerng API.

In `.env.local`, set `ALLOWED_ORIGINS` to the addresses people use, comma-separated, for example `https://y4t1.chanraksa.com,http://localhost:3100`.

Put HTTPS in front with Caddy (`y4t1.chanraksa.com { reverse_proxy localhost:3100 }`), nginx, or a Cloudflare Tunnel, and point the domain's DNS at that server. Ask first needs the microphone, and browsers only allow the microphone on `https://` or `localhost`.

`CNAME` was for GitHub Pages and is no longer used.

The site addresses in `sitemap.xml`, `robots.txt` and each page's canonical and share tags use `http://`. Switch them to `https://` once the HTTPS certificate works.
