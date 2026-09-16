import "server-only";
import { APP_NAME } from "./brand";
import { classColor } from "./colors";
import { PAGE_WIDTH } from "./ink";
import type { ShareBundle, SharedInkStroke, SharedNote, SharedUnit } from "./share";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON that can sit inside <script> without ending it early. */
const LINE_SEPARATORS = new RegExp("[" + String.fromCharCode(0x2028, 0x2029) + "]", "g");
const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(LINE_SEPARATORS, (c) => "\\u" + c.charCodeAt(0).toString(16));

const CSS = `
:root{--paper:#f6f4ef;--card:#fff;--sunken:#efece5;--line:#e4dfd4;--line-strong:#d2ccbe;--ink:#1d1b17;--ink-2:#4a463f;--ink-3:#8a847a;--accent:#2f5b4c;--accent-soft:#e2ece7;--mark:#fbe897;
--hl-yellow:#fbe897;--hl-green:#cdebc5;--hl-blue:#cfe3f7;--hl-pink:#f7d4e2;--hl-orange:#fbd9b6;--hl-purple:#e2d6f5;--tc-red:#c0392b;--tc-orange:#c46a12;--tc-green:#2e7d4f;--tc-blue:#2563b0;--tc-purple:#7b3fb0;--tc-gray:#7a756c}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15.5px/1.7 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:${PAGE_WIDTH + 48}px;margin:0 auto;padding:40px 24px 80px}
.brand{font-size:13px;font-weight:600;color:var(--accent);letter-spacing:.02em}
h1,h2,h3,h4{font-family:ui-serif,Georgia,"Times New Roman",serif;letter-spacing:-.01em;line-height:1.25}
h1.title{font-size:36px;margin:8px 0 4px}.meta{color:var(--ink-3);margin:0}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.btn{display:inline-flex;align-items:center;gap:6px;border-radius:10px;padding:9px 14px;font-weight:600;font-size:14px;text-decoration:none;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.hint{margin-top:14px;font-size:13px;color:var(--ink-3)}
.toc{margin:28px 0;padding:16px 20px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
.toc ul{margin:4px 0;padding-left:18px}.toc a{color:var(--ink-2);text-decoration:none}.toc a:hover{color:var(--accent)}
h2.section{font-size:26px;margin:48px 0 8px;padding-bottom:6px;border-bottom:2px solid var(--line)}
h3.unit{font-size:21px;margin:32px 0 10px}
.note{margin:18px 0 28px;border:1px solid var(--line);border-radius:16px;background:var(--card);overflow:hidden}
.note-head{display:flex;align-items:center;gap:8px;padding:12px 20px;border-bottom:1px solid var(--line);background:#faf9f5}
.note-head h4{margin:0;font-size:17px}.tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);background:var(--sunken);border-radius:999px;padding:2px 8px}
.page{position:relative;width:100%;max-width:${PAGE_WIDTH}px;margin:0 auto;padding:20px 48px 28px}
.page svg.ink{position:absolute;left:0;top:0;width:100%;overflow:visible;pointer-events:none}
.rich>:first-child{margin-top:0}.rich p{margin:.6em 0}.rich strong{font-weight:650}.rich a{color:var(--accent)}
.rich h1{font-size:1.65em}.rich h2{font-size:1.35em;padding-bottom:.3em;border-bottom:1px solid var(--line)}.rich h3{font-size:1.12em}
.rich h4{font-family:inherit;font-size:.8em;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-2)}
.rich ul,.rich ol{padding-left:1.35em}.rich li>p{margin:0}.rich ul ul{list-style:circle}.rich ol ol{list-style:lower-alpha}
.rich blockquote{border-left:3px solid var(--accent);background:#eef3f0;border-radius:0 10px 10px 0;padding:.45em .95em;margin:.8em 0;color:var(--ink-2)}
.rich mark{background:var(--mark);color:inherit;border-radius:3px;padding:0 .14em}
.rich code{font-family:ui-monospace,monospace;font-size:.88em;background:var(--sunken);border-radius:5px;padding:.05em .3em}
.rich pre{background:var(--sunken);border-radius:10px;padding:.8em 1em;overflow-x:auto}
.rich table{border-collapse:collapse;width:100%;font-size:.94em}.rich th,.rich td{border:1px solid var(--line-strong);padding:.35em .55em;text-align:left;vertical-align:top}.rich th{background:var(--sunken)}
.rich hr{border:0;border-top:1px dashed var(--line-strong);margin:1.6em 0}
.rich ul[data-type=taskList]{list-style:none;padding-left:.2em}.rich ul[data-type=taskList] li{display:flex;gap:.55em}
.rich .drawing-block{margin:1em 0;border:1px solid var(--line);border-radius:12px;overflow:hidden}.rich .drawing-block svg{display:block;width:100%;height:auto}
.page[data-spacing=roomy] .rich{line-height:2.6}.page[data-spacing=roomy] .rich p{margin:.7em 0}
details.box{margin:12px 0;border:1px solid var(--line);border-radius:14px;background:var(--card)}
details.box>summary{cursor:pointer;padding:12px 18px;font-weight:600}details.box>div{padding:4px 18px 16px}
.cards{display:grid;gap:8px}.card{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:14px;border-top:1px solid var(--line);padding:8px 0}
.card .front{font-weight:600}.card .back{white-space:pre-line;color:var(--ink-2)}
.q{margin:12px 0}.q ol{margin:6px 0;padding-left:22px}.q .answer{color:var(--tc-green);font-weight:600}
footer{margin-top:60px;color:var(--ink-3);font-size:13px;text-align:center}
@media (max-width:640px){.page{padding:16px 18px}.card{grid-template-columns:1fr;gap:2px}h1.title{font-size:28px}}
@media print{body{background:#fff}.actions,.hint,.toc{display:none}.note{break-inside:avoid-page}}
`;

