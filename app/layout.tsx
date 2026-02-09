import "./globals.css";
import React from "react";

export const metadata = {
  title: "Enlaces de Depósito v3 (Supabase + Stripe)",
  description: "Los restaurantes se registran, se suscriben mensualmente, conectan Stripe y crean enlaces de depósito."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="container">
          <header className="hstack" style={{ justifyContent: "space-between", marginBottom: 18 }}>
            <div className="hstack">
              <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Enlaces de Depósito</div>
              <span className="badge"><span className="dot" />v3</span>
            </div>
            <nav className="hstack">
              <a href="/">Inicio</a>
              <a href="/vendor">Portal del restaurante</a>
              <a href="/admin">Admin</a>
            </nav>
          </header>
          {children}
          <footer className="small" style={{ marginTop: 26, opacity: 0.9 }}>
            MVP v3: Auth + BD en Supabase, suscripción (Stripe Billing), y cobros del restaurante (Stripe Connect).
          </footer>
        </div>
      </body>
    </html>
  );
}
