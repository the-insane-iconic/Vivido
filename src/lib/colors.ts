export type PastelHighlightColor = {
  name: string;
  bg: string;
  dot: string;
  border: string;
};

export const PASTEL_COLORS: PastelHighlightColor[] = [
  { name: "pink", bg: "rgba(244, 114, 182, 0.28)", dot: "#f472b6", border: "#f472b6" },
  { name: "orange", bg: "rgba(251, 146, 60, 0.28)", dot: "#fb923c", border: "#fb923c" },
  { name: "green", bg: "rgba(74, 222, 128, 0.28)", dot: "#4ade80", border: "#4ade80" },
  { name: "lavender", bg: "rgba(192, 132, 252, 0.28)", dot: "#c084fc", border: "#c084fc" },
  { name: "sky", bg: "rgba(56, 189, 248, 0.28)", dot: "#38bdf8", border: "#38bdf8" },
  { name: "butter", bg: "rgba(250, 204, 21, 0.30)", dot: "#facc15", border: "#facc15" },
];

export function getHookColor(index: number): PastelHighlightColor {
  return PASTEL_COLORS[Math.abs(index) % PASTEL_COLORS.length];
}

/**
 * Sorts hooks according to the top-to-bottom reading sequence of the page text
 * ensuring Card 1, 2, 3, 4 strictly matches Highlight 1, 2, 3, 4 in both color and order.
 */
export function sortHooksByTextOrder<T extends { sourceText?: string }>(hooks: T[], pageText?: string): T[] {
  if (!pageText || hooks.length <= 1) return hooks;
  const lowerText = pageText.toLowerCase().replace(/["\n\r]/g, " ").replace(/\s+/g, " ");

  return [...hooks].map(hook => {
    const raw = (hook.sourceText || "").toLowerCase().replace(/["\n\r]/g, " ").replace(/\s+/g, " ").trim();
    let pos = lowerText.indexOf(raw);
    if (pos === -1 && raw.length > 20) {
      pos = lowerText.indexOf(raw.slice(0, 20));
    }
    return { hook, pos: pos !== -1 ? pos : 999999 };
  }).sort((a, b) => a.pos - b.pos).map(item => item.hook);
}

/**
 * Generates an instant, cinematic 16:9 SVG visual if remote image fails or is unavailable.
 */
export function generateFallbackSvg(title: string, accentColor: string, kind = "scene"): string {
  const safeTitle = (title || "Cinematic Visual Scene").replace(/["&<>]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 576" width="1024" height="576">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#090d16"/>
        <stop offset="50%" stop-color="#111827"/>
        <stop offset="100%" stop-color="#030712"/>
      </linearGradient>
      <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${accentColor}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bgGrad)"/>
    <circle cx="512" cy="288" r="280" fill="url(#glowGrad)"/>
    <rect x="212" y="480" width="600" height="48" rx="8" fill="rgba(15,23,42,0.88)" stroke="rgba(255,255,255,0.12)"/>
    <text x="512" y="510" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle" letter-spacing="0.4">${safeTitle}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