// Places pre-rendered handwriting next to the text it was anchored to, like the app does.
const INK_SCRIPT = `
(function(){
  var W=${PAGE_WIDTH};
  function refTop(el){
    var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:function(n){return n.nodeValue&&n.nodeValue.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP}});
    var text=walker.nextNode();
    if(text){var range=document.createRange();var start=text.nodeValue.search(/\\S/);range.setStart(text,start);range.setEnd(text,start+1);var box=range.getClientRects()[0];if(box)return box.top}
    return el.getBoundingClientRect().top;
  }
  function layout(){
    document.querySelectorAll(".page[data-ink]").forEach(function(page){
      var strokes=JSON.parse(page.getAttribute("data-ink")||"[]");
      var rect=page.getBoundingClientRect();var scale=rect.width/W||1;
      var anchors={};page.querySelectorAll("[data-bid]").forEach(function(el){anchors[el.getAttribute("data-bid")]=(refTop(el)-rect.top)/scale});
      var svg=page.querySelector("svg.ink");var ns="http://www.w3.org/2000/svg";
      while(svg.firstChild)svg.removeChild(svg.firstChild);
      var height=rect.height/scale;
      strokes.forEach(function(s){
        var y=s.a?(anchors[s.a]!=null?anchors[s.a]:(s.ay||0)):0;
        var p=document.createElementNS(ns,"path");p.setAttribute("d",s.d);p.setAttribute("transform","translate(0 "+y+")");
        p.style.fill=s.c;p.style.fillOpacity=s.o;svg.appendChild(p);
        height=Math.max(height,y+40);
      });
      svg.setAttribute("viewBox","0 0 "+W+" "+height);svg.style.height=(height*scale)+"px";
    });
  }
  window.addEventListener("load",layout);window.addEventListener("resize",layout);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(layout);
})();
`;

