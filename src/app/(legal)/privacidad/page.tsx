import { APP_NAME, CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export const metadata = { title: "Política de privacidad" };

const h2 = "mt-9 mb-2 text-[17px] font-medium";
const p = "text-muted-foreground mb-3 text-[14.5px] leading-relaxed";
const li = "text-muted-foreground text-[14.5px] leading-relaxed";

export default function PrivacidadPage() {
  return (
    <article>
      <h1 className="mb-1 text-[26px] font-medium">Política de privacidad</h1>
      <p className="text-muted-foreground mb-6 font-mono text-[10.5px] uppercase">
        Actualizada el {LEGAL_UPDATED}
      </p>

      <p className={p}>
        {APP_NAME} es una aplicación personal de finanzas. Esta política explica qué datos
        guarda, para qué los usa, con quién los comparte y cómo puedes controlarlos. Está
        escrita para ser leída: si algo no queda claro, escríbenos.
      </p>

      <h2 className={h2}>Qué datos guardamos</h2>
      <ul className="mb-3 list-disc space-y-1.5 pl-5">
        <li className={li}>
          <strong className="text-foreground">Tu cuenta:</strong> correo, nombre y la
          forma en que entras (contraseña o Google). La contraseña no la vemos: la guarda
          cifrada el servicio de autenticación.
        </li>
        <li className={li}>
          <strong className="text-foreground">Lo que tú cargas:</strong> cuentas,
          movimientos, categorías, presupuestos, metas, tarjetas, deudas, inversiones y
          sus notas. Son datos financieros personales y los tratamos con ese cuidado.
        </li>
        <li className={li}>
          <strong className="text-foreground">Avisos en tu dispositivo:</strong> si los
          activas, guardamos la dirección técnica que entrega tu navegador para poder
          enviarte notificaciones, y el nombre del navegador.
        </li>
        <li className={li}>
          <strong className="text-foreground">Cookies de sesión:</strong> solo las
          necesarias para mantenerte conectado. No usamos cookies de publicidad ni de
          análisis.
        </li>
      </ul>
      <p className={p}>
        {APP_NAME} no se conecta a tu banco ni te pide las claves de tus cuentas
        bancarias. Todo lo que ves lo escribiste tú.
      </p>

      <h2 className={h2}>Para qué los usamos</h2>
      <p className={p}>
        Solo para entregarte el servicio: mostrarte tus saldos, reportes y proyecciones,
        convertir entre monedas, generar tus movimientos recurrentes y enviarte los avisos
        que activaste. No vendemos tus datos, no los usamos para publicidad y no armamos
        perfiles para terceros.
      </p>

      <h2 className={h2}>Quién más participa</h2>
      <p className={p}>
        Para funcionar usamos proveedores que tratan datos en nuestro nombre:
      </p>
      <ul className="mb-3 list-disc space-y-1.5 pl-5">
        <li className={li}>
          <strong className="text-foreground">Supabase:</strong> base de datos y
          autenticación. Tus datos se guardan en su infraestructura (región de São Paulo,
          Brasil), separados por usuario con reglas de acceso a nivel de base de datos.
        </li>
        <li className={li}>
          <strong className="text-foreground">Vercel:</strong> alojamiento de la
          aplicación.
        </li>
        <li className={li}>
          <strong className="text-foreground">Google:</strong> solo si eliges entrar con
          Google; recibimos tu nombre y correo.
        </li>
        <li className={li}>
          <strong className="text-foreground">mindicador.cl:</strong> de ahí leemos el
          valor público del dólar, la UF y la UTM. No le enviamos ningún dato tuyo.
        </li>
        <li className={li}>
          <strong className="text-foreground">
            Servicios de notificaciones del navegador
          </strong>{" "}
          (Google, Apple o Mozilla, según tu dispositivo), si activas los avisos: por
          ellos pasa el texto breve de cada aviso.
        </li>
      </ul>
      <p className={p}>
        Algunos de estos proveedores están fuera de Chile, por lo que tus datos pueden
        tratarse en otros países.
      </p>

      <h2 className={h2}>Cuánto tiempo los guardamos</h2>
      <p className={p}>
        Mientras tu cuenta exista. Si la eliminas desde Configuración, se borran tu acceso
        y todos los datos del espacio. Los respaldos que tú descargaste quedan en tu
        poder: no están cifrados, guárdalos en un lugar seguro.
      </p>

      <h2 className={h2}>Tus derechos</h2>
      <p className={p}>
        De acuerdo con la normativa chilena de protección de datos personales, puedes
        acceder a tus datos, corregirlos, pedir que se eliminen, llevártelos y oponerte a
        su tratamiento. La mayoría los ejerces tú mismo desde la aplicación:
      </p>
      <ul className="mb-3 list-disc space-y-1.5 pl-5">
        <li className={li}>
          <strong className="text-foreground">Acceso y portabilidad:</strong>{" "}
          Configuración → Datos → exportar respaldo (JSON) o movimientos (CSV).
        </li>
        <li className={li}>
          <strong className="text-foreground">Rectificación:</strong> edita cualquier
          dato, y tu nombre, correo y contraseña en Configuración → Perfil.
        </li>
        <li className={li}>
          <strong className="text-foreground">Supresión:</strong> Configuración → Zona de
          peligro → eliminar mi cuenta y mis datos.
        </li>
      </ul>
      <p className={p}>
        {CONTACT_EMAIL ? (
          <>
            Para cualquier otra solicitud, escríbenos a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline">
              {CONTACT_EMAIL}
            </a>
            .
          </>
        ) : (
          <>Para cualquier otra solicitud, contacta a quien te dio acceso a {APP_NAME}.</>
        )}
      </p>

      <h2 className={h2}>Seguridad</h2>
      <p className={p}>
        Las conexiones van cifradas (HTTPS), cada usuario solo puede leer y escribir los
        datos de su propio espacio, y las operaciones sensibles piden confirmar tu
        contraseña. Ningún sistema es infalible; si detectáramos un incidente que afecte
        tus datos, te avisaremos.
      </p>

      <h2 className={h2}>Menores de edad</h2>
      <p className={p}>{APP_NAME} no está dirigida a menores de edad.</p>

      <h2 className={h2}>Cambios a esta política</h2>
      <p className={p}>
        Si cambiamos algo importante, lo avisaremos en la aplicación y actualizaremos la
        fecha de arriba.
      </p>
    </article>
  );
}
