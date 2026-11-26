import Link from "next/link";

export function CrmNav({ slug, current }: { slug: string; current: "companies" | "contacts" | "deals" }) {
  const items = [
    { key: "deals", label: "Deals" },
    { key: "companies", label: "Companies" },
    { key: "contacts", label: "Contacts" },
  ] as const;
  return (
    <div className="mb-4 flex gap-2 text-sm">
      {items.map((i) => (
        <Link
          key={i.key}
          href={`/${slug}/crm/${i.key}`}
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
