import type { SubKey } from '../lib/score';
import { keySubs } from '../lib/score';

const SUB_NAMES: Record<SubKey, string> = {
  crit: 'Prob. CRIT',
  critdmg: 'DAÑO CRIT',
  atkp: 'ATQ%',
  atk: 'ATQ',
  pen: 'PEN',
  ap: 'Dominio de anomalía',
  hpp: 'PV%',
  hp: 'PV',
  defp: 'DEF%',
  def: 'DEF',
};

interface KeySubsLegendProps {
  profession: string | null;
  label: string | null;
}

export default function KeySubsLegend({ profession, label }: KeySubsLegendProps) {
  const names = keySubs(profession)
    .map((key) => SUB_NAMES[key])
    .join(', ');

  return (
    <div className="ne-build-key">
      <span className="ne-build-key-swatch" aria-hidden="true" />
      <span className="ne-label ne-label-sm">
        Subestadísticas que suman al score de {label ?? 'la especialidad'}: {names}
      </span>
    </div>
  );
}
