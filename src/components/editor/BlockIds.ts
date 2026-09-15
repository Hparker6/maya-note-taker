import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/** Block types page handwriting can be anchored to. */
export const BLOCK_ID_TYPES = ["paragraph", "heading", "blockquote", "codeBlock", "horizontalRule", "table", "drawing"];

/**
 * Stable ids (data-bid) on text blocks, so handwriting stays next to its text as the note changes.
 * Ids are only added when ink is anchored to a block, which keeps notes without ink unchanged.
 */
export const BlockIds = Extension.create({
  name: "blockIds",

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_ID_TYPES,
        attributes: {
          bid: {
            default: null,
            // Splitting a paragraph (Enter) leaves the id on the first half only.
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute("data-bid"),
            renderHTML: (attrs) => (attrs.bid ? { "data-bid": attrs.bid } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockIdsDedupe"),
        // Splitting a block in the middle or at its start (Enter), or copy-paste, can duplicate an id.
        // The copy with the most text keeps it, so ink stays with its words rather than a new empty line.
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const byId = new Map<string, { pos: number; size: number }[]>();
          state.doc.descendants((node, pos) => {
            const bid = node.attrs.bid as string | null | undefined;
            if (!bid) return;
            const list = byId.get(bid) ?? [];
            list.push({ pos, size: node.textContent.length });
            byId.set(bid, list);
          });
          const drop: number[] = [];
          for (const list of byId.values()) {
            if (list.length < 2) continue;
            const keep = list.reduce((best, item) => (item.size > best.size ? item : best));
            for (const item of list) if (item !== keep) drop.push(item.pos);
          }
          if (!drop.length) return null;
          const tr = state.tr;
          for (const pos of drop) tr.setNodeAttribute(pos, "bid", null);
          return tr.setMeta("addToHistory", false);
        },
      }),
    ];
  },
});
