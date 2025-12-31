"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [msg, setMsg] = useState("Procesando autenticación...");

  useEffect(() => {
    async function run() {
      try {
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");
        if (error) {
          setMsg(errorDescription || "No se pudo iniciar sesión.");
          setTimeout(() => router.replace("/login"), 1200);
          return;
        }

        const code = searchParams.get("code");
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) {
            setMsg(exErr.message || "Error procesando el login.");
            setTimeout(() => router.replace("/login"), 1200);
            return;
          }
        }

        // Si no hay code, igual intentamos: puede venir sesión ya detectada
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace("/dashboard");
          return;
        }

        setMsg("Sesión no encontrada. Volviendo al login...");
        setTimeout(() => router.replace("/login"), 1200);
      } catch {
        setMsg("Error inesperado. Volviendo al login...");
        setTimeout(() => router.replace("/login"), 1200);
      }
    }

    run();
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl shadow p-6 w-full max-w-md text-center">
        <div className="text-sm text-slate-700">{msg}</div>
        <div className="mt-3 text-xs text-slate-400">ALFRA APP</div>
      </div>
    </div>
  );
}
