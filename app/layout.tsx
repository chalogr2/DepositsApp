import Footer from "./_components/Footer";
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
          <Footer />
        </div>
      </body>
    </html>
  );
}
