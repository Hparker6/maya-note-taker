// Colors resolve to CSS variables so highlights stay readable in dark mode and print.

export const HIGHLIGHTS = [
  { name: "Yellow", value: "var(--hl-yellow)" },
  { name: "Green", value: "var(--hl-green)" },
  { name: "Blue", value: "var(--hl-blue)" },
  { name: "Pink", value: "var(--hl-pink)" },
  { name: "Orange", value: "var(--hl-orange)" },
  { name: "Purple", value: "var(--hl-purple)" },
] as const;

export const TEXT_COLORS = [
  { name: "Red", value: "var(--tc-red)" },
  { name: "Orange", value: "var(--tc-orange)" },
  { name: "Green", value: "var(--tc-green)" },
  { name: "Blue", value: "var(--tc-blue)" },
  { name: "Purple", value: "var(--tc-purple)" },
  { name: "Gray", value: "var(--tc-gray)" },
] as const;

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const mod = () => (isMac() ? "⌘" : "Ctrl+");
