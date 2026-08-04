"use client";

/** Select qui soumet automatiquement son formulaire au changement. */
export function AutoSelect({
  action,
  name,
  value,
  options,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <form action={action}>
      <select
        name={name}
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={className ?? "rounded-lg border border-border bg-background px-2 py-1 text-xs"}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </form>
  );
}
