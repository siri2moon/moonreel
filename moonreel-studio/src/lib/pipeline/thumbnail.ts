import { readFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import type { AspectRatio } from "@/db/schema";
import { THUMBNAIL_STYLES, type ThumbnailStyle } from "@/lib/thumbnail-styles";

export { THUMBNAIL_STYLES, type ThumbnailStyle };

export const THUMBNAIL_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 1080, height: 1920 },
};

export type FontName = "Anton" | "Oswald" | "Montserrat";

const FONT_FILES: { name: FontName; file: string; weight: 400 | 700 | 900 }[] = [
  { name: "Anton", file: "Anton-Regular.ttf", weight: 400 },
  { name: "Oswald", file: "Oswald-Bold.ttf", weight: 700 },
  { name: "Montserrat", file: "Montserrat-Black.ttf", weight: 900 },
  { name: "Montserrat", file: "Montserrat-Bold.ttf", weight: 700 },
];

// Average advance widths (in em) measured from the font files, used to break headlines into
// lines before rendering so the layout is deterministic.
const METRICS: Record<FontName, { upper: number; lower: number; space: number }> = {
  Anton: { upper: 0.48, lower: 0.46, space: 0.24 },
  Oswald: { upper: 0.54, lower: 0.46, space: 0.26 },
  Montserrat: { upper: 0.76, lower: 0.63, space: 0.3 },
};

let fontsPromise: Promise<Parameters<typeof satori>[1]["fonts"]> | undefined;

export function loadFonts() {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async (f) => ({
      name: f.name,
      weight: f.weight,
      style: "normal" as const,
      data: await readFile(path.join(process.cwd(), "assets/fonts", f.file)),
    })),
  );
  return fontsPromise;
}

export type Word = { text: string; accent: boolean };

/** `LION VS *CAPE BUFFALO*` → words, the starred ones drawn in the accent colour. */
export function parseHeadline(markup: string): Word[] {
  const words: Word[] = [];
  let inAccent = false;
  for (const token of markup.trim().split(/\s+/)) {
    if (!token) continue;
    const opens = token.startsWith("*");
    const closes = token.endsWith("*") && token.length > 1;
    const text = token.replace(/^\*+|\*+$/g, "");
    if (!text) continue;
    words.push({ text, accent: inAccent || opens });
    if (opens && !closes) inAccent = true;
    if (closes) inAccent = false;
  }
  return words;
}

function textWidth(text: string, font: FontName, size: number, letterSpacing: number) {
  const m = METRICS[font];
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += m.space;
    else if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) em += m.lower;
    else em += m.upper;
  }
  return em * size + letterSpacing * size * text.length;
}

type Fit = {
  font: FontName;
  uppercase: boolean;
  maxWidth: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  letterSpacing: number;
  /** Extra width each word takes besides its glyphs (e.g. box padding), in em. */
  wordPadding?: number;
};

/** The largest font size whose greedy line breaks fit the box; lines are returned as words. */
export function fitHeadline(words: Word[], fit: Fit) {
  const shown = words.map((w) => ({ ...w, text: fit.uppercase ? w.text.toUpperCase() : w.text }));
  for (let size = fit.maxSize; size >= fit.minSize; size -= 2) {
    const gap = METRICS[fit.font].space * size + (fit.wordPadding ?? 0) * size;
    const widthOf = (w: Word) =>
      textWidth(w.text, fit.font, size, fit.letterSpacing) + (fit.wordPadding ?? 0) * size;
    if (shown.some((w) => widthOf(w) > fit.maxWidth)) continue;
    const lines: Word[][] = [];
    let current: Word[] = [];
    let width = 0;
    for (const w of shown) {
      const next = current.length ? width + gap + widthOf(w) : widthOf(w);
      if (current.length && next > fit.maxWidth) {
        lines.push(current);
        current = [w];
        width = widthOf(w);
      } else {
        current.push(w);
        width = next;
      }
    }
    if (current.length) lines.push(current);
    if (lines.length <= fit.maxLines) return { size, lines };
  }
  // Too long for the box even at the minimum size: let the last line run long rather than drop words.
  const size = fit.minSize;
  const perLine = Math.ceil(shown.length / fit.maxLines);
  const lines = Array.from({ length: fit.maxLines }, (_, i) => shown.slice(i * perLine, (i + 1) * perLine));
  return { size, lines: lines.filter((l) => l.length) };
}

