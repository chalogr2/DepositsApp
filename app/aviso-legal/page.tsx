export default function AvisoLegalPage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Aviso legal</h1>

      <p className="small">
        En cumplimiento de lo dispuesto en la Ley 34/2002, de 11 de julio, de servicios de la sociedad de la
        información y de comercio electrónico (LSSI-CE), se facilita a continuación la información general de este
        sitio web.
      </p>

      <h3>1. Datos del titular</h3>
      <ul>
        <li>
          <b>Titular:</b> TU_EMPRESA / TU_NOMBRE_COMERCIAL
        </li>
        <li>
          <b>NIF/CIF:</b> TU_NIF
        </li>
        <li>
          <b>Domicilio:</b> TU_DIRECCIÓN (España)
        </li>
        <li>
          <b>Email de contacto:</b> TU_EMAIL
        </li>
        <li>
          <b>Teléfono:</b> TU_TELÉFONO (opcional)
        </li>
        <li>
          <b>Registro Mercantil / datos registrales:</b> (si aplica)
        </li>
      </ul>

      <h3>2. Objeto y descripción del servicio</h3>
      <p className="small">
        Este sitio web ofrece un servicio para que establecimientos de hostelería (en adelante, “restaurantes”) puedan:
      </p>
      <ul>
        <li className="small">Crear enlaces de pago para depósitos asociados a reservas.</li>
        <li className="small">Gestionar dichas reservas y el estado de pago desde un panel.</li>
        <li className="small">
          Gestionar la suscripción al servicio (alta/baja y forma de pago) a través del portal de facturación.
        </li>
      </ul>
      <p className="small">
        Los pagos de depósitos y la facturación se procesan mediante Stripe. El restaurante es quien define sus
        condiciones de reserva, incluyendo, en su caso, política de reembolso. El titular del sitio no es parte del
        contrato de reserva entre el restaurante y el cliente final.
      </p>

      <h3>3. Condiciones de acceso y uso</h3>
      <p className="small">
        El acceso a este sitio web es gratuito, sin perjuicio de que determinados servicios (como la suscripción para
        restaurantes) puedan estar sujetos a precio. El uso del sitio atribuye la condición de usuario e implica la
        aceptación de la normativa y de los textos legales publicados en el mismo (Aviso legal, Política de privacidad,
        Política de cookies, Términos y condiciones y Condiciones de suscripción).
      </p>
      <p className="small">
        El usuario se compromete a utilizar el sitio de forma diligente, lícita y conforme a la buena fe, absteniéndose
        de:
      </p>
      <ul>
        <li className="small">Utilizar el sitio con fines ilícitos o lesivos.</li>
        <li className="small">Intentar acceder o manipular áreas restringidas sin autorización.</li>
        <li className="small">
          Introducir o difundir virus, malware o cualquier sistema susceptible de causar daños.
        </li>
        <li className="small">Vulnerar derechos de terceros o la normativa aplicable.</li>
      </ul>

      <h3>4. Registro, credenciales y seguridad</h3>
      <p className="small">
        El acceso al panel de restaurantes puede requerir autenticación. El usuario es responsable de custodiar sus
        credenciales y de las actividades realizadas desde su cuenta. En caso de acceso no autorizado, deberá
        comunicarlo de inmediato a través del email de contacto.
      </p>

      <h3>5. Propiedad intelectual e industrial</h3>
      <p className="small">
        Salvo indicación expresa en contrario, el titular es propietario o cuenta con licencia suficiente sobre los
        derechos de explotación del diseño, código fuente, textos, imágenes, marcas, logotipos y demás contenidos del
        sitio. Queda prohibida su reproducción, distribución, comunicación pública o transformación, total o parcial,
        sin autorización previa y por escrito del titular, salvo en los casos permitidos por la ley.
      </p>

      <h3>6. Responsabilidad</h3>
      <p className="small">
        El titular se esfuerza por mantener la disponibilidad y correcto funcionamiento del sitio, pero no garantiza la
        ausencia de interrupciones, errores o fallos técnicos. En la medida permitida por la normativa aplicable, el
        titular no será responsable de los daños derivados de interferencias, interrupciones, virus informáticos,
        averías, desconexiones o sobrecargas del sistema, siempre que no le sean imputables.
      </p>
      <p className="small">
        El titular tampoco se responsabiliza del contenido, condiciones o servicios ofrecidos por terceros, incluyendo
        (sin limitación) plataformas de pago y sitios web enlazados.
      </p>

      <h3>7. Enlaces a terceros</h3>
      <p className="small">
        Este sitio puede incluir enlaces a páginas de terceros. El titular no ejerce control sobre dichos contenidos y
        no asume responsabilidad por los mismos ni por las políticas de privacidad/cookies de terceros. El usuario debe
        revisar dichas políticas antes de utilizar servicios externos.
      </p>

      <h3>8. Protección de datos y cookies</h3>
      <p className="small">
        El tratamiento de datos personales se rige por la Política de privacidad. El uso de cookies y tecnologías
        similares se regula en la Política de cookies.
      </p>

      <h3>9. Modificaciones</h3>
      <p className="small">
        El titular podrá modificar en cualquier momento el contenido del sitio y los textos legales. Las modificaciones
        serán aplicables desde su publicación. Se recomienda al usuario revisarlos periódicamente.
      </p>

      <h3>10. Legislación aplicable y jurisdicción</h3>
      <p className="small">
        Este Aviso legal se rige por la legislación española. En caso de controversia, las partes se someterán a los
        juzgados y tribunales que resulten competentes conforme a la normativa aplicable. Si el usuario tiene la
        condición de consumidor, se aplicarán las normas de competencia territorial imperativas.
      </p>

      <div className="spacer" />
      <p className="small">
        <b>Última actualización:</b> FECHA (por ejemplo: 10/02/2026)
      </p>
    </main>
  );
}
