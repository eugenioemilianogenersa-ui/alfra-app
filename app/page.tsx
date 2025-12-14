"use client";

import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-black via-green-950 to-black text-center text-white px-4">
      <Image
        src="/logo-blanco.png"
        alt="AlFra Cerveza Artesanal"
        width={100}
        height={100}
        className="mb-3 object-contain"
        priority
      />

      {/* TEXTO MARCA */}
      <h1 className="mb-6 text-xl font-semibold tracking-[0.35em] text-emerald-100/90">
        ALFRA APP
      </h1>

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
