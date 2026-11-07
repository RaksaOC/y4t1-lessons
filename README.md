# Year 4 Study Hub: source

Live at http://y4t1.chanraksa.com through GitHub Pages.

| File | What it is |
|---|---|
| `index.html` | The landing page where you pick a subject. |
| `quantum.html` | Quantum Computing, "From Bits to Shor" (the page from your quantum artifact). |
| `lecture.js` | The script behind `quantum.html`: simulator and demos. |
| `ir.html` | Information Retrieval, "From Substring to NDCG". Its script is inside the file. |
| `ml.html` | Machine Learning, "From Rules to Recall". Its script is inside the file. |
| `devops.html` | DevOps, "From Commit to Container". Its script is inside the file. |
| `themes.css`, `themes.js` | The theme picker, the 14 extra themes (each with light and dark) and the light/dark icon button. Every page loads both. |
| `export.js` | The Download and full screen buttons on each subject page. Download makes an A4 PDF, or a zip with one PNG per page, in the current theme. It runs in the browser, so it needs the live site or a local server, not a file opened directly. |
| `quiz.js`, `quiz.css` | The quiz and exam engine: question types, the drag-and-drop circuit builder, marking and saved progress. |
| `quizzes/` | The questions. `<subject>.js` holds the chapter quizzes and `<subject>-exam.js` holds the final exam. |
| `exam-*.html` | One separate final exam page per subject. |
| `favicon.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-*.png`, `site.webmanifest` | Site icons and the install manifest. |
| `robots.txt`, `sitemap.xml`, `assets/og/` | For search engines and link previews. Each page's description, canonical link and share image are in its `<head>`. |
| `materials/` | The original course files offered for download at the end of each page (notebooks are zipped). |
| `assets/` | Figures cropped from the slides and notebooks: `assets/ml`, `assets/ir`, `assets/qc`, `assets/dv`. Publish these along with the pages. |

To view locally, open `index.html` in a browser. To publish changes, push to `main`.

The site addresses in `sitemap.xml`, `robots.txt` and each page's canonical and share tags use `http://`. Switch them to `https://` once the HTTPS certificate works.
