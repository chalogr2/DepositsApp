export default function PrivacidadPage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Política de privacidad</h1>

      <p className="small">
        Esta política explica cómo tratamos los datos personales cuando usas el servicio (la “Plataforma”) y cómo
        puedes ejercer tus derechos conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).
      </p>

      <h3>1. Responsable del tratamiento</h3>
      <ul>
        <li>
          <b>Responsable:</b> TU_EMPRESA / TU_NOMBRE_COMERCIAL
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
      </ul>

      <h3>2. ¿Qué datos tratamos?</h3>
      <ul>
        <li>
          <b>Datos de cuenta:</b> email, identificadores de usuario, datos mínimos para autenticación (por ejemplo,
          tokens de acceso).
        </li>
        <li>
          <b>Datos del restaurante:</b> nombre del restaurante, configuración, estado de conexión con Stripe, datos
          necesarios para operar el panel.
        </li>
        <li>
          <b>Datos de reservas:</b> nombre del cliente, fecha/hora, comensales, importe del depósito, estado de pago y
          texto de política aportado por el restaurante.
        </li>
        <li>
          <b>Datos de pago/facturación:</b> se gestionan a través de Stripe. No almacenamos números completos de tarjeta
          ni credenciales bancarias del usuario final.
        </li>
        <li>
          <b>Datos técnicos:</b> registros básicos de seguridad (por ejemplo, eventos de autenticación) y datos
          imprescindibles para prevenir fraude y garantizar el funcionamiento.
        </li>
      </ul>

      <h3>3. Finalidades del tratamiento</h3>
      <ul>
        <li>Prestar el servicio: registro, acceso, panel, creación y gestión de reservas y enlaces de pago.</li>
        <li>Gestionar suscripciones, facturación y relación comercial con el restaurante.</li>
        <li>Atender solicitudes de soporte, incidencias técnicas y comunicaciones operativas.</li>
        <li>Seguridad, prevención de fraude, auditoría interna y cumplimiento normativo.</li>
      </ul>

      <h3>4. Base jurídica</h3>
      <ul>
        <li>
          <b>Ejecución de un contrato</b> (art. 6.1.b RGPD): para operar la cuenta, el panel y la gestión de reservas.
        </li>
        <li>
          <b>Cumplimiento de obligaciones legales</b> (art. 6.1.c RGPD): obligaciones contables/fiscales y atención a
          requerimientos de autoridades, cuando proceda.
        </li>
        <li>
          <b>Interés legítimo</b> (art. 6.1.f RGPD): seguridad, prevención de abuso/fraude, mejora del servicio y
          mantenimiento, siempre que no prevalezcan tus derechos.
        </li>
        <li>
          <b>Consentimiento</b> (art. 6.1.a RGPD): solo cuando sea necesario (por ejemplo, cookies no esenciales), según
          se describa en la Política de cookies.
        </li>
      </ul>

      <h3>5. Destinatarios, encargados del tratamiento y proveedores</h3>
      <p className="small">
        Para operar la Plataforma utilizamos proveedores que pueden tratar datos como encargados del tratamiento. Entre
        otros:
      </p>
      <ul>
        <li>
          <b>Stripe</b>: procesamiento de pagos, facturación y portal de suscripción.
        </li>
        <li>
          <b>Supabase</b>: autenticación y base de datos.
        </li>
        <li>
          <b>Vercel</b>: alojamiento y ejecución del sitio.
        </li>
      </ul>
      <p className="small">
        Estos proveedores actúan conforme a sus propios acuerdos y políticas, y aplicamos acuerdos/condiciones de
        encargo cuando corresponde.
      </p>

      <h3>6. Transferencias internacionales</h3>
      <p className="small">
        Algunos proveedores pueden alojar o tratar datos fuera del Espacio Económico Europeo (EEE). En ese caso, se
        aplicarán garantías adecuadas (por ejemplo, Cláusulas Contractuales Tipo u otros mecanismos reconocidos por la
        normativa) y las medidas de seguridad correspondientes, según el proveedor.
      </p>

      <h3>7. Plazos de conservación</h3>
      <ul>
        <li>
          <b>Cuenta del restaurante:</b> mientras la cuenta esté activa.
        </li>
        <li>
          <b>Datos de reservas:</b> mientras sean necesarios para la prestación del servicio, la atención de
          incidencias/soporte y el cumplimiento de obligaciones legales.
        </li>
        <li>
          <b>Datos de facturación:</b> durante los plazos exigidos por la normativa fiscal/contable, cuando sea
          aplicable.
        </li>
      </ul>
      <p className="small">
        Tras esos plazos, los datos se eliminarán o se anonimizarán, o se bloquearán cuando proceda legalmente.
      </p>

      <h3>8. Derechos de las personas usuarias</h3>
      <p className="small">
        Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y
        portabilidad enviando una solicitud a <b>TU_EMAIL</b>. Para proteger tu privacidad, podremos solicitar
        información adicional para verificar tu identidad.
      </p>
      <p className="small">
        Si consideras que el tratamiento no se ajusta a la normativa, puedes presentar una reclamación ante la Agencia
        Española de Protección de Datos (AEPD).
      </p>

      <h3>9. Datos de clientes finales (reservas)</h3>
      <p className="small">
        La Plataforma permite al restaurante gestionar reservas y cobros de depósitos. En este contexto, el restaurante
        puede actuar como responsable del tratamiento respecto a los datos de sus clientes finales (por ejemplo, nombre
        y datos de la reserva) y el Titular puede actuar como encargado del tratamiento, dependiendo del uso concreto.
        El restaurante es responsable de informar a sus clientes y de definir su política de reserva y reembolso.
      </p>

      <h3>10. Seguridad</h3>
      <p className="small">
        Aplicamos medidas técnicas y organizativas razonables para proteger los datos (control de accesos, cifrado en
        tránsito, medidas de seguridad en proveedores, etc.). Aun así, ningún sistema es 100% infalible.
      </p>

      <h3>11. Cambios en esta política</h3>
      <p className="small">
        Podemos actualizar esta política para reflejar cambios legales o del servicio. Publicaremos la versión vigente
        en esta página indicando la fecha de actualización.
      </p>

      <div className="spacer" />
      <p className="small">
        <b>Última actualización:</b> FECHA (por ejemplo: 10/02/2026)
      </p>
    </main>
  );
}
