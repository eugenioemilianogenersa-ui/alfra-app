export const dynamic = "force-dynamic";

import { Suspense } from "react";
import CartaClient from "./CartaClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-slate-500">Cargando...</div>}>
      <CartaClient />
    </Suspense>
  );
}
