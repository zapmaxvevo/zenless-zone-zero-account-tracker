import type { AgentSource } from '../api/types';
import { sourceLabel } from '../lib/labels';
import { sourceColor } from '../lib/palette';

interface SourceTagProps {
  source: AgentSource;
}

/**
 * De dónde salió el agente, cuando no es de donde se supone.
 *
 * `enka` es el import por defecto y no se marca: marcarlo sería etiquetar a todo el roster.
 * Los otros dos sí, porque cambian lo que significa el dato. Un agente `manual` quedó
 * congelado contra Enka. Uno `hoyolab` no es un agente con menos dato, es un agente de otra
 * fuente: el Chronicle lee la cuenta entera desde la sesión del propio usuario, mientras que
 * Enka lee el escaparate público, así que la marca dice sobre todo que ese agente **no está
 * en el showcase**. De dato trae más, no menos: el stat principal de cada disco, que Enka
 * nunca manda. Lo único que Enka tiene de más son tres campos que no se muestran en
 * pantalla (`item_uid`, `weapon_effect_state` y `obtained_at`).
 */
export default function SourceTag({ source }: SourceTagProps) {
  if (source === 'enka') return null;

  return (
    <span className="tag ne-tag-tint" style={{ ['--tint' as string]: sourceColor(source) }}>
      {sourceLabel(source)}
    </span>
  );
}
