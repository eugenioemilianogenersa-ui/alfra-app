"use client";
export const dynamic = "force-dynamic";

import { useState, FormEvent } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function NuevaContraseñaPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");
    setLoading(true);

    if (password.length < 6) {
      setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden. Revisá e intentá de nuevo.");
      setLoading(false);
      return;
    }

    // 1) Validar si hay usuario/sesión y detectar proveedor (Google)
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user ?? null;

    // Si no hay user, normalmente es porque entró sin sesión o sin flujo de recuperación válido
    if (userErr || !user) {
      setLoading(false);
      setErrorMsg("Sesión no encontrada. Para cambiar la contraseña, abrí el enlace de recuperación desde tu email o iniciá sesión nuevamente.");
      return;
    }

    const providers = (user.app_metadata as any)?.providers ?? [];
    const isGoogle = Array.isArray(providers) && providers.includes("google");

    // Caso pedido: cuenta creada con Google => no corresponde setear password desde este flujo
    if (isGoogle) {
      setLoading(false);
      setErrorMsg("USUARIO REGISTRADO CON GOOGLE, ACCEDA CON GOOGLE.");
      return;
    }

    // 2) Intentar actualizar contraseña
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      const raw = (error.message || "").toLowerCase();

      // Mensajes comunes y feos => convertir a UX clara
      if (raw.includes("auth session missing") || raw.includes("session") || raw.includes("jwt")) {
        setErrorMsg("Sesión no encontrada. Para cambiar la contraseña, abrí el enlace de recuperación desde tu email o iniciá sesión nuevamente.");
        return;
      }

      setErrorMsg(error.message);
      return;
    }

    setMsg("Contraseña actualizada. Te llevamos al inicio de sesión...");
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl shadow p-8 w-full max-w-md space-y-4">
        <h1 className="text-lg font-semibold">Crear nueva contraseña</h1>
        <p className="text-sm text-gray-500">Escribí tu nueva contraseña para tu cuenta AlFra.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contraseña"
            className="w-full border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar contraseña"
            className="w-full border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-2 rounded-md font-semibold hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>

        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
      </div>
    </div>
  );
}
