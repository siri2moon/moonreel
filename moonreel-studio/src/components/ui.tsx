import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const variants = {
  primary:
    "sheen bg-gold text-[#21180a] font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_10px_30px_-10px_rgb(214_183_131/0.7)] hover:animate-shine hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_12px_40px_-8px_rgb(214_183_131/0.9)]",
  secondary:
    "frost text-foreground backdrop-blur-xl hover:bg-[rgb(255_240_214/0.09)] hover:text-gold-light hover:shadow-[inset_0_0_0_1px_rgb(255_232_196/0.22)]",
  danger:
    "bg-danger/10 text-danger shadow-[inset_0_0_0_1px_rgb(255_122_122/0.25)] hover:bg-danger/20",
  ghost: "text-muted hover:bg-[rgb(255_240_214/0.06)] hover:text-foreground",
};

const sizes = {
  sm: "h-8 px-3.5 text-xs rounded-full",
  md: "h-10 px-5 text-sm rounded-full",
  lg: "h-12 px-7 text-[15px] rounded-full",
  icon: "h-8 w-8 rounded-full",
};

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return `inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 ${sizes[size]} ${variants[variant]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`glass rounded-3xl ${className}`} {...props} />;
}

export const inputClass =
  "frost w-full rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-subtle outline-none transition focus:bg-[rgb(255_240_214/0.07)] focus:shadow-[inset_0_0_0_1px_rgb(214_183_131/0.5),0_0_0_4px_rgb(214_183_131/0.08),0_0_24px_-6px_rgb(214_183_131/0.35)]";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-2 ${className}`}>
      <span className="text-[13px] font-medium text-foreground/90">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-subtle">{hint}</span>}
    </label>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.22em] text-gold uppercase">
      <span className="h-px w-6 bg-gradient-to-r from-transparent to-gold/70" />
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-luminous text-3xl font-semibold tracking-[-0.02em] md:text-[40px] md:leading-[1.1]">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">{children}</h2>
      {aside}
    </div>
  );
}

export type Tone = "gold" | "info" | "success" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  gold: "text-gold-light bg-gold/10 ring-gold/20",
  info: "text-info bg-info/10 ring-info/20",
  success: "text-success bg-success/10 ring-success/20",
  danger: "text-danger bg-danger/10 ring-danger/20",
  muted: "text-muted bg-[rgb(255_240_214/0.05)] ring-[rgb(255_232_196/0.1)]",
};

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset backdrop-blur-md ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="frost inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted [&_svg]:size-3.5 [&_svg]:text-gold/80">
      {icon}
      {children}
    </span>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      {icon && (
        <div className="frost flex size-14 items-center justify-center rounded-2xl text-gold shadow-[inset_0_0_0_1px_rgb(214_183_131/0.25),0_0_40px_-10px_rgb(214_183_131/0.5)] [&_svg]:size-6">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      </div>
    </Card>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-[rgb(255_240_214/0.04)] ${className}`} />;
}

export function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

export function Stat({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="glass-hover relative flex items-center gap-4 overflow-hidden p-5">
      <div className="pointer-events-none absolute -top-10 -right-10 size-24 rounded-full bg-gold/10 blur-2xl" />
      {icon && (
        <div className="frost flex size-11 items-center justify-center rounded-2xl text-gold [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <span className="text-luminous text-[28px] leading-none font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted">{label}</span>
      </div>
    </Card>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger shadow-[inset_0_0_0_1px_rgb(255_122_122/0.25)] backdrop-blur-xl">
      {children}
    </div>
  );
}
