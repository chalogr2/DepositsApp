export default function PrivacidadPage() {
  return (
    <main className="card">
      <h1 style={{ marginTop: 0 }}>Política de privacidad</h1>

      <p className="small">
        Esta política describe cómo tratamos los datos personales en el marco del servicio.
      </p>

      <h3>1. Responsable del tratamiento</h3>
      <ul>
        <li><b>Responsable:</b> TU_EMPRESA</li>
        <li><b>NIF/CIF:</b> TU_NIF</li>
        <li><b>Email:</b> TU_EMAIL</li>
      </ul>

      <h3>2. Datos tratados</h3>
      <ul>
        <li>Datos de cuenta: email, identificadores de usuario.</li>
        <li>Datos del restaurante: nombre, configuración, reservas creadas.</li>
        <li>Datos de facturación/pagos: se gestionan a través de Stripe (no almacenamos números de tarjeta).</li>
        <li>Datos técnicos mínimos necesarios para autenticación y seguridad.</li>
      </ul>

      <h3>3. Finalidades</h3>
      <ul>
        <li>Prestar el servicio (registro, acceso, creación/gestión de reservas, panel).</li>
        <li>Gestión de suscripciones y facturación.</li>
        <li>Soporte y comunicaciones operativas.</li>
        <li>Seguridad, prevención de fraude y cumplimiento.</li>
      </ul>

      <h3>4. Base jurídica</h3>
      <ul>
        <li>Ejecución de un contrato (prestación del servicio).</li>
        <li>Cumplimiento de obligaciones legales (fiscales/contables si aplica).</li>
        <li>Interés legítimo (seguridad, mejora del servicio) cuando corresponda.</li>
      </ul>

      <h3>5. Destinatarios y encargados</h3>
      <p className="small">
        Usamos proveedores para operar el servicio:
      </p>
      <ul>
        <li><b>Stripe</b>: gestión de pagos y facturación.</li>
        <li><b>Supabase</b>: autenticación y base de datos.</li>
        <li><b>Vercel</b>: hosting y ejecución del sitio.</li>
      </ul>

      <h3>6. Transferencias internacionales</h3>
      <p className="small">
        Algunos proveedores pueden tratar datos fuera del EEE. En su caso, se aplicarán garantías adecuadas
        (p. ej., cláusulas contractuales tipo) según corresponda.
      </p>

      <h3>7. Plazos de conservación</h3>
      <p className="small">
        Conservamos los datos mientras exista la cuenta o sea necesario para prestar el servicio y cumplir obligaciones
        legales. Posteriormente, se bloquearán o eliminarán conforme a la normativa.
      </p>

      <h3>8. Derechos</h3>
      <p className="small">
        Puedes solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a TU_EMAIL.
        También puedes reclamar ante la autoridad de control competente (AEPD en España).
      </p>

      <h3>9. Seguridad</h3>
      <p className="small">
        Aplicamos medidas técnicas y organizativas razonables para proteger los datos. Aun así, ningún sistema es 100%
        infalible.
      </p>
    </main>
  );
}
