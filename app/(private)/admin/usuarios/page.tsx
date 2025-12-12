export const dynamic = "force-dynamic";

import { Suspense } from "react";
import UsuariosClient from "./UsuariosClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando...</div>}>
      <UsuariosClient />
    </Suspense>
  );
}
