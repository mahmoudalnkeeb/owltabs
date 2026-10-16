import type { FontFamily } from "./state/types";

// Bundled so they work offline and under the extension's content policy.
// @font-face rules only download a file when a font is actually used.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/literata";

const SANS_FALLBACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const FONT_OPTIONS: { id: FontFamily; label: string; stack: string }[] = [
  { id: "geist", label: "Geist (default)", stack: `'Geist Variable', ${SANS_FALLBACK}` },
  { id: "inter", label: "Inter", stack: `'Inter Variable', ${SANS_FALLBACK}` },
  { id: "plex", label: "IBM Plex Sans", stack: `'IBM Plex Sans Variable', ${SANS_FALLBACK}` },
  { id: "atkinson", label: "Atkinson Hyperlegible (easiest to read)", stack: `'Atkinson Hyperlegible Next Variable', ${SANS_FALLBACK}` },
  { id: "literata", label: "Literata (serif, for long reading)", stack: `'Literata Variable', Georgia, serif` },
  { id: "system", label: "System font", stack: SANS_FALLBACK },
];

export const FONT_STACKS = Object.fromEntries(FONT_OPTIONS.map((f) => [f.id, f.stack])) as Record<FontFamily, string>;
