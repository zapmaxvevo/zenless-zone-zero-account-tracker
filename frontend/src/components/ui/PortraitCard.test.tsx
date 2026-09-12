import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PortraitCard from './PortraitCard';

function render(overrides: Partial<React.ComponentProps<typeof PortraitCard>> = {}): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PortraitCard
        to="/account/1300000000/agents/1"
        name="Ellen Joe"
        art="/ellen.png"
        fallback={1091}
        rank="S"
        rankColor="var(--rank-s)"
        elementColor="var(--element-ice)"
        meta="Nv. 60 · M2"
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe('la card de retrato de un agente', () => {
  it('lleva al detalle del agente y lo nombra', () => {
    const html = render();

    expect(html).toContain('href="/account/1300000000/agents/1"');
    expect(html).toContain('Ellen Joe');
    expect(html).toContain('Nv. 60 · M2');
  });

  it('la letra de rango va teñida de su color y no la lee un lector de pantalla', () => {
    const html = render();

    expect(html).toContain('var(--rank-s)');
    expect(html).toContain('>S</span>');
  });

  it('sin arte del agente cae al identificador, no a un hueco', () => {
    const html = render({ art: null });

    expect(html).toContain('1091');
    expect(html).not.toContain('<img');
  });

  it('el score solo aparece si hay score', () => {
    expect(render({ score: 95 })).toContain('>95</span>');
    expect(render()).not.toContain('Build');
  });

  it('un score de cero se muestra igual: es un dato, no un vacío', () => {
    expect(render({ score: 0 })).toContain('>0</span>');
  });

  it('la nota al pie dice qué W-Engine lleva', () => {
    expect(render({ footNote: 'Sin W-Engine' })).toContain('Sin W-Engine');
  });

  it('la banda de color sale del elemento del agente', () => {
    expect(render()).toContain('var(--element-ice)');
  });
});
