"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function HomePage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    const handleIntroRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      setTimeout(() => {
        if (session) {
          router.replace("/dashboard");
        } else {
          router.replace("/login");
        }
      }, 3000);
    };

    handleIntroRedirect();
  }, [router, supabase]);

  return (
    // CAMBIO 1: Fondo Slate-950 (Gris azulado muy oscuro, más moderno que el negro)
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-slate-950 overflow-hidden px-4">
      
      {/* CAMBIO 2: EFECTO GLOW (Luz ambiental) */}
      {/* Esto crea una "mancha" de luz verde esmeralda suave detrás del logo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }} 
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 1.2,
          ease: "easeOut",
        }}
        className="relative z-10 flex flex-col items-center"
      >
        {/* Logo */}
        <div className="relative w-40 h-40 mb-6 md:w-48 md:h-48">
          <Image
            src="/logo-blanco.png"
            alt="AlFra Cerveza Artesanal"
            fill
            className="object-contain drop-shadow-2xl" 
            priority
          />
        </div>

        {/* Texto con estilo más minimalista/tech */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="flex flex-col items-center gap-2"
        >
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-widest uppercase">
            Alfra
          </h1>
          <span className="text-xs md:text-sm font-light tracking-[0.4em] text-emerald-400/80 uppercase">
            Cerveza Artesanal
          </span>
        </motion.div>
      </motion.div>

      {/* Spinner de carga ultra fino y moderno */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-12 z-10"
      >
        {/* Un spinner más sutil en gris y blanco */}
        <div className="w-5 h-5 border-2 border-slate-700 border-t-emerald-400 rounded-full animate-spin"></div>
      </motion.div>

    </div>
  );
}