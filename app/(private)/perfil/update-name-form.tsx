"use client";

import { useState, useTransition } from "react";
import { updateName } from "./update-name.server";

export default function UpdateNameForm({
  initialName,
}: {
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        startTransition(async () => {
          const res = await updateName(name.trim());
          setMsg(res.ok ? "Nombre actualizado ✅" : res.error ?? "Error");
        });
      }}
      className="space-y-3"
    >
      <div>
        <label className="text-sm font-medium">Nombre completo</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          className="mt-1 w-full border rounded-md px-3 py-2"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-600 text-white px-4 py-2 font-semibold hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Guardar"}
      </button>

      {msg && <p className="text-sm mt-1">{msg}</p>}
    </form>
  );
}
