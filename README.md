# Maya's Notebook

A study notebook for course PDFs. Organize everything by **class → section → unit**. Imported PDFs become formatted, editable notes you can highlight and write in (with a keyboard or an Apple Pencil). AI turns it all into **dense, printable study sheets**, and **flashcards and quizzes** help it stick. The calendar pulls in Canvas due dates, exams and grade weights.

## What it does

- **Organize.** Classes (with course code and color) contain sections, which contain units. Rename, recolor, reorder or delete anything from the sidebar `⋯` menus or the class page.
- **PDFs become notes.** Drag PDFs anywhere in the app. Each one becomes an editable note with its formatting rebuilt: heading sizes, bold and italic from the PDF's fonts, indented sub-bullets, numbered lists, bolded "Term:" definitions, "Note:/Key point:" callouts, superscripts and links. The original PDF is one click away. Scanned PDFs can be converted with AI, and **Re-import from PDF** rebuilds a lecture's formatting.
- **Take notes.** A full rich-text editor: bold, italic, underline, strikethrough, highlights in six colors, text color, headings, lists, checklists, tables, quotes, links, sub/superscript. Markdown shortcuts work too (`# `, `- `, `[ ] `, `**bold**`, `==highlight==`). Notes save automatically.
- **Draw.** Sketches right in your notes with pressure-sensitive pen, highlighter and eraser, colors, sizes, undo/redo, and lined/grid/dot paper. It's built for Apple Pencil: the pencil draws while your finger scrolls.
- **Study sheets (AI).** Each PDF condenses to about one page; a unit sheet merges every lecture with your notes (★ marks your points); an exam review combines a section's unit sheets. Sheets are length-capped, editable, printable, and flag **"Sources changed"** when your material changes.
- **Practice.**
  - **Flashcards with spaced repetition.** Rate each card Again / Hard / Good / Easy. Hard cards come back sooner, and easy ones space out over days and weeks.
  - **Quizzes.** Multiple choice and typed answers, with instant feedback. Missed questions come back at the end, and the cards behind them return in the next review.
  - **Cram mode** flips through a whole unit or class.
  - **Cards come from your notes for free:** bold terms, "Term: definition" lines, highlights (as fill-in-the-blank), tables and short lists. **With AI**, it also writes flashcards and multiple-choice questions from your lectures.
  - XP, a daily goal, a streak, and a Practice hub showing every deck, what's due, and upcoming exams from your calendar.
- **Calendar + Canvas.** Paste your Canvas calendar feed link (the one you'd give Google Calendar) to bring in every assignment, quiz and exam. Add a Canvas access token to also get points, % of final grade and submission status. You can add your own events, link events to units, and see the week at a glance on the home page.
- **Search** (`Ctrl/⌘ + K`), dark mode, mobile layout, optional password.

## Run it locally

Requires Node.js 20.9+.

```bash
npm install
npm run build
npm start                    # http://localhost:3000
```

For development with hot reload use `npm run dev`.

Everything is stored in `./data` (a SQLite database plus the uploaded PDFs). Back up that folder to back up your notes.

## Turn on AI (free)

AI is optional. Notes, drawing, the calendar and flashcards made from your notes all work without it.

1. Open [Google AI Studio](https://aistudio.google.com/apikey), sign in with a Google account and click **Create API key**. No credit card needed.
2. In the app, click **Set up free AI** at the bottom of the sidebar and paste the key.

The key is checked, then stored only in the app's database. Heads-up: on Gemini's free tier, Google may use what you send (notes and PDFs) to improve its products, and there are daily limits. If you hit a limit, the app tells you to wait and try again.

Claude is also supported. Paste a Claude API key from [platform.claude.com](https://platform.claude.com/settings/keys) in the same dialog and choose which provider to use. Claude API use is billed per use, and a Claude Pro subscription doesn't include API access.

### Configuration

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | No | Gemini key, as an alternative to pasting it in AI settings. |
| `ANTHROPIC_API_KEY` | No | Claude key, as an alternative to pasting it in AI settings. |
| `GEMINI_MODEL` | No | Override the Gemini model (default `gemini-3.8-flash`). |
| `APP_PASSWORD` | When hosted | Requires a password to open the app. Always set it if the app is reachable from the internet. |
| `DATA_DIR` | No | Where the database and PDFs live (default `./data`). |

## Host it

The app keeps files on disk, so host it somewhere with a persistent volume (Railway, Render, Fly.io, a small VPS) rather than a serverless platform.

```bash
docker build -t maya-notebook .
docker run -p 3000:3000 -v notebook-data:/data -e APP_PASSWORD=choose-something maya-notebook
```

Mount a volume at `/data` so notes survive restarts and redeploys.

## How the AI works

- **Providers.** Gemini (`gemini-3.8-flash`, free tier) or Claude Opus 5 (`claude-opus-5`, adaptive thinking). Both stream progress live into the page and run as background jobs, so you can keep working.
- **PDFs are sent natively**, so the model reads tables, diagrams and scanned pages. Once you edit a lecture's text, your edited version is sent instead, and your highlights count as important. Very large units (over ~20 MB / 500 pages) fall back to text for the overflow.
- **Density is enforced.** Each sheet gets a hard word limit sized to the material (≈900 words per printed page), bullet fragments, bold key terms, compact tables and symbols, with no preamble.
- **Flashcards and quizzes** are requested as structured JSON, validated, de-duplicated against the cards you already have, and have their answer order shuffled.

## Project layout

```
src/
  app/(app)/          pages: home, calendar, practice, classes, sections, units
  app/print/          print layout
  app/api/            route handlers (CRUD, uploads, search, AI streaming, practice, Canvas)
  components/         UI: editor/ (incl. drawing/), practice/, calendar/, shell/, views/, ui/
  lib/db.ts           SQLite schema + migrations
  lib/repo.ts         notes, PDFs, sheets, full-text search
  lib/pdf.ts          PDF → formatted rich text
  lib/practice.ts     flashcards, spaced repetition, quiz building, streaks
  lib/card-extract.ts flashcards from notes (no AI)
  lib/llm.ts          Gemini + Claude streaming behind one interface
  lib/ai.ts           prompts (sheets, conversion, practice sets)
  lib/canvas.ts       Canvas feed + API sync
  proxy.ts            optional password gate
```

Built with Next.js 16, React 19, Tailwind CSS 4, TipTap 3, better-sqlite3, pdf.js (unpdf), perfect-freehand, the Google Gen AI SDK and the Anthropic SDK.
