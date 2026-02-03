"use client";
import { useEffect, useState } from "react";

export default function SuccessPage({ searchParams }: { searchParams?: { rid?: string; sid?: string } }) {
  const rid = searchParams?.rid;
  const sid = searchParams?.sid;
  const [msg, setMsg] = useState("Verifying payment…");

  useEffect(() => {
    async function run() {
      if (!rid || !sid) return setMsg("Missing reservation/session id.");
      const res = await fetch(`/api/guest/verify?rid=${encodeURIComponent(rid)}&sid=${encodeURIComponent(sid)}`);
      const data = await res.json();
      if (!res.ok) return setMsg(data?.error ?? "Verification failed");
      setMsg("Payment confirmed ✅");
    }
    run();
  }, [rid, sid]);

  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Payment result</h1>
      <p className="small">{msg}</p>
      {rid ? <p className="small">Reservation: <code>{rid}</code></p> : null}
      <p className="small"><a href="/">Back to home</a></p>
    </main>
  );
}
