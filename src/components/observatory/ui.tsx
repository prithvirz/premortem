import type { ReactNode } from "react";
import type { Finding, Severity } from "@/lib/compose/types";
import { severityVisual } from "@/lib/viz/visuals";

export function SeverityBadge({ severity, compact = false }: { severity: Severity; compact?: boolean }) {
  const v = severityVisual(severity);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase"
      style={{ color: v.color, borderColor: `${v.color}55`, background: `${v.color}12` }}
    >
      <span aria-hidden="true">{v.glyph}</span>
      {compact ? <span className="sr-only">{v.label}</span> : v.label}
    </span>
  );
}

const BASIS: Record<Finding["basis"], { label: string; hint: string }> = {
  "compose-validation": { label: "Compose validation", hint: "Docker Compose is expected to reject this file." },
  inferred: { label: "Inferred", hint: "A possibility inferred from configuration, not an observed failure." },
  policy: { label: "Your policy", hint: "Flagged because the provided policy requires it." },
};

export function BasisTag({ basis }: { basis: Finding["basis"] }) {
  const b = BASIS[basis];
  return (
    <span title={b.hint} className="rounded border border-seam bg-crypt px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-mist uppercase">
      {b.label}
    </span>
  );
}

export const basisHint = (b: Finding["basis"]): string => BASIS[b].hint;

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-veil uppercase">{children}</h3>;
}

export function Panel({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-xl border border-seam bg-crypt/80 backdrop-blur-sm ${className}`} {...rest}>
      {children}
    </section>
  );
}
