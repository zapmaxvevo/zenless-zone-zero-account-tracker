import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Hero from './Hero';

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
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

    expect(html).toContain('contenido');
    expect(html).not.toContain('ne-watermark');
  });

  it('las barras diagonales van siempre de a tres, en degradé', () => {
    const html = render(<Hero>contenido</Hero>);

    expect(html.split('ne-beam')).toHaveLength(1 + 3);
    expect(html).toContain('opacity:0.9');
    expect(html).toContain('opacity:0.55');
  });

  it('las barras toman el color que le pase la pantalla', () => {
    expect(render(<Hero beamColor="var(--element-ice)">x</Hero>)).toContain('var(--element-ice)');
  });

  it('un hero chico usa una marca de agua más chica que uno grande', () => {
    const small = render(
      <Hero size="sm" watermark="SHIYU">
        x
      </Hero>,
    );
    const large = render(
      <Hero size="lg" watermark="SHIYU">
        x
      </Hero>,
    );

    expect(small).toContain('font-size:98px');
    expect(large).toContain('font-size:150px');
  });

  it('el arte del agente solo aparece si hay arte', () => {
    expect(render(<Hero art="/ellen.png">x</Hero>)).toContain('src="/ellen.png"');
    expect(render(<Hero>x</Hero>)).not.toContain('<img');
  });
});
