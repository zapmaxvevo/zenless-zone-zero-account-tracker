import type { TeamRead, TeamWrite } from '../api/types';

export const TEAM_SLOTS = [1, 2, 3];
export const MAX_TEAM_NAME = 64;

/** Un equipo en edición: tres slots por posición, `null` en los vacíos. */
export interface TeamDraft {
  name: string;
  notes: string;
  members: (number | null)[];
}

export function emptyTeamDraft(): TeamDraft {
  return { name: '', notes: '', members: [null, null, null] };
}

export function draftFromTeam(team: TeamRead): TeamDraft {
  const members = TEAM_SLOTS.map(
    (slot) => team.members.find((member) => member.slot === slot)?.agent.id ?? null,
  );
  return { name: team.name, notes: team.notes, members };
}

/**
 * Lo que el backend rechazaría, dicho antes de mandarlo.
 *
 * Los slots no pueden repetirse porque cada posición es una celda del array, pero el
 * mismo agente sí puede caer en dos, y eso es un 422.
 */
export function teamErrors(draft: TeamDraft): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();

  if (!name) errors.push('Poné un nombre al equipo.');
  if (name.length > MAX_TEAM_NAME) {
    errors.push(`El nombre no puede pasar de ${MAX_TEAM_NAME} caracteres.`);
  }

  const chosen = draft.members.filter((id): id is number => id !== null);
  if (chosen.length === 0) errors.push('Elegí al menos un agente.');
  if (new Set(chosen).size !== chosen.length) {
    errors.push('Hay un agente repetido: cada uno puede ocupar un solo slot.');
  }

  return errors;
}

/** El payload del equipo: los slots vacíos no viajan. */
export function toTeamWrite(draft: TeamDraft): TeamWrite {
  return {
    name: draft.name.trim(),
    notes: draft.notes.trim(),
    members: draft.members.flatMap((agentId, index) =>
      agentId === null ? [] : [{ slot: index + 1, agent_id: agentId }],
    ),
  };
}
