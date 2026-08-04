"use client";

import { useState, useTransition } from "react";

export function AssignSelect({
  action,
  fieldName,
  value,
  options,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fieldName: string;
  value: string | null;
  options: { id: string; nom: string }[];
}) {
  const [val, setVal] = useState(value ?? "");
  const [pending, start] = useTransition();

  return (
    <select
      value={val}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        setVal(v);
        const fd = new FormData();
        fd.set(fieldName, v);
        start(() => {
          action(fd);
        });
      }}
      className="rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
    >
      <option value="">— Non affecté —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nom}
        </option>
      ))}
    </select>
  );
}
