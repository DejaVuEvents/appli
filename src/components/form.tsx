"use client";

/** Champs de formulaire stylés et réutilisables. */

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required = false,
  placeholder,
  step,
  className = "",
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  step?: string;
  className?: string;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email" | "url" | "search" | "none";
}) {
  // Clavier mobile adapté : champ nombre → pavé décimal par défaut.
  const im = inputMode ?? (type === "number" ? "decimal" : undefined);
  return (
    <div className={className}>
      <label htmlFor={name} className="block text-left text-sm font-medium mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        inputMode={im}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        // Empêche la molette de modifier la valeur d'un champ nombre.
        onWheel={
          type === "number"
            ? (e) => (e.target as HTMLInputElement).blur()
            : undefined
        }
        className={inputClass}
      />
    </div>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  className = "",
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="block text-left text-sm font-medium mb-1">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? undefined}
        className={inputClass}
      />
    </div>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  options,
  required = false,
  className = "",
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="block text-left text-sm font-medium mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
