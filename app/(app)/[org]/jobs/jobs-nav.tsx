import Link from "next/link";

export function JobsNav({ slug, current }: { slug: string; current: "jobs" | "clients" | "review" | "outbox" }) {
  const items = [
    { key: "jobs", label: "Jobs", href: `/${slug}/jobs` },
    { key: "clients", label: "Client accounts", href: `/${slug}/jobs/clients` },
    { key: "review", label: "Review queue", href: `/${slug}/review-queue` },
    { key: "outbox", label: "Outbox", href: `/${slug}/outbox` },
  ] as const;
  return (
    <div className="mb-4 flex flex-wrap gap-2 text-sm">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={current === i.key ? "page" : undefined}
          className={
            current === i.key
              ? "rounded-md bg-muted px-3 py-1 font-medium"
              : "rounded-md px-3 py-1 text-muted-foreground hover:bg-muted"
          }
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
