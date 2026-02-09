import Image from "next/image";

export default function HomePage() {
  return (
    <main className="landing">
      <section className="hero">
        <div className="heroGrid">
          <div>
            <h1 className="heroTitle">Depósitos para reservas en segundos</h1>
            <p className="heroSubtitle">
              Crea enlaces de pago para depósitos, reduce no-shows y gestiona todo desde un panel simple.
            </p>

            <div className="heroCtas">
              <a href="/vendor">
                <button className="primary">Acceder (restaurantes)</button>
              </a>
              <a href="/contacto">
                <button>Contactar</button>
              </a>
            </div>

            <div className="heroBullets small">
              <div>✅ Pagos con Stripe</div>
              <div>✅ Enlace por reserva</div>
              <div>✅ Panel de control</div>
            </div>
          </div>

          <div className="shotWrap">
            <div className="shotFade" />
            <Image
              src="/landing/dashboard.png"
              alt="Ejemplo de panel"
              width={1200}
              height={800}
              className="shotImg"
              priority
            />
          </div>
        </div>
      </section>

      <section className="card" style={{ background: "rgba(18,26,40,.6)" }}>
        <h2 style={{ marginTop: 0 }}>Cómo funciona</h2>
        <div className="row">
          <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
            <h3 style={{ marginTop: 0 }}>1) Suscripción</h3>
            <p className="small">Activa tu cuenta para crear enlaces de depósito.</p>
          </div>
          <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
            <h3 style={{ marginTop: 0 }}>2) Conecta Stripe</h3>
            <p className="small">Recibe pagos con tarjeta y gestiona reembolsos desde Stripe.</p>
          </div>
        </div>
        <div className="spacer" />
        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>3) Crea enlaces por reserva</h3>
          <p className="small">
            Envía un enlace al cliente. Cuando paga, la reserva queda marcada como pagada.
          </p>
        </div>
      </section>

      <section className="spacer" />
      <section className="card" style={{ background: "rgba(18,26,40,.6)" }}>
        <h2 style={{ marginTop: 0 }}>Transparente y simple</h2>
        <p className="small">
          Cancelación desde el portal de Stripe, cambio de método de pago, e historial de reservas.
        </p>
        <a href="/vendor">
          <button className="primary">Empezar</button>
        </a>
      </section>
    </main>
  );
}
