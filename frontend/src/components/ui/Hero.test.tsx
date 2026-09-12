import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Hero from './Hero';

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

/** Lo que queda del hero cuando se le sacan las etiquetas: el texto que alguien lee. */
function text(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

describe('el hero de una pantalla', () => {
  it('reparte el dato de la pantalla en marca de agua detrás del contenido', () => {
    const html = render(<Hero watermark="ELLEN JOE">contenido</Hero>);

    expect(html).toContain('ELLEN JOE');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('contenido');
  });

  it('sin marca de agua no dibuja una vacía', () => {
    const html = render(<Hero>contenido</Hero>);

    expect(text(html)).toBe('contenido');
  });

  it('el color de la pantalla tiñe dos de las tres barras: la tercera es el fondo', () => {
    const html = render(<Hero beamColor="var(--element-ice)">x</Hero>);

    expect(html.split('var(--element-ice)')).toHaveLength(1 + 2);
    expect(html.split('ne-beam-')).toHaveLength(1 + 3);
  });

  it('el tamaño elegido llega al hero, que es donde eridu.css lo viste', () => {
    expect(render(<Hero size="sm">x</Hero>)).toContain('ne-hero-sm');
    expect(render(<Hero>x</Hero>)).toContain('ne-hero-lg');
  });

  it('el arte del agente solo aparece si hay arte', () => {
    expect(render(<Hero art="/ellen.png">x</Hero>)).toContain('src="/ellen.png"');
    expect(render(<Hero>x</Hero>)).not.toContain('<img');
  });
});
