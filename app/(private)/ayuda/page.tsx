export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AyudaClient from "./AyudaClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center bg-slate-50">
          Cargando...
        </div>
      }
    >
      <AyudaClient />
    </Suspense>
  );
}
