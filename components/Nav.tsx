import Link from "next/link";

export default function Nav() {
  const Item = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link href={href} className="px-3 py-2 rounded-lg hover:bg-zinc-100">
      {children}
    </Link>
  );

  return (
    <header className="border-b bg-white/70 backdrop-blur">
      <nav className="max-w-5xl mx-auto flex items-center gap-2 p-3">
        <Link href="/" className="font-bold text-lg">AlFra 🍺</Link>
        <div className="ml-auto flex gap-1">
          <Item href="/login">Login</Item>
          <Item href="/carta">Carta</Item>
          <Item href="/puntos">Puntos</Item>
          <Item href="/variedades">Variedades</Item>
          <Item href="/choperas">Choperas</Item>
          <Item href="/comercios">Comercios</Item>
          <Item href="/perfil">Perfil</Item>
        </div>
      </nav>
    </header>
  );
}
