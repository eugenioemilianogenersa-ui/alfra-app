// components/BackButton.tsx
"use client";

import { usePathname, useRouter } from "next/navigation";

export default function BackButton({ hideOn = [] as string[] }) {
  const pathname = usePathname();
  const router = useRouter();

  if (hideOn.includes(pathname)) return null;

  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 px-3 py-1 rounded bg-amber-500 text-white text-xs sm:text-sm hover:bg-amber-600"
    >
      <span role="img" aria-label="cerveza">🍺</span>
      Volver
    </button>
  );
}
