import { APP_NAME, CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export const metadata = { title: "Términos de uso" };

const h2 = "mt-9 mb-2 text-[17px] font-medium";
const p = "text-muted-foreground mb-3 text-[14.5px] leading-relaxed";
const li = "text-muted-foreground text-[14.5px] leading-relaxed";

export default function TerminosPage() {
  return (
    <article>
      <h1 className="mb-1 text-[26px] font-medium">Términos de uso</h1>
      <p className="text-muted-foreground mb-6 font-mono text-[10.5px] uppercase">
        Actualizados el {LEGAL_UPDATED}
      </p>

      <p className={p}>
        Al crear una cuenta o usar {APP_NAME} aceptas estos términos. Son breves a
        propósito.
      </p>

      <h2 className={h2}>Qué es {APP_NAME}</h2>
      <p className={p}>
        Una herramienta para registrar y ordenar tus finanzas personales: cuentas,
        movimientos, presupuestos, tarjetas, deudas e inversiones. Los cálculos
        (proyecciones, rentabilidades, disponible por día) son{" "}
        <strong>informativos</strong>: dependen de los datos que cargas y de supuestos
        simples.
      </p>

      <h2 className={h2}>No es asesoría</h2>
      <p className={p}>
        {APP_NAME} no entrega asesoría financiera, tributaria, legal ni de inversión, y no
        recomienda productos. Las decisiones que tomes con esta información son tuyas. Las
        cotizaciones (dólar, UF, UTM) provienen de una fuente pública y pueden tener
        retrasos o errores: compruébalas donde corresponda antes de un acto formal.
      </p>

      <h2 className={h2}>Tu cuenta y tus datos</h2>
      <ul className="mb-3 list-disc space-y-1.5 pl-5">
        <li className={li}>
          Eres responsable de la veracidad de lo que cargas y de cuidar tu contraseña.
        </li>
        <li className={li}>
          Tus datos son tuyos. Puedes exportarlos y eliminar tu cuenta cuando quieras
          desde Configuración. El tratamiento de datos personales se explica en la{" "}
          <a href="/privacidad" className="text-foreground underline">
            política de privacidad
          </a>
          .
        </li>
        <li className={li}>
          Eres responsable de los respaldos que descargues: no están cifrados.
        </li>
      </ul>

      <h2 className={h2}>Uso aceptable</h2>
      <p className={p}>
        No uses {APP_NAME} para actividades ilícitas, para intentar acceder a datos de
        otras personas, ni para sobrecargar o vulnerar el servicio.
      </p>

      <h2 className={h2}>Disponibilidad</h2>
      <p className={p}>
        Esta es una versión de prueba. Hacemos lo posible por mantenerla disponible y por
        no perder datos, pero puede haber interrupciones, cambios o errores. Te
        recomendamos descargar un respaldo con regularidad.
      </p>

      <h2 className={h2}>Responsabilidad</h2>
      <p className={p}>
        El servicio se entrega tal como está. Dentro de lo que permite la ley, no
        respondemos por pérdidas indirectas derivadas del uso de la aplicación, sin
        perjuicio de los derechos irrenunciables que la legislación chilena reconoce a los
        consumidores.
      </p>

      <h2 className={h2}>Cierre de la cuenta</h2>
      <p className={p}>
        Puedes dejar de usar {APP_NAME} y eliminar tu cuenta en cualquier momento. Podemos
        suspender cuentas que incumplan estos términos o pongan en riesgo el servicio.
      </p>

      <h2 className={h2}>Cambios</h2>
      <p className={p}>
        Podemos actualizar estos términos. Si el cambio es relevante, lo avisaremos en la
        aplicación; seguir usándola después implica aceptarlo.
      </p>

      <h2 className={h2}>Ley aplicable y contacto</h2>
      <p className={p}>
        Estos términos se rigen por las leyes de la República de Chile.{" "}
        {CONTACT_EMAIL ? (
          <>
            Para consultas, escríbenos a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline">
              {CONTACT_EMAIL}
            </a>
            .
          </>
        ) : null}
      </p>
    </article>
  );
}
