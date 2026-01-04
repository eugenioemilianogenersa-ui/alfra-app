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
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 px-4 overflow-hidden">
      
      {/* 1. EFECTO GLOW DE FONDO (Igual que Splash Screen) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* 2. TARJETA GLASSMORPHISM (Cristal Oscuro) */}
      <div className="relative z-10 w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800/50 shadow-2xl rounded-2xl p-8 space-y-8">

        {/* LOGO (Usamos la versión blanca para contraste) */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-24 h-24">
            <Image
              src="/logo-blanco.png" // CAMBIO: Usamos el logo blanco
              alt="AlFra"
              fill
              className="object-contain drop-shadow-lg"
              priority
            />
          </div>
          <h2 className="text-xl font-bold text-white tracking-widest uppercase">AlFra App</h2>
        </div>

        {/* TITULO */}
        <div className="text-center space-y-1">
          <h1 className="text-lg font-medium text-slate-200">Bienvenido de nuevo</h1>
          <p className="text-sm text-slate-400">
            Ingresa tus credenciales para continuar
          </p>
        </div>

        {/* BOTON GOOGLE DARK */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg py-2.5 text-sm font-medium transition duration-200"
        >
          <Image
            src="/google.svg"
            alt="Google"
            width={20}
            height={20}
            className="opacity-90"
          />
          Continuar con Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-500 uppercase tracking-wider">o con email</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* FORMULARIO */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nombre@ejemplo.com"
                className="w-full bg-slate-950/50 text-white rounded-lg border border-slate-700 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition placeholder:text-slate-600"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">Contraseña</label>
                <Link href="/recuperar" className="text-xs text-emerald-400 hover:text-emerald-300 transition">
                  ¿Olvidaste tu clave?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950/50 text-white rounded-lg border border-slate-700 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition placeholder:text-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7b634f] hover:bg-[#8c735d] text-white py-3 rounded-lg font-bold tracking-wide shadow-lg hover:shadow-emerald-900/20 transition disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-[0.98]"
          >
            {loading ? "INGRESANDO..." : "INGRESAR"}
          </button>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-900/50">
               <p className="text-sm text-red-400 text-center">{errorMsg}</p>
            </div>
          )}
        </form>

        {/* LINKS */}
        <div className="text-center pt-2">
          <p className="text-sm text-slate-500">
            ¿No tenés cuenta?{" "}
            <Link href="/signup" className="font-semibold text-emerald-400 hover:text-emerald-300 transition">
              Crear cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}