// Fixed decorative background: nebulae, a spotlight beam, a fading grid, stars and glints.
const GLINTS = [
  { top: "12%", left: "22%", delay: "0s" },
  { top: "28%", left: "84%", delay: "1.6s" },
  { top: "64%", left: "12%", delay: "3.1s" },
  { top: "78%", left: "70%", delay: "0.8s" },
  { top: "44%", left: "52%", delay: "2.4s" },
];

export function Sky() {
  return (
    <div className="sky" aria-hidden>
      <div className="grid" />
      <div className="beam" />
      <div className="stars" />
      <div className="stars-2" />
      {GLINTS.map((g) => (
        <span key={`${g.top}-${g.left}`} className="glint" style={{ top: g.top, left: g.left, animationDelay: g.delay }} />
      ))}
    </div>
  );
}
