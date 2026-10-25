/** Crescent moon cradling a play button, in metallic gold. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="mr-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c9" />
          <stop offset="0.35" stopColor="#e6bd55" />
          <stop offset="0.6" stopColor="#a87a22" />
          <stop offset="1" stopColor="#f6dc88" />
        </linearGradient>
        <mask id="mr-crescent">
          <rect width="40" height="40" fill="#fff" />
          <circle cx="25" cy="15" r="13" fill="#000" />
        </mask>
      </defs>
      <circle cx="18" cy="21" r="15" fill="url(#mr-gold)" mask="url(#mr-crescent)" />
      <path d="M22 19.5 31 25l-9 5.5z" fill="url(#mr-gold)" />
      <path
        d="M32 4.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"
        fill="#fff3c9"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-gold text-lg font-bold tracking-tight">MoonReel</span>
        <span className="mt-1 text-[10px] font-medium tracking-[0.22em] text-subtle uppercase">
          by siri2moon
        </span>
      </span>
    </span>
  );
}
