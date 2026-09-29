export type PastelHighlightColor = {
  name: string;
  bg: string;
  dot: string;
  border: string;
};

export const PASTEL_COLORS: PastelHighlightColor[] = [
  { name: "pink", bg: "rgba(251, 207, 232, 0.50)", dot: "#f472b6", border: "#f472b6" },
  { name: "orange", bg: "rgba(254, 215, 170, 0.50)", dot: "#fb923c", border: "#fb923c" },
  { name: "green", bg: "rgba(187, 247, 208, 0.50)", dot: "#4ade80", border: "#4ade80" },
  { name: "lavender", bg: "rgba(233, 213, 255, 0.50)", dot: "#c084fc", border: "#c084fc" },
  { name: "sky", bg: "rgba(186, 230, 253, 0.50)", dot: "#38bdf8", border: "#38bdf8" },
  { name: "yellow", bg: "rgba(254, 240, 138, 0.50)", dot: "#facc15", border: "#facc15" },
];

export function getHookColor(index: number): PastelHighlightColor {
  return PASTEL_COLORS[index % PASTEL_COLORS.length];
}
