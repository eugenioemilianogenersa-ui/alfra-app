"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [msg, setMsg] = useState("Procesando autenticación...");

  useEffect(() => {
    async function run() {
      try {
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        // Si cayó acá con error explícito
        if (error) {
          setMsg(errorDescription || "No se pudo iniciar sesión.");
          setTimeout(() => router.replace("/login"), 900);
          return;
        }

        const code = searchParams.get("code");

        // ✅ PRO: si no hay code, es acceso directo -> afuera
        if (!code) {
          router.replace("/login");
          return;
        }

        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) {
          setMsg(exErr.message || "Error procesando el login.");
          setTimeout(() => router.replace("/login"), 900);
          return;
        }

        router.replace("/dashboard");
      } catch {
        setMsg("Error inesperado. Volviendo al login...");
        setTimeout(() => router.replace("/login"), 900);
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
