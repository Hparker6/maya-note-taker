import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

interface ViewWithObserver {
  domObserver?: { flush?: () => void };
}

/**
 * Chromium prioritizes input events over `selectionchange`, so when the page is busy a
 * key (e.g. Enter) can arrive before ProseMirror has seen the caret move from the
 * previous key (e.g. End). Reading the DOM selection first makes the edit land where the
 * caret actually is instead of replacing a stale selection.
 */
export const SelectionSync = Extension.create({
  name: "selectionSync",
  priority: 10_000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("selectionSync"),
        props: {
          handleKeyDown(view, event) {
            if (event.isComposing || event.keyCode === 229) return false;
            try {
              (view as unknown as ViewWithObserver).domObserver?.flush?.();
            } catch {
              /* internal API; never block typing */
            }
            return false;
          },
        },
      }),
    ];
  },
});
