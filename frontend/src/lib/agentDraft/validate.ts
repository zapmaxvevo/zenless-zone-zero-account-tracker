import { parseId } from './parse';
import type { AgentDraft } from './types';
import { LIMITS } from './types';

interface DraftErrorOptions {
  requireGameId?: boolean;
}

export function agentDraftErrors(draft: AgentDraft, options: DraftErrorOptions = {}): string[] {
  const errors: string[] = [];

  if (options.requireGameId && !parseId(draft.game_id)) errors.push('Elegí un agente.');
  checkRange(errors, 'El nivel', draft.level, LIMITS.level);
  checkRange(errors, 'La ascensión', draft.promotion_level, LIMITS.promotion_level);
  checkRange(errors, 'El mindscape', draft.mindscape_level, LIMITS.mindscape_level);
  checkRange(
    errors,
    'La habilidad central',
    draft.core_skill_enhancement,
    LIMITS.core_skill_enhancement,
  );

  for (const [key, value] of Object.entries(draft.skill_levels)) {
    if (value.trim() === '') continue;
    checkRange(errors, `La habilidad ${key}`, value, LIMITS.skillLevel);
  }

  if (draft.wengine) {
    if (!parseId(draft.wengine.game_id)) errors.push('Elegí un W-Engine o sacalo del formulario.');
    checkRange(errors, 'El nivel del W-Engine', draft.wengine.level, LIMITS.wengineLevel);
    checkRange(
      errors,
      'La modificación',
      draft.wengine.modification_level,
      LIMITS.modification_level,
    );
    checkRange(errors, 'La fase', draft.wengine.phase, LIMITS.phase);
  }

  for (const disc of draft.discs) {
    if (!disc.equipped) continue;
    const label = `El disco ${disc.slot}`;

    if (!parseId(disc.set_id) && !parseId(disc.known_game_id)) {
      errors.push(`${label}: elegí un set.`);
    }
    checkRange(errors, `${label}: el nivel`, disc.level, LIMITS.discLevel);
    checkRange(errors, `${label}: los rolls`, disc.roll_count, LIMITS.discProcs);
    if (disc.main_stat_id && parseInt(disc.main_stat_value, 10) < 0) {
      errors.push(`${label}: el valor del stat principal no puede ser negativo.`);
    }

    for (const substat of disc.substats) {
      if (!parseId(substat.prop_id)) errors.push(`${label}: hay un substat sin elegir.`);
      checkRange(errors, `${label}: los rolls de un substat`, substat.rolls, LIMITS.substatRolls);
    }

    const props = disc.substats.map((substat) => substat.prop_id).filter(Boolean);
    if (new Set(props).size !== props.length) {
      errors.push(`${label}: hay un substat repetido.`);
    }
  }

  return errors;
}

function checkRange(
  errors: string[],
  label: string,
  text: string,
  [min, max]: readonly [number, number],
): void {
  const value = parseInt(text, 10);
  if (Number.isNaN(value) || value < min || value > max) {
    errors.push(`${label} va de ${min} a ${max}.`);
  }
}
