# Maya's Notebook

A study notebook for course PDFs. Organize everything by **class → section → unit**. Imported PDFs become formatted, editable notes you can highlight, type in, and write on by hand with an Apple Pencil. AI turns it all into **dense, printable study sheets**, and **flashcards and quizzes** help it stick. Canvas brings in due dates, exams and your **grades**.

The app runs on your own computer and opens in your web browser. Your notes stay on your computer. **New here? Go to [Set it up](#set-it-up).**

## What it does

- **Organize.** Classes (with course code and color) contain sections, which contain units. Rename, recolor, reorder or delete anything from the sidebar `⋯` menus or the class page.
- **PDFs become notes.** Drag PDFs anywhere in the app. Each one becomes an editable note with its formatting rebuilt: heading sizes, bold and italic from the PDF's fonts, indented sub-bullets, numbered lists, bolded "Term:" definitions, "Note:/Key point:" callouts, superscripts and links. The original PDF is one click away. Scanned PDFs can be converted with AI, and **Re-import from PDF** rebuilds a lecture's formatting.
- **Take notes.** A full rich-text editor: bold, italic, underline, strikethrough, highlights in six colors, text color, headings, lists, checklists, tables, quotes, links, sub/superscript. Markdown shortcuts work too (`# `, `- `, `[ ] `, `**bold**`, `==highlight==`). Notes save automatically.
- **Write on the page.** Click **Draw** to handwrite anywhere on a note: underline words, circle terms, write between lines or in the margins. Pinch or use the zoom buttons to zoom in for small writing, and turn on **Roomy** lines for more space between lines. Ink stays attached to the text it's next to, so it moves along when you add lines above. With an Apple Pencil you don't even need Draw mode: the pencil writes while your finger scrolls and taps to type. The pen has pressure, a highlighter, an eraser, colors, sizes and undo. For a separate drawing, add a **Sketch box** from the editor's **⋯** menu.
- **Study sheets (AI).** Each PDF condenses to about one page; a unit sheet merges every lecture with your notes (★ marks your points); an exam review combines a section's unit sheets. Sheets are length-capped, editable, printable, and flag **"Sources changed"** when your material changes.
- **Practice.**
  - **Flashcards with spaced repetition.** Rate each card Again / Hard / Good / Easy. Hard cards come back sooner, and easy ones space out over days and weeks.
  - **Quizzes.** Multiple choice and typed answers, with instant feedback. Missed questions come back at the end, and the cards behind them return in the next review.
  - **Cram mode** flips through a whole unit or class.
  - **Cards come from your notes for free:** bold terms, "Term: definition" lines, highlights (as fill-in-the-blank), tables and short lists. **With AI**, it also writes flashcards and multiple-choice questions from your lectures.
  - XP, a daily goal, a streak, and a Practice hub showing every deck, what's due, and upcoming exams from your calendar.
- **Calendar + Canvas.** Click **Connect Canvas** at the bottom of the sidebar. Paste your Canvas calendar feed link (the one you'd give Google Calendar) to bring in every assignment, quiz and exam. Add a Canvas access token to also get points, % of final grade and submission status. You can add your own events, link events to units, and see the week at a glance on the home page.
- **Grades.** With a Canvas access token, the **Grades** page shows your current grade in each class and each assignment's score. It also shows how much each assignment is worth toward your final grade and how much of that you earned, plus how much of the course is still to come.
- **Share with classmates.** Click **Share** on a class, unit (**⋯** menu) or note (bottom bar). Choose what to include: your notes and handwriting, lecture notes, study sheets, and flashcards and quiz questions. Then:
  - **Send a file.** One page that opens in any browser and can be printed. Classmates who have this app can import it with **+** next to Classes → **Import shared notes**.
  - **Share a link.** A read-only page. It works for classmates on the same Wi-Fi while your computer is on and the app is running, or anywhere if the app is hosted online. You can stop sharing a link at any time.
- **Search** (`Ctrl/⌘ + K`), dark mode, mobile layout, optional password.

## Set it up

You do this once. It takes about 15 minutes, most of it waiting for downloads.

### 1. Install Node.js and Git

- **Node.js** runs the app. Download the **LTS** version from [nodejs.org](https://nodejs.org) and install it with the default options. You need version 22 or newer.
- **Git** downloads the app and its updates.
  - **Windows:** download it from [git-scm.com](https://git-scm.com/downloads) and install it with the default options.
  - **Mac:** open Terminal (step 2) and run `git --version`. If Git isn't installed, your Mac offers to install it. Click **Install**.

### 2. Open a terminal

- **Windows:** open the Start menu, type **Command Prompt** and open it.
- **Mac:** press `⌘ + Space`, type **Terminal** and open it.

If a terminal was already open while you installed, close it and open a new one so it finds Node.js and Git.

To check the installs, run these two commands. Each one should print a version number, and Node's should start with `v22` or higher.

```bash
node -v
git --version
```

### 3. Download the app

```bash
git clone https://github.com/Hparker6/maya-note-taker.git
cd maya-note-taker
```

This creates a `maya-note-taker` folder in your home folder (`C:\Users\<you>` on Windows, `/Users/<you>` on a Mac).

### 4. Install and build

```bash
npm install
npm run build
```

This takes a few minutes. Warnings are normal. If you see errors, check [Troubleshooting](#troubleshooting).

### 5. Start it

```bash
npm start
```

Open **http://localhost:3000** in your browser and bookmark it.

### 6. Turn on AI (optional, free)

AI is optional. Notes, drawing, the calendar and flashcards made from your notes all work without it.

1. Open [Google AI Studio](https://aistudio.google.com/apikey), sign in with a Google account and click **Create API key**. No credit card needed.
2. In the app, click **Set up free AI** at the bottom of the sidebar and paste the key.

The key is checked, then stored only in the app's database. Heads-up: on Gemini's free tier, Google may use what you send (notes and PDFs) to improve its products, and there are daily limits. If you hit a limit, the app tells you to wait and try again.

Claude is also supported. Paste a Claude API key from [platform.claude.com](https://platform.claude.com/settings/keys) in the same dialog and choose which provider to use. Claude API use is billed per use, and a Claude Pro subscription doesn't include API access.

## Everyday use

### Desktop icon and taskbar (Windows)

Open it like any other app, without a terminal:

1. In the `maya-note-taker` folder, run this once:

   ```bash
   npm run shortcut
   ```

   This adds a **Maya's Notebook** icon to your Desktop and Start menu.
2. Double-click the icon. The app starts in the background and opens in its own window. The first time, and after updates, a window shows it getting ready for a few minutes.
3. **Pin to the taskbar:** open Start, find **Maya's Notebook**, right-click it and choose **Pin to taskbar**.

The app keeps running in the background after you close its window, so it opens instantly next time. To stop it, run `npm run stop`.

On a Mac, open the app in Chrome and choose **⋮ → Cast, save, and share → Install page as app** to get a Dock icon. The app still needs to be running with `npm start`.

### Start and stop from a terminal

- **Start:** open a terminal and run:

  ```bash
  cd maya-note-taker
  npm start
  ```

  Then open http://localhost:3000.
- **Keep the terminal window open** while you use the app. Closing it stops the app.
- **Stop:** click the terminal window and press `Ctrl + C`, or close the window.

### Your data

Everything you add lives in the `data` folder inside `maya-note-taker`: the database with your notes, sheets, flashcards and calendar, the PDFs you uploaded, and any AI keys you pasted in.

- **It stays on your computer.** The `data` folder is excluded from Git, so it's never uploaded, and updates never overwrite it.
- **Back up:** stop the app, then copy the `data` folder somewhere safe, like a USB drive or cloud storage.
- **Move to a new computer:** do [Set it up](#set-it-up) steps 1–4 there. Copy your backed-up `data` folder into the new `maya-note-taker` folder, replacing any `data` folder already there. Then start the app.
- **Don't keep the `maya-note-taker` folder inside OneDrive, iCloud Drive or Dropbox.** Syncing the database while the app is running can corrupt it. Put backup copies there instead.
- **Automatic backups:** the app copies its database (notes, handwriting, study sheets, flashcards, quizzes) to `data/backups` shortly after starting, then about once a day, keeping the last 14, plus a copy before any update. To restore one: run `npm run stop`, delete `data/maya.db`, `data/maya.db-wal` and `data/maya.db-shm`, copy the backup to `data/maya.db`, and open the notebook again. PDFs stay in `data/files` and aren't copied.
- **Don't share your `data` folder.** It contains your AI keys.

### Get updates

When new features are available:

1. Stop the app (`Ctrl + C`).
2. Back up your `data` folder (recommended).
3. Run:

   ```bash
   git pull
   npm install
   npm run build
   npm start
   ```

If you use the desktop icon, just run `npm run stop` and `git pull`, then open the icon. It rebuilds the app on its own. Your notes aren't affected.

### Use it on a phone or iPad

This works while your computer is on, the app is running, and both devices are on the same Wi-Fi.

1. Find your computer's IP address:
   - **Windows:** run `ipconfig` in Command Prompt and look for **IPv4 Address**, for example `192.168.1.23`.
   - **Mac:** open **System Settings → Wi-Fi**, click **Details** next to your network, and look for **IP address**.
2. On the phone or iPad, open `http://` + that address + `:3000`, for example `http://192.168.1.23:3000`.
3. If Windows asks whether to allow Node.js on networks, allow it on **private networks**.

The address can change, for example after your router restarts. If the page stops loading, look it up again.

Anyone on the same Wi-Fi can open the app too. On shared networks like a dorm or campus, [set a password](#configuration) first.

Handwriting with an Apple Pencil works here too. Tip: in Safari, tap **Share → Add to Home Screen** for an app icon on the iPad.

## Troubleshooting

| Problem | Fix |
|---|---|
| `'node' is not recognized` or `command not found` (also for `git` or `npm`) | Close the terminal and open a new one. If that doesn't help, install Node.js or Git again. |
| **Windows:** "running scripts is disabled on this system" | You're in PowerShell. Use **Command Prompt** instead (step 2). |
| `npm install` fails with errors mentioning `better-sqlite3` or `node-gyp` | Your Node.js version isn't supported. Install the **LTS** version from [nodejs.org](https://nodejs.org), delete the `node_modules` folder and run `npm install` again. |
| "Port 3000 is already in use" or `EADDRINUSE` | The app is probably already running in another terminal window. Close that window, or start on another port with `npm start -- -p 3001` and open http://localhost:3001. |
| The page won't load | Check that the terminal window is still open and the computer didn't go to sleep. Then run `npm start` again. |
| An update doesn't show up | Stop the app and run `npm run build`, then `npm start`. |

## Configuration

Settings are optional. To change them:

1. Copy `.env.example` to a new file named `.env.local` in the `maya-note-taker` folder.
2. Fill in the values you want.
3. Stop the app, then run `npm run build` and `npm start`.

| Variable | Required | Purpose |
|---|---|---|
| `APP_PASSWORD` | When other devices can reach it | Requires a password to open the app. Always set it if the app is reachable from other devices or the internet. |
| `GEMINI_API_KEY` | No | Gemini key, as an alternative to pasting it in AI settings. |
| `ANTHROPIC_API_KEY` | No | Claude key, as an alternative to pasting it in AI settings. |
| `GEMINI_MODEL` | No | Override the Gemini model (default `gemini-3.8-flash`). |
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

## Development

Run `npm run dev` for development with hot reload.

```
src/
  app/(app)/          pages: home, calendar, practice, grades, classes, sections, units
  app/print/          print layout
  app/api/            route handlers (CRUD, uploads, search, AI streaming, practice, Canvas)
  components/         UI: editor/ (incl. ink/ and drawing/), practice/, grades/, calendar/, shell/, views/, ui/
  lib/db.ts           SQLite schema + migrations
  lib/repo.ts         notes, PDFs, sheets, full-text search
  lib/pdf.ts          PDF → formatted rich text
  lib/practice.ts     flashcards, spaced repetition, quiz building, streaks
  lib/card-extract.ts flashcards from notes (no AI)
  lib/llm.ts          Gemini + Claude streaming behind one interface
  lib/ai.ts           prompts (sheets, conversion, practice sets)
  lib/canvas.ts       Canvas feed + API sync
  lib/grades.ts       grades from Canvas: scores, weights, class grades
  lib/ink.ts          handwriting on the page (format + validation)
  lib/share*.ts       share links, share files (render + import)
  scripts/windows/    desktop shortcut, background launcher, stop
  proxy.ts            optional password gate
```

Built with Next.js 16, React 19, Tailwind CSS 4, TipTap 3, better-sqlite3, pdf.js (unpdf), perfect-freehand, the Google Gen AI SDK and the Anthropic SDK. Requires Node.js 22+.
