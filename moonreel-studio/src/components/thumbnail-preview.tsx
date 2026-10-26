import localFont from "next/font/local";
import type { ThumbnailStyle } from "@/lib/thumbnail-styles";

// The same font files the worker renders with, so the preview matches the real thumbnail.
const anton = localFont({ src: "../../assets/fonts/Anton-Regular.ttf", display: "swap" });
const oswald = localFont({ src: "../../assets/fonts/Oswald-Bold.ttf", weight: "700", display: "swap" });
const montserrat = localFont({
  src: [
    { path: "../../assets/fonts/Montserrat-Bold.ttf", weight: "700" },
    { path: "../../assets/fonts/Montserrat-Black.ttf", weight: "900" },
  ],
  display: "swap",
});

const SAMPLE_BACKGROUND =
  "radial-gradient(circle at 72% 45%, #8a6a3a 0%, #4a3a26 28%, #1d1a17 60%, #0c0b0a 100%)";

function words(headline: string) {
  let accent = false;
  return headline
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const opens = token.startsWith("*");
      const closes = token.endsWith("*") && token.length > 1;
      const word = { text: token.replace(/^\*+|\*+$/g, ""), accent: accent || opens };
      if (opens && !closes) accent = true;
      if (closes) accent = false;
      return word;
    });
}

/**
 * A small CSS mock-up of a thumbnail template (16:9), for picking a niche's look. The worker
 * renders the real thumbnail with Satori in pipeline/thumbnail.ts; keep the two in step.
 */
export function ThumbnailPreview({
  style,
  accent,
  brand,
  headline,
}: {
  style: ThumbnailStyle;
  accent: string;
  brand: string;
  headline: string;
}) {
  const list = words(headline);
  const label = brand.trim().toUpperCase();

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-lg"
      style={{ background: SAMPLE_BACKGROUND, containerType: "inline-size" }}
    >
      {style === "impact" && (
        <div
          className="absolute inset-0 flex flex-col justify-center pl-[4.7cqw]"
          style={{ backgroundImage: "linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.62) 38%, transparent 64%)" }}
        >
          {label && (
            <span
              className={`${montserrat.className} mb-[1.7cqw] self-start rounded-[0.5cqw] px-[1.25cqw] py-[0.5cqw] font-bold tracking-[0.3cqw]`}
              style={{ background: accent, color: "#0b0b0c", fontSize: "1.65cqw" }}
            >
              {label}
            </span>
          )}
          <p
            className={`${anton.className} max-w-[52cqw] uppercase leading-none`}
            style={{ fontSize: "9cqw", textShadow: "0 0.4cqw 0 rgba(0,0,0,.85)" }}
          >
            {list.map((w, i) => (
              <span key={i} style={{ color: w.accent ? accent : "#fff" }}>
                {w.text}{" "}
              </span>
            ))}
          </p>
          <span className="mt-[1.7cqw] h-[0.8cqw] w-[10cqw] rounded-sm" style={{ background: accent }} />
        </div>
      )}

      {style === "cinematic" && (
        <div
          className="absolute inset-0 flex flex-col justify-end px-[5cqw] pb-[4.4cqw]"
          style={{ backgroundImage: "linear-gradient(180deg, transparent 35%, rgba(0,0,0,.55) 65%, rgba(0,0,0,.92))" }}
        >
          {label && (
            <span
              className={`${montserrat.className} mb-[1.4cqw] flex items-center gap-[1.25cqw] font-bold`}
              style={{ color: accent, fontSize: "1.7cqw", letterSpacing: "0.55cqw" }}
            >
              <span className="h-[0.3cqw] w-[4.4cqw]" style={{ background: accent }} />
              {label}
            </span>
          )}
          <p
            className={`${oswald.className} font-bold uppercase leading-[1.04]`}
            style={{ fontSize: "8cqw", textShadow: "0 0.3cqw 1.4cqw rgba(0,0,0,.75)" }}
          >
            {list.map((w, i) => (
              <span key={i} style={{ color: w.accent ? accent : "#fff" }}>
                {w.text}{" "}
              </span>
            ))}
          </p>
        </div>
      )}

      {style === "boxed" && (
        <div
          className="absolute inset-0 flex flex-col justify-center pl-[4.7cqw]"
          style={{ backgroundImage: "linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.4) 45%, transparent 68%)" }}
        >
          <div className="flex max-w-[56cqw] -rotate-2 flex-wrap gap-x-[1cqw] gap-y-[1.2cqw]">
            {list.map((w, i) => (
              <span
                key={i}
                className={`${montserrat.className} rounded-[0.6cqw] px-[1.3cqw] py-[0.4cqw] font-black uppercase leading-[1.08]`}
                style={{ background: w.accent ? accent : "#fff", color: "#0b0b0c", fontSize: "6cqw" }}
              >
                {w.text}
              </span>
            ))}
          </div>
          {label && (
            <span
              className={`${montserrat.className} absolute right-[3cqw] bottom-[2.5cqw] font-bold text-white`}
              style={{ fontSize: "1.7cqw", letterSpacing: "0.45cqw" }}
            >
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
