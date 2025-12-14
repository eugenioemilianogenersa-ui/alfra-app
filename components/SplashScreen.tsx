"use client";

import Image from "next/image";

export default function SplashScreen() {
  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center overflow-hidden bg-[#061a12]">
      {/* glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-emerald-500/25 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-56 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-lime-400/12 blur-[130px]" />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/45 via-transparent to-black/60" />

      {/* logo */}
      <div className="relative flex flex-col items-center">
        <div className="relative h-[170px] w-[170px] sm:h-[210px] sm:w-[210px]">
          <Image
            src="/logo-blanco.png"
            alt="AlFra"
            fill
            priority
            className="object-contain drop-shadow-[0_24px_50px_rgba(16,185,129,0.25)]"
          />
        </div>
        <div className="mt-8 h-0.5 w-28 rounded-full bg-emerald-200/35" />
      </div>
    </div>
  );
}
