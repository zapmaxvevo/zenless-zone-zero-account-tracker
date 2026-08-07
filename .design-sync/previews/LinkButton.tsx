import { LinkButton } from 'zzz-ui';

export function Variantes() {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <LinkButton href="#" variant="accent">
        Agregar agente
      </LinkButton>
      <LinkButton href="#">Ver equipos</LinkButton>
      <LinkButton href="#" variant="danger">
        Desvincular cuenta
      </LinkButton>
    </div>
  );
}

export function Tamanos() {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <LinkButton href="#" variant="accent">
        Editar build
      </LinkButton>
      <LinkButton href="#" size="sm">
        Volver al roster
      </LinkButton>
    </div>
  );
}
