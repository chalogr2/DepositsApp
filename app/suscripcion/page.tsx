export default function SuscripcionPage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Condiciones de suscripción</h1>

      <p className="small">
        Estas condiciones regulan la suscripción al Servicio por parte de restaurantes (usuarios profesionales). Al
        contratar una suscripción, aceptas también los{" "}
        <a href="/terminos">Términos y condiciones</a> y el resto de documentos legales aplicables.
      </p>

      <h3>1. Plan, precio e impuestos</h3>
      <p className="small">
        La suscripción habilita el acceso al panel del restaurante y a la creación/gestión de enlaces de depósito. El
        precio, periodicidad (mensual/anual) y las condiciones exactas se muestran durante el proceso de alta en la
        pantalla de pago.
      </p>
      <p className="small">
        Los importes pueden incluir impuestos indirectos aplicables (por ejemplo, IVA) o mostrarse sin impuestos según
        tu configuración. Si procede, se aplicarán conforme a la normativa fiscal vigente.
      </p>

      <h3>2. Inicio de la suscripción y acceso</h3>
      <p className="small">
        La suscripción se considera activa una vez confirmado el pago por el proveedor de pago. Desde ese momento,
        podrás utilizar las funcionalidades incluidas en el plan durante el periodo contratado.
      </p>

      <h3>3. Renovación automática</h3>
      <p className="small">
        Salvo que se indique lo contrario, la suscripción se renueva automáticamente al final de cada periodo de
        facturación, cargándose el importe correspondiente al método de pago registrado.
      </p>

      <h3>4. Cancelación</h3>
      <p className="small">
        Puedes cancelar la renovación en cualquier momento desde el Portal de facturación (Stripe). La cancelación
        detiene cargos futuros. Tras cancelar, normalmente conservarás el acceso hasta el final del periodo ya pagado,
        salvo que se produzca una suspensión por impago, fraude o uso indebido.
      </p>

      <h3>5. Política de no reembolso</h3>
      <p className="small">
        Salvo obligación legal aplicable, los pagos de suscripción no son reembolsables. Si cancelas, no se realizarán
        devoluciones por el tiempo no consumido del periodo ya abonado; la cancelación solo evita cargos futuros.
      </p>

      <h3>6. Cambios de precio o del plan</h3>
      <p className="small">
        Podemos actualizar el precio, características del plan o condiciones por motivos operativos, legales o de
        mercado. Si el cambio afecta a tu suscripción (por ejemplo, un aumento de precio), te lo comunicaremos por
        medios razonables antes de que entre en vigor. Si no estás de acuerdo, podrás cancelar la renovación antes del
        siguiente cargo.
      </p>

      <h3>7. Impagos, incidencias de cobro y suspensión</h3>
      <p className="small">
        Si el proveedor de pago rechaza el cargo o hay incidencias (por ejemplo, tarjeta caducada), el estado de la
        suscripción puede pasar a “impago” y el acceso a funciones del Servicio puede limitarse o suspenderse hasta que
        se regularice el pago. Algunas funcionalidades pueden quedar deshabilitadas mientras exista deuda o incidencia.
      </p>

      <h3>8. Facturación, recibos y método de pago</h3>
      <p className="small">
        La facturación y los métodos de pago se gestionan a través del Portal de facturación (Stripe). Desde allí
        podrás actualizar el método de pago, descargar recibos y consultar el histórico de facturas/cargos si estuviera
        disponible según la configuración del proveedor.
      </p>

      <h3>9. Proveedor de pago</h3>
      <p className="small">
        El procesamiento de pagos se realiza mediante Stripe (u otro proveedor). Al contratar, aceptas también los
        términos del proveedor correspondiente. El Titular no almacena datos completos de tarjeta; estos se gestionan
        directamente por el proveedor de pago.
      </p>

      <div className="spacer" />
      <p className="small">
        <b>Soporte de suscripción:</b> TU_EMAIL
        <br />
        <b>Última actualización:</b> FECHA (por ejemplo: 10/02/2026)
      </p>
    </main>
  );
}
