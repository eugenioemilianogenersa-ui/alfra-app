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

  async function handleGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-black via-green-950 to-black px-4">
      <div className="bg-white/95 shadow-lg rounded-2xl w-full max-w-md px-10 py-10 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Image
            src="/logo-alfra.png"
            alt="AlFra"
            width={100}
            height={100}
            className="object-contain"
          />
          <h2 className="text-center text-lg font-semibold">AlFra</h2>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-semibold mb-1">Ingresar a AlFra</h1>
          <p className="text-sm text-gray-500">
            Entrá con tu correo y contraseña o Google.
          </p>
        </div>

        {/* GOOGLE */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 border border-slate-300 rounded-md py-2 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-60"
        >
          <Image
            src="/google.svg"
            alt="Google"
            width={18}
            height={18}
          />
          Continuar con Google
        </button>

        <div className="relative text-center">
          <span className="text-xs text-gray-400 bg-white px-2 relative z-10">o</span>
          <div className="absolute inset-x-0 top-1/2 h-px bg-gray-200"></div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-emerald-500"
              placeholder="tu@correo.com"
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
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7b634f] text-white py-2 rounded-md font-semibold hover:bg-[#6d5745] transition disabled:opacity-60"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          {errorMsg && (
            <p className="text-sm text-red-600 text-center">{errorMsg}</p>
          )}
        </form>

        <div className="flex flex-col items-center gap-2 pt-2">
          <Link
            href="/recuperar"
            className="text-sm text-emerald-700 hover:underline"
          >
            Recuperar contraseña
          </Link>
          <p className="text-sm text-gray-500">
            ¿No tenés cuenta?{" "}
            <Link
              href="/signup"
              className="font-semibold text-emerald-700 hover:underline"
            >
              Crear cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
