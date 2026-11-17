export default function Footer() {
  return (
    <footer className="footer">
      <div className="footerInner">
        <div className="footerCols">
          <div>
            <div className="footerTitle">Depósitos</div>
            <div className="small">
              Enlaces de depósito para reservas. Pagos y facturación gestionados de forma segura.
            </div>
          </div>

          <div>
            <div className="footerTitle">Legal</div>
            <ul className="footerList">
              <li><a href="/aviso-legal">Aviso legal</a></li>
              <li><a href="/privacidad">Política de privacidad</a></li>
              <li><a href="/cookies">Política de cookies</a></li>
              <li><a href="/terminos">Términos y condiciones</a></li>
              <li><a href="/suscripcion">Condiciones de suscripción</a></li>
            </ul>
          </div>

          <div>
            <div className="footerTitle">Soporte</div>
            <ul className="footerList">
              <li><a href="/contacto">Contacto</a></li>
              <li><a href="/vendor">Acceso restaurantes</a></li>
            </ul>
          </div>
        </div>

        <div className="footerBottom small">
          © {new Date().getFullYear()} <span className="muted">Deposit Links</span> Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
