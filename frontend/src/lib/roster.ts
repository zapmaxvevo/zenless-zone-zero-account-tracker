import type { AgentRead } from '../api/types';
import { elementLabel, nameOr, professionLabel } from './labels';
import { rosterScore } from './score';

export type RosterOrder = 'score' | 'level' | 'name';

export interface RosterFilter {
  search: string;
  element: string;
  profession: string;
  order: RosterOrder;
}

export interface RosterOption {
  value: string;
  label: string;
}

export function emptyRosterFilter(): RosterFilter {
  return { search: '', element: '', profession: '', order: 'score' };
}

export function agentName(agent: AgentRead): string {
  return nameOr(agent.name, 'Agente', agent.game_id);
}

export function elementOptions(agents: readonly AgentRead[]): RosterOption[] {
  return options(
    agents.flatMap((agent) => agent.elements),
    elementLabel,
  );
}

export function professionOptions(agents: readonly AgentRead[]): RosterOption[] {
  return options(
    agents.map((agent) => agent.profession),
    (value) => professionLabel(value) ?? value,
  );
}

export function visibleAgents(agents: readonly AgentRead[], filter: RosterFilter): AgentRead[] {
  const query = filter.search.trim().toLowerCase();
  const matching = agents.filter((agent) => {
    if (filter.element && !agent.elements.includes(filter.element)) return false;
    if (filter.profession && agent.profession !== filter.profession) return false;
    return !query || agentName(agent).toLowerCase().includes(query);
  });

  return [...matching].sort((a, b) => {
    if (filter.order === 'level') {
      return b.level - a.level || agentName(a).localeCompare(agentName(b));
    }
    if (filter.order === 'name') return agentName(a).localeCompare(agentName(b));
    return rosterScore(b) - rosterScore(a) || agentName(a).localeCompare(agentName(b));
  });
}

function options(
  values: readonly (string | null)[],
  label: (value: string) => string,
): RosterOption[] {
  const present = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return present
    .map((value) => ({ value, label: label(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
