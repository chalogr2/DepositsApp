export default function SuscripcionPage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Condiciones de suscripción</h1>

      <h3>1. Plan y precio</h3>
      <p className="small">
        La suscripción habilita el acceso al panel y a la creación de enlaces. El precio y la periodicidad se muestran
        durante el alta.
      </p>

      <h3>2. Renovación y cancelación</h3>
      <p className="small">
        La suscripción se renueva automáticamente hasta que se cancele. Puedes cancelar la renovación desde el Portal de
        Stripe. Tras la cancelación, conservarás el acceso hasta el final del periodo facturado.
      </p>

      <h3>3. No reembolsable</h3>
      <p className="small">
        Salvo obligación legal aplicable, los pagos de suscripción no son reembolsables. La cancelación evita cargos
        futuros.
      </p>

      <h3>4. Impagos</h3>
      <p className="small">
        En caso de impago o incidencias de cobro, el acceso puede suspenderse hasta la regularización.
      </p>

      <h3>5. Facturación</h3>
      <p className="small">
        La facturación y los métodos de pago se gestionan a través de Stripe. Puedes actualizar el método de pago desde
        el portal correspondiente.
      </p>
    </main>
  );
}
