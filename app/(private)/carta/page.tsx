"use client";

export default function CartaPage() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-4 space-y-4">
      <h1 className="text-xl font-semibold text-amber-600 flex items-center gap-2">
        🍺 Hacé tu pedido online
      </h1>
      <p className="text-sm text-slate-500">
        Acá podés explorar el menú y hacer tu pedido directo desde la tienda online de Fudo.
      </p>

      <div className="w-full max-w-5xl h-[80vh] rounded-xl overflow-hidden shadow-md border border-slate-200">
        <iframe
          src="https://menu.fu.do/alfracervezaartesanal"
          title="Carta AlFra"
          className="w-full h-full"
          style={{ border: 0 }}
          loading="lazy"
        ></iframe>
      </div>
    </div>
  );
}
