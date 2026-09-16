# Handoff: data-safety branch

Temporary notes for finishing this branch. **Delete this file in the merge commit to `main`.**

## Where things stand

Branch `data-safety` (pushed), two commits on top of `main` (`eefa417`):

- `17d3db7` — the fixes (see its message for the full list).
- `68b68a4` — delete warnings mention flashcards/quizzes, long toasts stay 9s, README backup section.

Verified: `npx tsc --noEmit` and `npx eslint src` are clean, and **all 25 data-safety scenarios pass**
against a fresh build (`scratchpad/e2e/safety-test.mjs`, see below). Each scenario was first shown to
fail on `main`.

**Not yet run on this branch: the three existing suites** (API 251, UI 50, auth 16). That is the next
job — the changes touch the notes workspace, sheets, practice and the note API, so regressions are
likely to show up there.

## 1. Run the regression suites

Rules that still apply: never touch `.next` or `./data` (the user's real notes, dev server on :3000),
always build with `NEXT_DIST_DIR=.next-test`, always `git checkout -- tsconfig.json` after a build
(next build rewrites it), and keep `GEMINI_API_KEY=""` so no real free-tier quota is used.

Mock servers (may still be running from the previous session — check before starting):
`mock-anthropic.mjs` on 4010, `mock-canvas.mjs` on 4020, `mock-gemini.mjs` on 4030, all in
`<scratchpad>/e2e`.

Build once: `$env:NEXT_DIST_DIR = ".next-test"; npx next build`

Then one server per suite (each in its own background shell, `Set-Location C:\Users\Houst\maya-note-taker`,
`$env:NEXT_DIST_DIR = ".next-test"`, `$env:GEMINI_API_KEY = ""`, `$env:ANTHROPIC_API_KEY = "sk-test-mock"`,
`$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:4010"`, `$env:GEMINI_BASE_URL = "http://127.0.0.1:4030"`):

| Suite | `DATA_DIR` | Port | Extra |
| --- | --- | --- | --- |
| `api-test.mjs` | `<e2e>\data-api` | 3100 | `MOCK_LOG`, `GEMINI_MOCK_LOG` set to the `*.jsonl` files in `<e2e>` |
| `ui-test.mjs` | `<e2e>\data-ui` | 3101 | needs Edge (Playwright `channel: "msedge"`) |
| `auth-test.mjs` | `<e2e>\data-auth` | 3102 | `APP_PASSWORD = "correct horse"` |
| `safety-test.mjs` | `<e2e>\data-safety` | 3103 | delete the data dir first for a clean run |

Run with `$env:BASE = "http://127.0.0.1:<port>"`, `$env:DATA_DIR = ...`, `Set-Location <e2e>`,
`node <suite>.mjs`. Delete the suite's data dir first if it was used before.

### Expect these existing checks to need updating (behaviour changed on purpose)

- Save indicator wording: "Couldn't save — retry" is now "Couldn't save yet — retrying" (or
  "Couldn't save: <reason>" when retrying can't help).
- "Reset progress" on a flashcard now asks for confirmation first.
- Re-import of a PDF with no text layer no longer clears the note; the toast now reads
  "This PDF has no selectable text, so nothing was changed. Try Convert with AI instead."
- Unit tabs stay mounted, so `.ProseMirror` / sheet / practice nodes can exist in the DOM while
  another tab is showing. Selectors that assume only one is present may need `:visible` or a scope.
- `PATCH /api/notes/:id` now returns `{ updated_at, ink_updated_at }` and can answer 409.

## 2. Merge and push

Once the suites pass: delete this file, merge `data-safety` into `main`, push. The girlfriend's clone
picks it up; the database migrates itself (schema 7) and writes a `before-update` backup first.

## 3. Known issues still open (smallest first)

- Importing a shared notebook silently drops handwriting it can't validate (`importBundle` in
  `src/lib/share.ts` swallows the `sanitizeInk` error). Should tell the importer instead.
- Two tabs practising offline at the same time can overwrite each other's queued results
  (`maya:unsent-practice` in `src/lib/practice-sync.ts` is written per tab).
- An AI conversion that hits the model's output limit still replaces the whole lecture note with the
  truncated version (`transcribeDocument` in `src/lib/ai.ts`). A warning is shown, but the previous
  text is gone. Consider keeping the old text as a copy before replacing.
- No UI for the backups in `data/backups` (restoring is a manual file copy, documented in the README).

## 4. Untested with real hardware (unchanged from before)

A real Canvas account, a real iPad + Apple Pencil, and a share link opened from another device.
The iPad matters most here: pen-mode save status, the draft recovery after Safari discards the tab,
and back-swipe navigation are the paths these fixes changed.
