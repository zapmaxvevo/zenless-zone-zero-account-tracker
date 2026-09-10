import { describe, expect, it } from 'vitest';
import {
  collectSections,
  fatalFromMain,
  stoppedDuringMain,
  syncSteps,
  type StepOutcome,
} from './sync';
import type { RetcodeKind } from './hoyolab';
import type { SectionId } from './messages';

const role = { roleId: '1500000001', server: 'prod_gf_eu' };

function response(kind: RetcodeKind, data: Record<string, unknown> | null = null) {
  return {
    kind,
    retcode: kind === 'ok' ? 0 : 10041,
    message: '',
    data,
    traceId: null,
    httpStatus: 200,
  };
}

/** Las 8 secciones principales respondiendo OK, cada una con un dato reconocible. */
function allOk(): StepOutcome[] {
  return syncSteps(role).map((spec) => ({
    id: spec.id,
    response: response('ok', { section: spec.id }),
  }));
}

/** La pasada cortada: las secciones hasta `at`, y la de `at` con el kind que cortó. */
function cutAt(at: SectionId, kind: RetcodeKind): StepOutcome[] {
  const outcomes: StepOutcome[] = [];
  for (const spec of syncSteps(role)) {
    if (spec.id === at) {
      outcomes.push({ id: spec.id, response: response(kind) });
      break;
    }
    outcomes.push({ id: spec.id, response: response('ok', { section: spec.id }) });
  }
  return outcomes;
}

describe('syncSteps', () => {
  it('pide las 8 secciones principales, con index primero', () => {
    const steps = syncSteps(role);
    expect(steps.map((step) => step.id)).toEqual([
      'index',
      'avatar_basic',
      'buddy_info',
      'shiyu_defense_1',
      'shiyu_defense_2',
      'deadly_assault_1',
      'deadly_assault_2',
      'lost_void',
    ]);
  });

  it('cada modo con historia se pide en sus dos ciclos: no hay más', () => {
    const urls = new Map(syncSteps(role).map((step) => [step.id, step.url]));
    expect(urls.get('shiyu_defense_1')).toContain('schedule_type=1');
    expect(urls.get('shiyu_defense_2')).toContain('schedule_type=2');
    expect(urls.get('deadly_assault_1')).toContain('schedule_type=1');
    expect(urls.get('deadly_assault_2')).toContain('schedule_type=2');
  });
});

describe('collectSections', () => {
  it('con todo OK arma el paquete completo', () => {
    const sections = collectSections({
      recordCard: { game_role_id: '1500000001' },
      outcomes: allOk(),
    });
    expect(Object.keys(sections).sort()).toEqual([
      'avatar_basic',
      'buddy_info',
      'deadly_assault',
      'index',
      'lost_void',
      'record_card',
      'shiyu_defense',
    ]);
    expect(sections.shiyu_defense).toEqual({
      '1': { section: 'shiyu_defense_1' },
      '2': { section: 'shiyu_defense_2' },
    });
  });

  it('una sección que falló viaja como null; una que el corte no llegó a pedir no aparece', () => {
    const outcomes = cutAt('buddy_info', 'hard_limit');
    const sections = collectSections({ recordCard: null, outcomes });

    expect(sections.index).toEqual({ section: 'index' });
    expect(sections.buddy_info).toBeNull();
    // El corte frenó antes de los modos: no son "sin datos", son "no preguntados".
    expect('shiyu_defense' in sections).toBe(false);
    expect('deadly_assault' in sections).toBe(false);
    expect('lost_void' in sections).toBe(false);
  });

  it('un solo ciclo del modo viaja solo, sin inventar el otro en null', () => {
    const outcomes = cutAt('shiyu_defense_2', 'rate_limited');
    const sections = collectSections({ recordCard: null, outcomes });
    expect(sections.shiyu_defense).toEqual({ '1': { section: 'shiyu_defense_1' }, '2': null });
    expect('deadly_assault' in sections).toBe(false);
  });

  it('sin cuenta de ZZZ en la card el paquete va sin record_card', () => {
    const sections = collectSections({ recordCard: null, outcomes: allOk() });
    expect('record_card' in sections).toBe(false);
    expect(sections.index).toEqual({ section: 'index' });
  });
});

describe('el corte de la pasada principal', () => {
  it('un corte deja las builds sin intentar: dependen del roster y son 36 requests', () => {
    for (const kind of ['invalid_session', 'hard_limit', 'rate_limited', 'captcha'] as const) {
      expect(stoppedDuringMain(cutAt('avatar_basic', kind))).toBe(true);
    }
  });

  it('un fallo que no corta deja seguir hasta las builds', () => {
    // `not_public` y `bad_params` son fallos de una sección, no del import.
    expect(stoppedDuringMain(cutAt('lost_void', 'not_public'))).toBe(false);
    expect(stoppedDuringMain(cutAt('lost_void', 'bad_params'))).toBe(false);
    expect(stoppedDuringMain(allOk())).toBe(false);
  });

  it('sin una sola respuesta tampoco se piden builds a ciegas', () => {
    expect(stoppedDuringMain([])).toBe(false);
  });
});

describe('fatalFromMain', () => {
  it('la sesión vencida y el límite duro cancelan el import entero', () => {
    expect(fatalFromMain(cutAt('index', 'invalid_session'))?.kind).toBe('invalid_session');
    const fatal = fatalFromMain(cutAt('buddy_info', 'hard_limit'));
    expect(fatal?.kind).toBe('hard_limit');
    expect(fatal?.message).toContain('Se canceló el import entero');
  });

  it('un rate limit o un captcha cortan la pasada pero no tiran lo ya traído', () => {
    // Cortan (stoppedDuringMain) y viajan como warning, pero el paquete se sube igual.
    expect(fatalFromMain(cutAt('shiyu_defense_1', 'rate_limited'))).toBeNull();
    expect(fatalFromMain(cutAt('shiyu_defense_1', 'captcha'))).toBeNull();
    expect(stoppedDuringMain(cutAt('shiyu_defense_1', 'rate_limited'))).toBe(true);
  });

  it('con todo OK, o sin ninguna respuesta, no hay fatal', () => {
    expect(fatalFromMain(allOk())).toBeNull();
    expect(fatalFromMain([])).toBeNull();
  });
});
