export default function HomePage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Deposit Links — v3</h1>
      <p className="small">
        Restaurants self-register, connect Stripe, subscribe monthly, then generate refundable deposit payment links.
      </p>
      <div className="row">
        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>Restaurants</h3>
          <ul className="small">
            <li>Email login (magic link)</li>
            <li>Subscribe monthly (required)</li>
            <li>Connect Stripe (vendor is merchant)</li>
            <li>Create reservation links</li>
          </ul>
          <a href="/vendor"><button className="primary">Go to restaurant portal</button></a>
        </div>
        <div className="card" style={{ background: "rgba(18,26,40,.6)" }}>
          <h3 style={{ marginTop: 0 }}>Admin</h3>
          <ul className="small">
            <li>View restaurants + statuses</li>
            <li>View recent reservations</li>
          </ul>
          <a href="/admin"><button>Go to admin</button></a>
        </div>
      </div>
    </main>
  );
}
