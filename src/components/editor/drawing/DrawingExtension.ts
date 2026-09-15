import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { activeDrawings, DrawingView } from "./DrawingView";
import { DEFAULT_HEIGHT, DRAWING_WIDTH, MAX_HEIGHT, MIN_HEIGHT, parseStrokes, strokeOpacity, strokeToPath } from "./strokes";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    drawing: {
      /** Inserts a blank sketch at the cursor. */
      insertDrawing: () => ReturnType;
    };
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A pen/pencil sketch that lives inside a note, stored as vector strokes. */
export const Drawing = Node.create({
  name: "drawing",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      // Stable identity, so UI state (e.g. "currently drawing") survives re-renders.
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-id"),
        renderHTML: (attrs) => (attrs.id ? { "data-id": attrs.id } : {}),
      },
      strokes: {
        default: "[]",
        parseHTML: (el) => el.getAttribute("data-strokes") ?? "[]",
        renderHTML: (attrs) => ({ "data-strokes": attrs.strokes }),
      },
      height: {
        default: DEFAULT_HEIGHT,
        parseHTML: (el) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Number(el.getAttribute("data-height")) || DEFAULT_HEIGHT)),
        renderHTML: (attrs) => ({ "data-height": attrs.height }),
      },
      paper: {
        default: "lines",
        parseHTML: (el) => {
          const v = el.getAttribute("data-paper");
          return v === "blank" || v === "grid" ? v : "lines";
        },
        renderHTML: (attrs) => ({ "data-paper": attrs.paper }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="drawing"]' }];
  },

  // The saved HTML carries an SVG rendering too, so sheets, print and previews show the sketch.
  renderHTML({ node, HTMLAttributes }) {
    const strokes = parseStrokes(node.attrs.strokes);
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "drawing", class: "drawing-block" }),
      [
        `${SVG_NS} svg`,
        { viewBox: `0 0 ${DRAWING_WIDTH} ${node.attrs.height}`, xmlns: SVG_NS, preserveAspectRatio: "xMinYMin meet" },
        ...strokes.map((s) => ["path", { d: strokeToPath(s), style: `fill:${s.c};fill-opacity:${strokeOpacity(s)}` }]),
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingView, {
      // Pointer input inside the sketch belongs to the sketch, not to text selection.
      stopEvent: ({ event }) => /^(pointer|mouse|touch|click|dblclick|drag)/.test(event.type) || event.type === "keydown",
      ignoreMutation: () => true,
    });
  },

  addCommands() {
    return {
      // A sketch is always its own top-level block: never nested inside a list item or quote.
      insertDrawing:
        () =>
        ({ state, commands }) => {
          const id = crypto.randomUUID();
          activeDrawings.add(id);
          const { $from } = state.selection;
          const node = { type: this.name, attrs: { id } };
          if ($from.depth === 0) return commands.insertContentAt(state.selection.from, node);
          const top = $from.node(1);
          const range = { from: $from.before(1), to: $from.after(1) };
          const emptyLine = top.type.name === "paragraph" && top.content.size === 0;
          return commands.insertContentAt(emptyLine ? range : range.to, node);
        },
    };
  },
});
