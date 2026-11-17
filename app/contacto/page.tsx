export default function ContactoPage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Contacto</h1>

      <p className="small">
        Para soporte, incidencias técnicas o consultas legales/comerciales relacionadas con la plataforma, puedes
        contactarnos por email:
      </p>

      <p>
        {/* Placeholder address: this is a portfolio project, not a live service */}
        <b>Email:</b> <a href="mailto:chalo2@chalodev.com">chalo2@chalodev.com</a>
      </p>

      <h3>Qué incluir en tu mensaje</h3>
      <ul>
        <li>Nombre del restaurante y email de acceso.</li>
        <li>Descripción breve del problema o consulta.</li>
        <li>Si es un error, captura de pantalla y hora aproximada.</li>
        <li>En caso de pagos, el ID del enlace o de la reserva (si lo tienes).</li>
      </ul>

      <p className="small">
        Horario de atención (orientativo): <b>L–V 9:00–18:00</b> (Europa/Madrid).
      </p>

      <p className="small">
        Si se trata de una solicitud relacionada con tus datos personales (RGPD), indícalo en el asunto con “Protección
        de datos” para gestionarlo con prioridad.
      </p>
    </main>
  );
}
