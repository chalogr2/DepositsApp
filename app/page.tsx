export default function HomePage() {
  return (
    <div className="container">
      <main className="card hero">
        <div className="heroGrid">
          <div>
            <h1 className="heroTitle">Depósitos para reservas, sin complicaciones</h1>

            <p className="heroSub">
              Crea enlaces de pago por reserva en segundos, cobra depósitos con Stripe y gestiona todo desde
              un panel simple. Ideal para restaurantes en España.
            </p>

            <div className="pills" aria-label="Características">
              <span className="pill">✅ Pagos con Stripe</span>
              <span className="pill">✅ Enlace por reserva</span>
              <span className="pill">✅ Panel de control</span>
            </div>

            <div className="ctaRow">
              <a className="btn primary" href="/vendor">
                Entrar al portal
              </a>
              <a className="btn secondary" href="/vendor">
                Crear cuenta / Acceder
              </a>
            </div>

            <div className="section small">
              *Los depósitos ayudan a reducir no-shows. El restaurante gestiona sus cobros en Stripe.
            </div>
          </div>

          <div className="screenshotShell" aria-label="Vista previa del panel">
            <img
              className="screenshot"
              src="/landing-demo.png"
              alt="Ejemplo del panel del restaurante"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
