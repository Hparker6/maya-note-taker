import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Breadcrumbs({ items }: { items: { label: string; href?: string; color?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-ink-3">
      {items.map((item, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-60" />}
          {item.href ? (
            <Link href={item.href} className="flex min-w-0 items-center gap-1.5 truncate rounded hover:text-ink">
              {item.color && <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />}
              <span className="truncate">{item.label}</span>
            </Link>
          ) : (
            <span className="truncate text-ink-2">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageTitle({ children, eyebrow, actions }: { children: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="font-serif text-[30px] leading-[1.15] font-semibold tracking-tight text-balance sm:text-[34px]">{children}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
