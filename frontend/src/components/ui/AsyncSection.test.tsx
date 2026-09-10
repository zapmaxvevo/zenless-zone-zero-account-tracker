import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AsyncSection from './AsyncSection';

const EMPTY = 'Todavía no hay nada acá';
const LOADING = 'Cargando los agentes…';

function render(
  state: { loading: boolean; error: string | null; reload?: () => void },
  isEmpty = false,
): string {
  return renderToStaticMarkup(
    <AsyncSection state={state} loading={LOADING} empty={EMPTY} isEmpty={isEmpty} />,
  );
}

describe('los tres estados de una sección que espera al backend', () => {
  it('mientras carga muestra el texto de esa pantalla y nada más', () => {
    const html = render({ loading: true, error: null }, true);

    expect(html).toContain(LOADING);
    expect(html).not.toContain(EMPTY);
  });

  it('con datos en camino que fallaron, el error tapa al estado vacío', () => {
    const html = render({ loading: false, error: 'El backend se cayó' }, true);

    expect(html).toContain('El backend se cayó');
    expect(html).not.toContain(EMPTY);
    expect(html).not.toContain(LOADING);
  });

  it('recién cuando la carga terminó bien se decide que está vacío', () => {
    const html = render({ loading: false, error: null }, true);

    expect(html).toContain(EMPTY);
    expect(html).not.toContain(LOADING);
  });

  it('con datos no dice nada: la pantalla los dibuja', () => {
    expect(render({ loading: false, error: null }, false)).toBe('');
  });
});

describe('el reintento', () => {
  it('un error con recarga ofrece reintentar', () => {
    const reload = vi.fn();

    expect(render({ loading: false, error: 'Se cayó', reload })).toContain('Reintentar');
  });

  it('un error que nadie puede reintentar no ofrece el botón', () => {
    expect(render({ loading: false, error: 'Se cayó' })).not.toContain('Reintentar');
  });
});

describe('una sección que no tiene estado vacío propio', () => {
  it('sin texto de vacío no inventa uno', () => {
    const html = renderToStaticMarkup(
      <AsyncSection state={{ loading: false, error: null }} loading={LOADING} isEmpty />,
    );

    expect(html).toBe('');
  });
});
