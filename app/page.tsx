"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import SplashScreen from "@/components/SplashScreen";

export default function HomePage() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 900); // 0.9s
    return () => clearTimeout(t);
  }, []);

  if (showSplash) return <SplashScreen />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-black via-green-950 to-black text-center text-white px-4">
      <Image
        src="/logo-blanco.png"
        alt="AlFra Cerveza Artesanal"
        width={110}
        height={110}
        className="mb-5 object-contain opacity-95"
        priority
      />

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/login"
          className="bg-[#7b634f] py-2 rounded-md font-semibold hover:bg-[#6d5745] transition"
        >
          ACCEDER
        </Link>
      </div>
    </div>
  );
}
