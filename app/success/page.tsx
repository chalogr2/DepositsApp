"use client";
import { useEffect, useState } from "react";

export default function SuccessPage({ searchParams }: { searchParams?: { rid?: string; sid?: string } }) {
  const rid = searchParams?.rid;
  const sid = searchParams?.sid;
  const [msg, setMsg] = useState("Verificando el pago…");

  useEffect(() => {
    async function run() {
      if (!rid || !sid) return setMsg("Falta el id de la reserva o de la sesión.");
      const res = await fetch(`/api/guest/verify?rid=${encodeURIComponent(rid)}&sid=${encodeURIComponent(sid)}`);
      const data = await res.json();
      if (!res.ok) return setMsg(data?.error ?? "No se pudo verificar el pago");
      setMsg("Pago confirmado ✅");
    }
    run();
  }, [rid, sid]);

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Resultado del pago</h1>
      <p className="small">{msg}</p>
      {rid ? <p className="small">Reserva: <code>{rid}</code></p> : null}
      <p className="small"><a href="/">Volver al inicio</a></p>
    </main>
  );
}
