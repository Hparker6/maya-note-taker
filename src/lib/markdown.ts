import { Marked, type TokenizerAndRendererExtension } from "marked";

// Claude writes sheets in Markdown; `==text==` marks a highlighted fact.
const highlight: TokenizerAndRendererExtension = {
  name: "highlight",
  level: "inline",
  start(src) {
    const i = src.indexOf("==");
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const match = /^==(?=\S)([^=\n]*?\S)==/.exec(src);
    if (!match) return undefined;
    return {
      type: "highlight",
      raw: match[0],
      text: match[1],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
  },
};

const marked = new Marked({ gfm: true, breaks: false });
marked.use({ extensions: [highlight] });

/** Markdown → unsanitized HTML. Callers must sanitize before rendering. */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false });
}