// Satori takes React-like element objects; this keeps the templates readable without JSX.
export type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string | null | false;
export function h(type: string, style: Record<string, unknown>, ...children: Child[]): Node {
  const kids = children.filter((c): c is Node | string => !!c);
  return { type, props: { style: { display: "flex", ...style }, children: kids } };
}

export type ThumbnailInput = {
  /** Background image (any format sharp reads). */
  base: Buffer;
  headline: string;
  style: ThumbnailStyle;
  accent: string;
  brand: string;
  aspectRatio: AspectRatio;
};

export const INK = "#ffffff";
export const DARK = "#0b0b0c";

function overlay(input: ThumbnailInput, words: Word[]): Node {
  const { width, height } = THUMBNAIL_SIZE[input.aspectRatio];
  const vertical = input.aspectRatio === "9:16";
  const brand = input.brand.trim().toUpperCase();
  const accent = input.accent;
  const root = (background: string, inner: Child[]) =>
    h("div", { width, height, position: "relative", backgroundImage: background }, ...inner);

  if (input.style === "cinematic") {
    const { size, lines } = fitHeadline(words, {
      font: "Oswald",
      uppercase: true,
      maxWidth: vertical ? 940 : 1060,
      maxLines: vertical ? 3 : 2,
      maxSize: vertical ? 150 : 112,
      minSize: vertical ? 72 : 56,
      letterSpacing: 0.01,
    });
    return root(
      "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.92) 100%)",
      [
        h(
          "div",
          {
            position: "absolute",
            left: vertical ? 70 : 64,
            right: vertical ? 70 : 64,
            bottom: vertical ? 420 : 56,
            flexDirection: "column",
          },
          brand &&
            h(
              "div",
              { alignItems: "center", marginBottom: vertical ? 26 : 18 },
              h("div", { width: vertical ? 72 : 56, height: 4, backgroundColor: accent, marginRight: 16 }),
              h(
                "div",
                {
                  fontFamily: "Montserrat",
                  fontWeight: 700,
                  fontSize: vertical ? 30 : 22,
                  letterSpacing: vertical ? 9 : 7,
                  color: accent,
                },
                brand,
              ),
            ),
          ...lines.map((line) =>
            h(
              "div",
              {
                fontFamily: "Oswald",
                fontWeight: 700,
                fontSize: size,
                lineHeight: 1.04,
                letterSpacing: size * 0.01,
                textShadow: "0 4px 22px rgba(0,0,0,0.75)",
                whiteSpace: "nowrap",
              },
              ...line.map((w, i) =>
                h("span", { color: w.accent ? accent : INK, marginLeft: i ? size * 0.26 : 0 }, w.text),
              ),
            ),
          ),
        ),
      ],
    );
  }

  if (input.style === "boxed") {
    const wordPadding = 0.36;
    const { size, lines } = fitHeadline(words, {
      font: "Montserrat",
      uppercase: true,
      maxWidth: vertical ? 940 : 680,
      maxLines: vertical ? 4 : 3,
      maxSize: vertical ? 120 : 92,
      minSize: vertical ? 60 : 44,
      letterSpacing: -0.01,
      wordPadding,
    });
    return root(
      vertical
        ? "linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0) 60%)"
        : "linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0) 68%)",
      [
        h(
          "div",
          {
            position: "absolute",
            left: vertical ? 70 : 60,
            right: vertical ? 70 : undefined,
            top: vertical ? 230 : 0,
            bottom: vertical ? undefined : 0,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: vertical ? "center" : "flex-start",
            transform: "rotate(-2deg)",
          },
          ...lines.map((line) =>
            h(
              "div",
              { marginBottom: size * 0.16 },
              ...line.map((w, i) =>
                h(
                  "div",
                  {
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    fontSize: size,
                    lineHeight: 1.08,
                    letterSpacing: -size * 0.01,
                    color: DARK,
                    backgroundColor: w.accent ? accent : INK,
                    padding: `${size * 0.06}px ${size * (wordPadding / 2)}px`,
                    marginLeft: i ? size * 0.14 : 0,
                    borderRadius: size * 0.08,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
                  },
                  w.text,
                ),
              ),
            ),
          ),
        ),
        brand &&
          h(
            "div",
            {
              position: "absolute",
              right: vertical ? undefined : 40,
              left: vertical ? 0 : undefined,
              width: vertical ? width : undefined,
              justifyContent: "center",
              bottom: vertical ? 360 : 32,
              fontFamily: "Montserrat",
              fontWeight: 700,
              fontSize: vertical ? 30 : 22,
              letterSpacing: vertical ? 8 : 6,
              color: INK,
              textShadow: "0 2px 10px rgba(0,0,0,0.8)",
            },
            brand,
          ),
      ],
    );
  }

  // impact: the classic YouTube look, a huge condensed headline over a darkened side.
  const { size, lines } = fitHeadline(words, {
    font: "Anton",
    uppercase: true,
    maxWidth: vertical ? 950 : 660,
    maxLines: vertical ? 4 : 3,
    maxSize: vertical ? 190 : 150,
    minSize: vertical ? 90 : 64,
    letterSpacing: 0.005,
  });
  return root(
    vertical
      ? "linear-gradient(180deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 32%, rgba(0,0,0,0) 55%)"
      : "linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.62) 38%, rgba(0,0,0,0) 64%)",
    [
      h(
        "div",
        {
          position: "absolute",
          left: vertical ? 65 : 60,
          right: vertical ? 65 : undefined,
          top: vertical ? 200 : 0,
          bottom: vertical ? undefined : 0,
          flexDirection: "column",
          justifyContent: "center",
          alignItems: vertical ? "center" : "flex-start",
        },
        brand &&
          h(
            "div",
            {
              fontFamily: "Montserrat",
              fontWeight: 700,
              fontSize: vertical ? 30 : 21,
              letterSpacing: vertical ? 6 : 4,
              color: DARK,
              backgroundColor: accent,
              padding: vertical ? "10px 22px" : "7px 16px",
              borderRadius: 6,
              marginBottom: vertical ? 34 : 22,
            },
            brand,
          ),
        ...lines.map((line) =>
          h(
            "div",
            {
              fontFamily: "Anton",
              fontSize: size,
              lineHeight: 1.0,
              letterSpacing: size * 0.005,
              textShadow: "0 5px 0 rgba(0,0,0,0.85), 0 10px 34px rgba(0,0,0,0.7)",
              whiteSpace: "nowrap",
            },
            ...line.map((w, i) =>
              h("span", { color: w.accent ? accent : INK, marginLeft: i ? size * 0.24 : 0 }, w.text),
            ),
          ),
        ),
        h("div", {
          width: vertical ? 180 : 130,
          height: vertical ? 14 : 10,
          backgroundColor: accent,
          marginTop: vertical ? 34 : 22,
          borderRadius: 2,
        }),
      ),
    ],
  );
}

/** Background photo + template overlay → a JPEG ready to upload (well under YouTube's 2 MB). */
export async function composeThumbnail(input: ThumbnailInput) {
  const { width, height } = THUMBNAIL_SIZE[input.aspectRatio];
  const svg = await satori(overlay(input, parseHeadline(input.headline)) as never, {
    width,
    height,
    fonts: await loadFonts(),
  });
  const layer = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
  return sharp(input.base)
    .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
    // Thumbnails are seen tiny: a little extra saturation and crispness reads better in a feed.
    .modulate({ saturation: 1.12, brightness: 1.02 })
    .sharpen({ sigma: 0.8 })
    .composite([{ input: layer }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
