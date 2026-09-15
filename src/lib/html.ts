import "server-only";
import sanitizeHtml from "sanitize-html";
import { markdownToHtml } from "./markdown";

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^var\(--[\w-]+\)$/];

// Everything the rich-text editor can produce, and nothing else.
const RICH: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "p", "br", "hr", "blockquote", "pre", "code",
    "strong", "b", "em", "i", "u", "s", "del", "mark", "span", "sub", "sup", "a",
    "ul", "ol", "li", "label", "input", "div",
    "table", "colgroup", "col", "thead", "tbody", "tr", "th", "td",
    // pen sketches (vector strokes + their SVG rendering)
    "svg", "path",
  ],
  allowedAttributes: {
    div: ["data-type", "data-id", "data-strokes", "data-height", "data-paper", "class"],
    svg: ["viewbox", "viewBox", "xmlns", "preserveaspectratio", "preserveAspectRatio"],
    path: ["d", "style"],
    a: ["href", "target", "rel"],
    mark: ["data-color", "style"],
    span: ["style"],
    p: ["style"],
    h1: ["style"], h2: ["style"], h3: ["style"], h4: ["style"],
    ul: ["data-type"],
    ol: ["start", "type"],
    li: ["data-type", "data-checked"],
    input: ["type", "checked"],
    th: ["colspan", "rowspan", "colwidth"],
    td: ["colspan", "rowspan", "colwidth"],
    col: ["style"],
    table: ["style"],
  },
  allowedStyles: {
    "*": {
      color: COLOR,
      "background-color": COLOR,
      "text-align": [/^(left|right|center|justify)$/],
    },
    path: { fill: COLOR, "fill-opacity": [/^(0(\.\d+)?|1)$/] },
    col: { width: [/^\d+px$/], "min-width": [/^\d+px$/] },
    table: { "min-width": [/^\d+px$/], width: [/^\d+px$/] },
  },
  allowedClasses: { div: ["drawing-block"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, RICH);
}

export function markdownToSafeHtml(md: string): string {
  return sanitizeRichHtml(markdownToHtml(md));
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ",
};

/** Plain text for search indexing and word counts. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/h\d|\/li|\/tr|\/blockquote|\/pre)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " \t ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e] ?? e)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/**
 * Compact HTML for prompts: keeps structure and emphasis (including <mark>,
 * which tells Claude what the student highlighted) but drops all attributes.
 */
export function htmlForPrompt(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "p", "br", "blockquote", "pre", "code", "strong", "em",
      "u", "s", "mark", "sub", "sup", "ul", "ol", "li", "table", "tr", "th", "td",
    ],
    allowedAttributes: {},
    transformTags: { b: "strong", i: "em", del: "s" },
    exclusiveFilter: (frame) => frame.tag === "p" && !frame.text.trim(),
  })
    .replace(/<\/?(tbody|thead|colgroup|label|div|span)>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function wordCount(html: string): number {
  const text = htmlToText(html);
  return text ? text.split(/\s+/).length : 0;
}
