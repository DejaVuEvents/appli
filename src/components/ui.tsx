import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface border border-border rounded-xl ${className}`}>
      {children}
    </div>
  );
}

/** Lien stylé en bouton primaire. */
export function ButtonLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
    >
      {children}
    </Link>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-10 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-muted mt-1">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}

const ETAT_STYLES: Record<string, string> = {
  ok: "bg-green-100 text-green-700",
  maintenance: "bg-amber-100 text-amber-700",
  hs: "bg-red-100 text-red-700",
  reforme: "bg-gray-200 text-gray-600",
};

export function Badge({
  children,
  tone = "ok",
}: {
  children: React.ReactNode;
  tone?: keyof typeof ETAT_STYLES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        ETAT_STYLES[tone] ?? ETAT_STYLES.ok
      }`}
    >
      {children}
    </span>
  );
}
