# Maya's Notebook

A study notebook for course PDFs. Organize everything by **class → section → unit**, read PDFs side by side with your own rich-text notes, and let Claude turn it all into **dense, printable study sheets** — one page per PDF, one or two per unit.

## What it does

- **Organize** — classes (with course code and color) contain sections, which contain units. Rename, recolor, reorder or delete anything from the sidebar `⋯` menus or the class page.
- **Upload PDFs** — drag PDFs anywhere in the app, or into a unit. Text is extracted for search; the original PDF opens in a built-in viewer.
- **Take notes** — a full rich-text editor: bold, italic, underline, strikethrough, highlights in six colors, text color, headings, bullet/numbered lists, checklists, tables, quotes, links, sub/superscript. Select text for a quick-format bubble. Markdown shortcuts work too (`# `, `- `, `[ ] `, `**bold**`, `==highlight==`). Notes save automatically.
- **Study sheets (Claude)**
  - **Condensed PDF** — each PDF becomes a ~1-page sheet (optionally right after upload, in the background).
  - **Unit study sheet** — merges every PDF in the unit with your notes. Points from your notes are marked ★, and anything you highlighted or bolded is treated as important.
  - **Exam review** — combines a section's unit sheets into one higher-level review.
  - Sheets are strictly length-capped, fully editable afterwards, and flag **"Sources changed"** when you add PDFs or edit notes.
- **Print / Save as PDF** — a dense 1-, 2- or 3-column print layout with a page estimate.
- **Search** — `Ctrl/⌘ + K` searches classes, PDF text, notes and sheets.
- Dark mode, mobile layout, optional password.

## Run it locally

Requires Node.js 20.9+.

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run build
npm start                    # http://localhost:3000
```

For development with hot reload use `npm run dev`.

Everything is stored in `./data` (a SQLite database plus the uploaded PDFs). Back up that folder to back up your notes.

### Configuration

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | For AI sheets | Claude API key from the [Claude Console](https://platform.claude.com/) → Settings → API keys (add credits under Billing first). Without it the app works; the AI buttons are disabled. |
| `APP_PASSWORD` | When hosted | Requires a password to open the app. Always set it if the app is reachable from the internet. |
| `DATA_DIR` | No | Where the database and PDFs live (default `./data`). |

## Host it

The app keeps files on disk, so host it somewhere with a persistent volume (Railway, Render, Fly.io, a small VPS) rather than a serverless platform.

```bash
docker build -t maya-notebook .
docker run -p 3000:3000 -v notebook-data:/data \
  -e ANTHROPIC_API_KEY=sk-ant-... -e APP_PASSWORD=choose-something \
  maya-notebook
```

Mount a volume at `/data` so notes survive restarts and redeploys.

## How the AI works

- Model: **Claude Opus 5** (`claude-opus-5`) with adaptive thinking, streamed live into the page.
- PDFs are sent natively, so Claude reads tables, diagrams and scanned pages. Very large units (over ~20 MB / 500 pages) fall back to extracted text for the overflow.
- The prompt enforces density: a hard word limit sized to the material (≈900 words per printed page), bullet fragments, bold key terms, compact tables, symbols (→ ↑ ≠), and no preamble or summaries.
- Server-side refusal fallback is enabled (`fallbacks: "default"`), so if a safety classifier declines, Anthropic retries on its recommended fallback model automatically.
- Regenerating shortly after a previous run reuses prompt caching for the PDFs, which makes it cheaper.

Cost scales with PDF length: each PDF page is roughly 1.5–3k input tokens. At Opus 5 pricing ($5 / $25 per million input/output tokens), condensing a 20-page lecture costs about $0.20–$0.50; a unit sheet costs roughly the sum of its PDFs.

## Project layout

```
src/
  app/(app)/        pages: home, classes, sections, units, documents
  app/print/        print layout
  app/api/          route handlers (CRUD, uploads, search, sheet streaming)
  components/       UI — editor/, shell/, views/, ui/
  lib/db.ts         SQLite schema
  lib/repo.ts       data access + full-text search
  lib/ai.ts         prompts + Claude streaming
  lib/jobs.ts       background generation queue
  proxy.ts          optional password gate
```

Built with Next.js 16, React 19, Tailwind CSS 4, TipTap 3, better-sqlite3 and the Anthropic SDK.
