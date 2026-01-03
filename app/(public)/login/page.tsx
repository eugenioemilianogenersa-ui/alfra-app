"use client";
export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent, useEffect } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Si ya hay sesión → dashboard
  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/dashboard");
      }
    }
    check();
  }, [router, supabase]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.push("/dashboard");
  }

  async function handleGoogleLogin() {
    const origin = window.location.origin;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-black via-green-950 to-black px-4">
      <div className="bg-white/95 shadow-lg rounded-2xl w-full max-w-md px-10 py-10 space-y-6">

        {/* LOGO */}
        <div className="flex flex-col items-center gap-2">
          <Image
            src="/logo-alfra.png"
            alt="AlFra"
            width={100}
            height={100}
            priority
          />
          <h2 className="text-center text-lg font-semibold">AlFra</h2>
        </div>

        {/* TITULO */}
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-1">Ingresar a AlFra</h1>
          <p className="text-sm text-gray-500">
            Entrá con tu correo y contraseña o Google.
          </p>
        </div>

        {/* GOOGLE */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-md py-2 text-sm font-medium hover:bg-gray-50 transition"
        >
          <Image
            src="/google.svg"
            alt="Google"
            width={18}
            height={18}
          />
          Continuar con Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">o</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* FORM */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7b634f] text-white py-2 rounded-md font-semibold hover:bg-[#6d5745] disabled:opacity-60"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          {errorMsg && (
            <p className="text-sm text-red-600 text-center">{errorMsg}</p>
          )}
        </form>

        {/* LINKS */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <Link href="/recuperar" className="text-sm text-emerald-700 hover:underline">
            Recuperar contraseña
          </Link>
          <p className="text-sm text-gray-500">
            ¿No tenés cuenta?{" "}
            <Link href="/signup" className="font-semibold text-emerald-700 hover:underline">
              Crear cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
