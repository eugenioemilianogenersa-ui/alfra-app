"use client";
export const dynamic = "force-dynamic";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(""); 
  
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");
    
    if (password.length < 6) {
        setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
        return;
    }
    if (phone.length < 10) {
        setErrorMsg("Ingresá un número de celular válido (mínimo 10 dígitos).");
        return;
    }

    setLoading(true);

    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    
    // Limpiamos el teléfono ANTES de enviarlo
    const cleanPhone = phone.trim().replace(/[^0-9+]/g, "");

    // 1. Crear usuario en Auth
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/login`,
        // 🔹 CLAVE: Mandamos el teléfono en la "mochila" (metadata) del usuario.
        // El Trigger de la base de datos lo leerá de aquí y lo guardará solo.
        data: {
            phone: cleanPhone, 
            full_name: email.split('@')[0], // Un nombre provisorio basado en el mail
        }
      },
    });

    if (authError) {
      setErrorMsg(authError.message);
      setLoading(false);
      return;
    }

    // 🛑 ELIMINAMOS LA PARTE QUE DABA ERROR. 
    // Ya no hace falta guardar manualmente en 'profiles', el Trigger lo hace por nosotros.

    setLoading(false);
    setMsg("Cuenta creada con éxito. Redirigiendo...");
    
    setTimeout(() => {
        router.push("/login");
    }, 2000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl shadow p-8 w-full max-w-md space-y-4">
        <h1 className="text-lg font-semibold text-slate-800">Crear cuenta en AlFra</h1>
        <p className="text-sm text-gray-500">
          Tus pedidos de Fudo y mostrador se vincularán automáticamente a tu número.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              placeholder="tu@correo.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Celular <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
              placeholder="Ej: 3581234567 (Sin guiones)"
            />
            <p className="text-[10px] text-slate-400 mt-1">
                Es clave para que puedas seguir tus pedidos en tiempo real.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-2 rounded-md font-bold hover:bg-emerald-700 disabled:opacity-60 transition-transform active:scale-95 text-sm"
          >
            {loading ? "Creando cuenta..." : "Registrarme"}
          </button>
        </form>

        {msg && (
            <div className="p-3 bg-green-100 text-green-700 text-sm rounded text-center font-medium animate-pulse">
                {msg}
            </div>
        )}
        
        {errorMsg && (
            <div className="p-3 bg-red-100 text-red-700 text-sm rounded text-center">
                ⚠️ {errorMsg}
            </div>
        )}

        <p className="text-sm text-gray-500 pt-4 text-center border-t">
          ¿Ya tenés cuenta?{" "}
          <button
            onClick={() => router.push("/login")}
            className="text-emerald-700 font-bold hover:underline"
          >
            Iniciar sesión
          </button>
        </p>
      </div>
    </div>
  );
}