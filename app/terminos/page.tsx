export default function TerminosPage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Términos y condiciones</h1>

      <p className="small">
        Estos Términos y Condiciones regulan el acceso y uso de la plataforma (el “Servicio”) ofrecida por
        <b> TU_EMPRESA / TU_NOMBRE_COMERCIAL</b> (“Titular”). Al crear una cuenta o utilizar el Servicio, aceptas estos
        términos. Si actúas en nombre de un restaurante, declaras que tienes autoridad para vincularlo a estos términos.
      </p>

      <h3>1. Objeto del servicio</h3>
      <p className="small">
        El Servicio permite a restaurantes (clientes profesionales) crear enlaces de pago para depósitos asociados a
        reservas, así como gestionar reservas y su estado de pago desde un panel. Los cobros y la facturación se
        procesan mediante Stripe u otros proveedores de pago integrados.
      </p>
      <p className="small">
        El Titular <b>no</b> actúa como parte en el contrato de reserva entre el restaurante y el cliente final. El
        restaurante es responsable de su política de reservas, cancelaciones y reembolsos, así como de la información
        que proporciona al cliente final.
      </p>

      <h3>2. Elegibilidad y registro</h3>
      <p className="small">
        El Servicio está dirigido a usuarios profesionales (restaurantes). Para acceder, puede ser necesario registrarse
        y verificar una cuenta. El usuario se compromete a facilitar información veraz y actualizada, y a mantenerla al
        día.
      </p>

      <h3>3. Cuenta, credenciales y seguridad</h3>
      <p className="small">
        Eres responsable de proteger el acceso a tu cuenta y de toda actividad realizada desde la misma. Debes
        notificarnos de inmediato cualquier uso no autorizado o brecha de seguridad a través de <b>TU_EMAIL</b>.
      </p>

      <h3>4. Obligaciones del restaurante</h3>
      <p className="small">El restaurante se compromete a:</p>
      <ul>
        <li className="small">
          Cumplir con la normativa aplicable (incluida normativa fiscal, consumo y protección de datos respecto a sus
          clientes finales).
        </li>
        <li className="small">
          Informar claramente al cliente final sobre condiciones de la reserva, depósito, cancelación y reembolso.
        </li>
        <li className="small">
          Gestionar correctamente reembolsos, disputas o devoluciones (cuando proceda) a través del proveedor de pago.
        </li>
        <li className="small">
          No utilizar el Servicio para actividades ilícitas, fraudulentas o que vulneren derechos de terceros.
        </li>
      </ul>

      <h3>5. Uso permitido y prohibiciones</h3>
      <p className="small">
        Queda prohibido: (i) usar el Servicio con fines ilícitos o fraudulentos, (ii) intentar acceder a sistemas o
        áreas no autorizadas, (iii) interferir con el funcionamiento del Servicio, (iv) introducir malware o realizar
        pruebas de vulnerabilidad sin permiso, (v) suplantar identidades o recopilar datos de terceros sin base legal.
      </p>

      <h3>6. Pagos, facturación y proveedores externos</h3>
      <p className="small">
        El uso del Servicio por parte del restaurante puede estar sujeto a una suscripción. Los importes, periodicidad y
        condiciones específicas se detallan en “Condiciones de suscripción” y/o en la pantalla de pago.
      </p>
      <p className="small">
        El procesamiento de pagos y la gestión de métodos de pago se realiza mediante Stripe (u otro proveedor). El
        usuario acepta también los términos del proveedor correspondiente. El Titular no almacena datos completos de
        tarjetas.
      </p>

      <h3>7. Disponibilidad del servicio</h3>
      <p className="small">
        El Titular procura mantener el Servicio disponible y seguro, pero no garantiza disponibilidad ininterrumpida.
        Puede haber interrupciones por mantenimiento, actualizaciones, incidencias técnicas o causas ajenas al Titular.
      </p>

      <h3>8. Soporte y comunicaciones</h3>
      <p className="small">
        El soporte se presta a través de <b>TU_EMAIL</b> (y/o canales indicados en la página de contacto). Podemos
        enviarte comunicaciones operativas relacionadas con el Servicio (por ejemplo, cambios de seguridad, incidencias
        o avisos de facturación).
      </p>

      <h3>9. Propiedad intelectual</h3>
      <p className="small">
        El Servicio, su software, diseño, marcas, logotipos y contenidos pertenecen al Titular o a sus licenciantes. Se
        concede al usuario una licencia limitada, no exclusiva e intransferible para usar el Servicio durante la
        vigencia de la relación contractual, conforme a estos términos.
      </p>

      <h3>10. Contenidos y datos del usuario</h3>
      <p className="small">
        El restaurante es responsable de la información que introduce (por ejemplo, datos de reservas, textos de
        política y comunicaciones al cliente final). El usuario declara tener derechos y base legal para tratar dichos
        datos. El tratamiento de datos personales se regula en la Política de privacidad.
      </p>

      <h3>11. Suspensión y terminación</h3>
      <p className="small">
        Podemos suspender o limitar el acceso al Servicio si detectamos uso indebido, fraude, incumplimiento de estos
        términos o requerimientos legales. El usuario puede dejar de usar el Servicio en cualquier momento. La
        cancelación de la suscripción se gestiona desde el portal de facturación, según se indica en “Condiciones de
        suscripción”.
      </p>

      <h3>12. Limitación de responsabilidad</h3>
      <p className="small">
        En la medida permitida por la ley, el Titular no será responsable de daños indirectos, lucro cesante o pérdidas
        derivadas de (i) la relación entre restaurante y cliente final, (ii) fallos o decisiones del proveedor de pago,
        (iii) interrupciones del Servicio por causas no imputables al Titular. Nada en estos términos excluye o limita
        responsabilidad cuando la ley lo prohíba.
      </p>

      <h3>13. Modificaciones</h3>
      <p className="small">
        Podemos actualizar estos términos por motivos legales, técnicos u operativos. Si los cambios son materiales, lo
        comunicaremos por medios razonables (por ejemplo, mediante aviso en el panel o email). La continuidad de uso del
        Servicio tras la entrada en vigor de los cambios implica aceptación.
      </p>

      <h3>14. Legislación aplicable y jurisdicción</h3>
      <p className="small">
        Estos términos se rigen por la legislación española. Para cualquier controversia, las partes se someten a los
        juzgados y tribunales competentes conforme a la ley, salvo que una norma imperativa disponga otra cosa.
      </p>

      <div className="spacer" />
      <p className="small">
        <b>Contacto:</b> TU_EMAIL
        <br />
        <b>Última actualización:</b> FECHA (por ejemplo: 10/02/2026)
      </p>
    </main>
  );
}
