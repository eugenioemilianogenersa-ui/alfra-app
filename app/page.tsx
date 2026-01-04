"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// AQUI DEFINES TU VERSION MANUALMENTE PARA MOSTRARLA
const APP_VERSION = `V ${process.env.NEXT_PUBLIC_APP_VERSION}`; 

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
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-slate-950 overflow-hidden px-4">
      
      {/* GLOW DE FONDO */}
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
        {/* LOGO */}
        <div className="relative w-40 h-40 mb-6 md:w-48 md:h-48">
          <Image
            src="/logo-blanco.png"
            alt="AlFra Cerveza Artesanal"
            fill
            className="object-contain drop-shadow-2xl" 
            priority
          />
        </div>

        {/* TEXTOS */}
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
          
          {/* NUEVO: VERSION DE LA APP */}
          {/* Aparece suavemente un poco después */}
          <motion.span 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             transition={{ delay: 1.2, duration: 1 }}
             className="mt-4 text-[10px] text-slate-600 tracking-widest font-mono"
          >
            {APP_VERSION}
          </motion.span>

        </motion.div>
      </motion.div>

      {/* SPINNER */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-12 z-10"
      >
        <div className="w-5 h-5 border-2 border-slate-700 border-t-emerald-400 rounded-full animate-spin"></div>
      </motion.div>

    </div>
  );
}