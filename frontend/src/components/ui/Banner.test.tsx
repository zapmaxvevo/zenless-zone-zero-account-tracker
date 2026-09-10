import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Banner from './Banner';

describe('el aviso de una pantalla', () => {
  it('lleva su título y su explicación', () => {
    const html = renderToStaticMarkup(
      <Banner title="Sincronización en pausa">Enka nos está limitando</Banner>,
    );

    expect(html).toContain('Sincronización en pausa');
    expect(html).toContain('Enka nos está limitando');
  });

  it('un aviso que no es un error se pinta de acento, no de rojo', () => {
    const warn = renderToStaticMarkup(
      <Banner title="En pausa" tone="warn">
        Más tarde
      </Banner>,
    );

    expect(warn).toContain('var(--accent)');
    expect(warn).not.toContain('var(--red)');
  });

  it('solo se puede cerrar si hay a quién avisarle', () => {
    const withClose = renderToStaticMarkup(
      <Banner title="Aviso" onDismiss={() => {}}>
        Texto
      </Banner>,
    );
    const without = renderToStaticMarkup(<Banner title="Aviso">Texto</Banner>);

    expect(withClose).toContain('Cerrar');
    expect(without).not.toContain('Cerrar');
  });
});
