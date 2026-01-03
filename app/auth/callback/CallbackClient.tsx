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
        // 1) Si ya hay sesión, chau callback
        const { data: s1 } = await supabase.auth.getSession();
        if (s1.session) {
          router.replace("/dashboard");
          return;
        }

        // 2) Si vino con error explícito
        const err = searchParams.get("error");
        const errDesc = searchParams.get("error_description");
        if (err) {
          setMsg(errDesc || "No se pudo iniciar sesión.");
          setTimeout(() => router.replace("/login"), 900);
          return;
        }

        // 3) Si hay hash (#access_token=...) (suele pasar en verify email / magic link)
        if (typeof window !== "undefined" && window.location.hash?.length > 1) {
          // getSessionFromUrl existe en supabase-js v2; si no existiera, no rompe
          const anyAuth = supabase.auth as any;
          if (typeof anyAuth.getSessionFromUrl === "function") {
            const { data, error } = await anyAuth.getSessionFromUrl({ storeSession: true });
            if (!error && data?.session) {
              router.replace("/dashboard");
              return;
            }
          }
        }

        // 4) OAuth PKCE: viene con ?code=
        const code = searchParams.get("code");
        if (!code) {
          // acceso directo o link incompleto => no mostramos error
          router.replace("/login");
          return;
        }

        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);

        if (exErr) {
          const m = (exErr.message || "").toLowerCase();

          // caso típico: falta code_verifier (no asustar al usuario)
          if (m.includes("code verifier") || m.includes("code_verifier")) {
            router.replace("/login");
            return;
          }

          setMsg(exErr.message || "Error procesando el login.");
          setTimeout(() => router.replace("/login"), 900);
          return;
        }

        router.replace("/dashboard");
      } catch {
        router.replace("/login");
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
