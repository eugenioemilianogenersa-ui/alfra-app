// C:\Dev\alfra-app\app\legales\page.tsx
import Link from "next/link";

export const metadata = {
  title: "Legales | ALFRA APP",
};

export default function LegalesPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-6">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold leading-tight">Legales</h1>
            <Link
              href="/"
              className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
            >
              Volver
            </Link>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            Términos y Condiciones + Política de Privacidad de ALFRA APP.
          </p>
        </div>

        {/* Términos */}
        <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-base font-semibold">Términos y Condiciones</h2>
          <p className="mt-2 text-sm text-slate-200">
            <span className="font-semibold">ALFRA APP</span> – Términos y Condiciones Generales
          </p>

          <div className="mt-3 space-y-3 text-sm text-slate-200">
            <div>
              <p className="font-semibold">1. Aceptación</p>
              <p className="mt-1 text-slate-300">
                Al descargar, acceder o utilizar la aplicación web progresiva “AlFra App” (la “App”),
                el usuario acepta estos Términos y Condiciones. Si no está de acuerdo, no utilice la App.
              </p>
            </div>

            <div>
              <p className="font-semibold">2. El Servicio</p>
              <p className="mt-1 text-slate-300">
                AlFra Cervecería Artesanal (Coronel Moldes, Córdoba) pone a disposición esta App para gestión de pedidos,
                visualización de menú y administración del “Club de Puntos AlFra”. Nos esforzamos por mantener la App operativa,
                pero no garantizamos ausencia de interrupciones técnicas.
              </p>
            </div>

            <div>
              <p className="font-semibold">3. Registro y Seguridad</p>
              <p className="mt-1 text-slate-300">
                El usuario es responsable de mantener la confidencialidad de su cuenta (Google Login o email).
                Cualquier pedido o canje realizado desde su cuenta se considerará válido. AlFra no se hace responsable por uso indebido
                del dispositivo del usuario desbloqueado.
              </p>
            </div>

            <div>
              <p className="font-semibold">4. Club de Puntos y Beneficios</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-300">
                <li>Los puntos (“Sellos” o “Puntos”) se obtienen solo por compras reales y verificadas en AlFra.</li>
                <li>No tienen valor monetario, no son transferibles y sirven únicamente para canjear beneficios publicados.</li>
                <li>AlFra puede establecer caducidad si la cuenta permanece inactiva por más de 12 meses.</li>
                <li>
                  Cualquier intento de manipulación del sistema, uso de “bugs” o generación falsa de puntos resultará en cancelación
                  de la cuenta y pérdida de beneficios (Derecho de Admisión Digital).
                </li>
                <li>Beneficios y puntos requeridos pueden variar sin previo aviso según stock/disponibilidad.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold">5. Propiedad Intelectual</p>
              <p className="mt-1 text-slate-300">
                Contenido visual, logos, textos y software son propiedad de AlFra o sus proveedores. Prohibida su copia o distribución
                sin autorización.
              </p>
            </div>

            <div>
              <p className="font-semibold">6. Limitación de Responsabilidad</p>
              <p className="mt-1 text-slate-300">
                AlFra no será responsable por daños indirectos derivados del uso de la App ni por fallas de conexión del usuario.
              </p>
            </div>

            <div>
              <p className="font-semibold">7. Ley Aplicable y Jurisdicción</p>
              <p className="mt-1 text-slate-300">
                Leyes de la República Argentina. Jurisdicción: Tribunales Ordinarios de la Provincia de Córdoba, renunciando a cualquier
                otro fuero.
              </p>
            </div>
          </div>
        </section>

        {/* Privacidad */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-base font-semibold">Política de Privacidad</h2>

          <div className="mt-3 space-y-3 text-sm text-slate-200">
            <div>
              <p className="font-semibold">1. Qué datos recolectamos</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-300">
                <li>Nombre y correo (Google Login o ingreso manual) para crear el perfil.</li>
                <li>Dirección de entrega y geolocalización (solo si el usuario la activa) para delivery.</li>
                <li>Historial de consumos para otorgar puntos.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold">2. Para qué usamos sus datos</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-300">
                <li>Gestionar y entregar pedidos.</li>
                <li>Administrar el Club de Puntos.</li>
                <li>Enviar notificaciones de estado/promo (si el usuario aceptó).</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold">3. Protección de Datos</p>
              <p className="mt-1 text-slate-300">
                Tratamos los datos con confidencialidad. No vendemos ni alquilamos información personal.
                Solo compartimos lo estrictamente necesario con proveedores tecnológicos para operar la App.
              </p>
            </div>

            <div>
              <p className="font-semibold">4. Sus Derechos (Ley 25.326)</p>
              <p className="mt-1 text-slate-300">
                Puede solicitar acceso, rectificación o supresión de datos y pedir baja/borrado escribiendo a{" "}
                <span className="font-semibold">alfrabeercerveceria@gmail.com</span>.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6 text-center text-xs text-slate-500">
          Última actualización: {new Date().getFullYear()}
        </div>
      </div>
    </main>
  );
}
