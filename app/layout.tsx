import "./globals.css";
import React from "react";

export const metadata = {
  title: "Deposit Links v3 (Supabase + Stripe)",
  description: "Restaurants self-register, subscribe monthly, connect Stripe, and create deposit links."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="hstack" style={{ justifyContent: "space-between", marginBottom: 18 }}>
            <div className="hstack">
              <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Deposit Links</div>
              <span className="badge"><span className="dot" />v3</span>
            </div>
            <nav className="hstack">
              <a href="/">Home</a>
              <a href="/vendor">Restaurant portal</a>
              <a href="/admin">Admin</a>
            </nav>
          </header>
          {children}
          <footer className="small" style={{ marginTop: 26, opacity: 0.9 }}>
            MVP v3: Supabase Auth + DB, Stripe Billing subscription gating, Stripe Connect vendor payments.
          </footer>
        </div>
      </body>
    </html>
  );
}
