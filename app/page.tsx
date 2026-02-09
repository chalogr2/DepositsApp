export default function HomePage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Enlaces de Depósito — v3</h1>
      <p className="small">
        Los restaurantes se registran, conectan Stripe, se suscriben mensualmente y generan enlaces de pago para depósitos reembolsables.
      </p>
      <div className="row">
        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>Restaurantes</h3>
          <ul className="small">
            <li>Inicio de sesión por email (enlace mágico)</li>
            <li>Suscripción mensual (obligatoria)</li>
            <li>Conectar Stripe (el restaurante es el comercio)</li>
            <li>Crear enlaces de reserva</li>
          </ul>
          <a href="/vendor"><button className="primary">Ir al portal del restaurante</button></a>
        </div>
        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>Admin</h3>
          <ul className="small">
            <li>Ver restaurantes + estados</li>
            <li>Ver reservas recientes</li>
          </ul>
          <a href="/admin"><button>Ir a administración</button></a>
        </div>
      </div>
    </main>
  );
}
