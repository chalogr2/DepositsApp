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
              <a href="/vendor">
                <button className="primary" type="button">Entrar al portal</button>
              </a>
              <a href="/vendor" className="small">
                <button className="secondary" type="button">Crear cuenta / Acceder</button>
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

      {/* Footer */}
      <footer className="footer">
        <div className="footerInner">
          <div className="footerBrand">© {new Date().getFullYear()} Deposits App</div>

          <nav className="footerLinks" aria-label="Enlaces legales">
            <a href="/legal/terminos">Términos</a>
            <a href="/legal/privacidad">Privacidad</a>
            <a href="/legal/cookies">Cookies</a>
            <a href="/legal/aviso-legal">Aviso legal</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
