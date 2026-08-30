import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="panel">
      <h2 className="ne-display ne-display-md">No hay nada acá</h2>
      <p className="ne-prose">
        La dirección no corresponde a ninguna pantalla. <Link to="/">Volver al inicio</Link>.
      </p>
    </section>
  );
}
