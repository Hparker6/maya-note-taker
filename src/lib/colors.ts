export const CLASS_COLORS = {
  sage: "#5E8B6F",
  ocean: "#3D7AB8",
  plum: "#8A5A9E",
  rose: "#C25A7C",
  coral: "#D06A4A",
  amber: "#C28B2C",
  teal: "#2E8C8A",
  slate: "#5F6B7A",
} as const;

export type ClassColor = keyof typeof CLASS_COLORS;

export function classColor(name: string): string {
  return CLASS_COLORS[name as ClassColor] ?? CLASS_COLORS.sage;
}

export function isClassColor(name: unknown): name is ClassColor {
  return typeof name === "string" && name in CLASS_COLORS;
}
