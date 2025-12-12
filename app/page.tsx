import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-black via-green-950 to-black text-center text-white px-4">
      <Image
        src="/logo-alfra.png"
        alt="AlFra Cerveza Artesanal"
        width={100}
        height={100}
        className="mb-4 object-contain"
      />
      <h1 className="text-3xl font-bold mb-2">AlFra App</h1>
      <p className="max-w-md text-sm text-gray-300 mb-6">
        Gestioná carta, choperas, comercios y tu programa de puntos.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/login"
          className="bg-[#7b634f] py-2 rounded-md font-semibold hover:bg-[#6d5745] transition"
        >
          ACCEDER
        </Link>
      </div>
      <p className="text-xs text-gray-500 mt-8">AlFra - Cerveza artesanal</p>
    </div>
  );
}
