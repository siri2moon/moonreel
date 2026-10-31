import { ArrowLeft, ExternalLink, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).guide.metaTitle };
}

/** Guide text with `code` and *UI names* marked inline. */
function rich(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded-md bg-gold/10 px-1.5 py-0.5 font-mono text-[12.5px] text-gold-light">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="text-foreground not-italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

/** Step-by-step setup of a Facebook Page token for Facebook and Instagram reels. */
export default async function FacebookGuidePage() {
  const t = await getDictionary();
  const g = t.guide;
  return (
    <>
      <PageHeader
        eyebrow={g.eyebrow}
        title={g.title}
        description={g.description}
        actions={
          <LinkButton href="/niches" variant="ghost" size="sm">
            <ArrowLeft /> {g.back}
          </LinkButton>
        }
      />

      <div className="flex max-w-3xl flex-col gap-5">
        <Card className="flex gap-3 p-5 text-sm leading-relaxed text-gold-light">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p>{g.warning}</p>
        </Card>

        <ol className="flex flex-col gap-5">
          {g.steps.map((step, i) => (
            <li key={step.title}>
              <Card className="flex flex-col gap-4 p-6 md:p-7">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium tracking-[0.22em] text-gold uppercase">{g.step(i + 1)}</span>
                  <h2 className="text-lg font-semibold tracking-[-0.01em]">{step.title}</h2>
                </div>
                <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-muted marker:text-gold/60">
                  {step.body.map((line) => (
                    <li key={line}>{rich(line)}</li>
                  ))}
                </ul>
                {"link" in step && step.link && (
                  <a
                    href={step.link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-fit items-center gap-1.5 text-sm font-medium text-gold hover:text-gold-light"
                  >
                    {g.open} {step.link.label} <ExternalLink className="size-3.5" />
                  </a>
                )}
              </Card>
            </li>
          ))}
        </ol>

        <Card className="flex flex-col gap-3 p-6 md:p-7">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">{g.instagramTitle}</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-muted marker:text-gold/60">
            {g.instagram.map((line) => (
              <li key={line}>{rich(line)}</li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-4 p-6 md:p-7">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">{g.troubleshootingTitle}</h2>
          <dl className="flex flex-col gap-4">
            {g.troubleshooting.map((item) => (
              <div key={item.q} className="flex flex-col gap-1">
                <dt className="text-sm font-medium text-foreground/90">{item.q}</dt>
                <dd className="text-sm leading-relaxed text-muted">{rich(item.a)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