/** Rough bottom edge of the handwriting, for a page that can't measure it in a browser. */
function inkExtent(paths: SharedInkStroke[]) {
  let bottom = 0;
  for (const stroke of paths) {
    for (const pair of stroke.d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g) ?? []) {
      const y = Number(pair.split(",")[1]);
      if (Number.isFinite(y)) bottom = Math.max(bottom, y + (stroke.ay ?? 0));
    }
  }
  return Math.ceil(bottom + 40);
}

/** Handwriting drawn where it was when written — for files opened somewhere that can't run the layout script. */
function staticInk(paths: SharedInkStroke[]) {
  if (!paths.length) return "";
  const height = inkExtent(paths);
  const svg = `<svg class="ink" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH} ${height}" style="height:${height}px" aria-label="Handwriting">`;
  return `${svg}${paths
    .map((s) => `<path d="${esc(s.d)}" transform="translate(0 ${s.ay ?? 0})" style="fill:${esc(s.c)};fill-opacity:${s.o}"/>`)
    .join("")}</svg>`;
}

function noteHtml(note: SharedNote) {
  const ink = note.paths.length ? ` data-ink="${esc(JSON.stringify(note.paths))}"` : "";
  return `<article class="note">
  <div class="note-head"><h4>${esc(note.title)}</h4>${note.kind === "lecture" ? `<span class="tag">Lecture</span>` : ""}</div>
  <div class="page"${ink}${note.line_spacing === "roomy" ? ` data-spacing="roomy"` : ""}>
    <div class="rich">${note.html}</div>
    ${note.paths.length ? `<svg class="ink" xmlns="http://www.w3.org/2000/svg" aria-label="Handwriting"></svg>` : ""}
  </div>
</article>`;
}

function unitHtml(unit: SharedUnit, anchor: string) {
  const parts = [`<h3 class="unit" id="${anchor}">${esc(unit.name)}</h3>`];
  if (unit.sheet) parts.push(`<details class="box" open><summary>Study sheet</summary><div class="rich">${unit.sheet}</div></details>`);
  parts.push(...unit.notes.map(noteHtml));
  if (unit.cards.length)
    parts.push(
      `<details class="box"><summary>Flashcards (${unit.cards.length})</summary><div class="cards">${unit.cards
        .map((c) => `<div class="card"><div class="front">${esc(c.front)}</div><div class="back">${esc(c.back)}</div></div>`)
        .join("")}</div></details>`,
    );
  if (unit.questions.length)
    parts.push(
      `<details class="box"><summary>Practice questions (${unit.questions.length})</summary><div>${unit.questions
        .map(
          (q, i) =>
            `<div class="q"><strong>${i + 1}. ${esc(q.prompt)}</strong><ol type="A">${q.choices.map((c) => `<li>${esc(c)}</li>`).join("")}</ol><details><summary>Show answer</summary><span class="answer">${esc(q.choices[q.answer] ?? "")}</span>${q.explanation ? ` — ${esc(q.explanation)}` : ""}</details></div>`,
        )
        .join("")}</div></details>`,
    );
  if (!unit.sheet && !unit.notes.length && !unit.cards.length && !unit.questions.length) parts.push(`<p class="meta">Nothing shared in this unit.</p>`);
  return parts.join("\n");
}

