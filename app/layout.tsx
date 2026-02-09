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
          {children}
          <footer className="small" style={{ marginTop: 26, opacity: 0.9 }}>
            MVP v3: Auth + BD en Supabase, suscripción (Stripe Billing), y cobros del restaurante (Stripe Connect).
          </footer>
        </div>
      </body>
    </html>
  );
}
