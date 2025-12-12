"use client";
export const dynamic = "force-dynamic";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");
    setLoading(true);

    const supabase = createClient();

    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/recuperar/nueva`,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setMsg("Si el correo existe, te enviamos un enlace de recuperación.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl shadow p-8 w-full max-w-md space-y-4">
        <h1 className="text-lg font-semibold">Recuperar contraseña</h1>
        <p className="text-sm text-gray-500">
          Ingresá tu correo y te mandamos el enlace.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="w-full border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-2 rounded-md font-semibold hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>

        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
      </div>
    </div>
  );
}