/** A self-contained page: readable in any browser, printable, and importable into another notebook. */
export function renderShareHtml(bundle: ShareBundle, options: { downloadUrl?: string } = {}) {
  const klass = bundle.class;
  const color = classColor(klass.color);
  const multiUnit = klass.sections.reduce((n, s) => n + s.units.length, 0) > 1;
  const date = new Date(bundle.exported_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const toc = multiUnit
    ? `<nav class="toc"><strong>Contents</strong><ul>${klass.sections
        .map((s, si) => `<li><a href="#s${si}">${esc(s.name)}</a><ul>${s.units.map((u, ui) => `<li><a href="#s${si}u${ui}">${esc(u.name)}</a></li>`).join("")}</ul></li>`)
        .join("")}</ul></nav>`
    : "";

  const body = klass.sections
    .map((s, si) => {
      const heading = bundle.scope === "class" ? `<h2 class="section" id="s${si}">${esc(s.name)}</h2>` : "";
      const sheet = s.sheet ? `<details class="box"><summary>Exam review sheet</summary><div class="rich">${s.sheet}</div></details>` : "";
      return heading + sheet + s.units.map((u, ui) => (bundle.scope === "note" ? u.notes.map(noteHtml).join("") : unitHtml(u, `s${si}u${ui}`))).join("\n");
    })
    .join("\n");

  const context = bundle.scope === "class" ? [klass.code, "Shared class"].filter(Boolean).join(" · ") : `${klass.name}${klass.code ? ` (${klass.code})` : ""}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(bundle.title)} — shared from ${esc(APP_NAME)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="brand">${esc(APP_NAME)} · shared notes</div>
  <h1 class="title" style="border-left:6px solid ${color};padding-left:14px">${esc(bundle.title)}</h1>
  <p class="meta">${esc(context)} · shared ${esc(date)}</p>
  <div class="actions">
    ${options.downloadUrl ? `<a class="btn primary" href="${esc(options.downloadUrl)}">Download a copy</a>` : ""}
    <a class="btn" href="#" onclick="window.print();return false">Print or save as PDF</a>
  </div>
  <p class="hint">Have ${esc(APP_NAME)} too? Save this file, then in the app click <strong>+</strong> next to Classes → <strong>Import shared notes</strong>.</p>
  ${toc}
  ${body}
  <footer>Shared from ${esc(APP_NAME)}</footer>
</div>
<script type="application/json" id="maya-notebook-share">${scriptJson(bundle)}</script>
<script>${INK_SCRIPT}</script>
</body>
</html>`;
}

/**
 * One note as a standalone document, for saving a copy.
 * `forWord` places handwriting where it was drawn (Word can't run the layout script); the printable
 * version measures the text in the browser first, so the ink lands exactly where it does in the app.
 */
export function renderNoteDocument(options: { title: string; context: string; updatedAt: string; note: SharedNote; forWord: boolean }) {
  const { note, forWord } = options;
  const date = new Date(options.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const page = forWord
    ? `<div class="page"${note.line_spacing === "roomy" ? ` data-spacing="roomy"` : ""}>
    <div class="rich">${note.html}</div>
    ${staticInk(note.paths)}
  </div>`
    : `<div class="page"${note.paths.length ? ` data-ink="${esc(JSON.stringify(note.paths))}"` : ""}${note.line_spacing === "roomy" ? ` data-spacing="roomy"` : ""}>
    <div class="rich">${note.html}</div>
    ${note.paths.length ? `<svg class="ink" xmlns="http://www.w3.org/2000/svg" aria-label="Handwriting"></svg>` : ""}
  </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(options.title)}</title>
<style>${CSS}
.wrap{padding-top:28px}
.note{border:0;background:transparent}
.page{padding:8px 0 24px}
@media print{.actions,.hint{display:none}.wrap{padding:0}}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">${esc(APP_NAME)}</div>
  <h1 class="title">${esc(options.title)}</h1>
  <p class="meta">${esc(options.context)} · ${esc(date)}</p>
  ${forWord ? "" : `<div class="actions"><a class="btn primary" href="#" onclick="window.print();return false">Save as PDF</a></div>
  <p class="hint">Your browser's print window opens by itself — choose <strong>Save as PDF</strong> as the printer.</p>`}
  <article class="note">${page}</article>
</div>
${forWord ? "" : `<script>${INK_SCRIPT}</script>\n<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})</script>`}
</body>
</html>`;
}

/** A file name that is safe on Windows, macOS and iPadOS. */
export const exportFileName = (title: string, extension: string) =>
  `${title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Note"}.${extension}`;

export const shareFileName = (bundle: ShareBundle) =>
  `${bundle.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Shared notes"} - shared notes.html`;
