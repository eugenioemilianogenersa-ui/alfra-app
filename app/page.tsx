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
      // 1. Verificamos si el usuario ya existe en Supabase
      const { data: { session } } = await supabase.auth.getSession();

      // 2. Esperamos 3 segundos para que se disfrute la animación
      setTimeout(() => {
        if (session) {
          // Si YA está logueado -> Lo mandamos directo adentro (Dashboard o Home interna)
          // IMPORTANTE: Si tu pantalla principal interna es otra, cambiá "/dashboard"
          router.replace("/dashboard"); 
        } else {
          // Si NO está logueado -> Lo mandamos al Login
          router.replace("/login");
        }
      }, 3000);
    };

    handleIntroRedirect();
  }, [router, supabase]);

  return (
    // Mantenemos tu fondo original con el gradiente
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-black via-green-950 to-black text-center text-white px-4 overflow-hidden">
      
      <motion.div
        initial={{ opacity: 0, scale: 0.5, y: 50 }} // Empieza pequeño e invisible
        animate={{ opacity: 1, scale: 1, y: 0 }}    // Termina tamaño real
        transition={{
          duration: 1.5,
          ease: [0, 0.71, 0.2, 1.01],
          scale: {
            type: "spring",
            damping: 12,
            stiffness: 100,
            restDelta: 0.001
          }
        }}
        className="flex flex-col items-center"
      >
        {/* Tu Logo Blanco */}
        <div className="relative w-32 h-32 mb-4 md:w-40 md:h-40">
          <Image
            src="/logo-blanco.png"
            alt="AlFra Cerveza Artesanal"
            fill
            className="object-contain drop-shadow-[0_0_25px_rgba(34,197,94,0.3)]" // Agregué un brillo verde sutil detrás
            priority
          />
        </div>

        {/* Texto ALFRA APP con animación retrasada */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }} // Aparece casi 1 seg después del logo
          className="text-xl font-semibold tracking-[0.35em] text-emerald-100/90"
        >
          ALFRA APP
        </motion.h1>
      </motion.div>

      {/* Spinner de carga minimalista abajo */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-10"
      >
        <div className="w-6 h-6 border-2 border-emerald-900 border-t-emerald-400 rounded-full animate-spin"></div>
      </motion.div>

    </div>
  );
}