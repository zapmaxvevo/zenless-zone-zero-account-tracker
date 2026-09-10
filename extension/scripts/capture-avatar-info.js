// Captura de `avatar/info`: la build completa de cada agente, un request por agente.
// Reproduce la pasada de builds del import y mide cuánto tarda (`elapsed_ms` en el JSON).
// Ver docs/reference/notas/extension.md.
//
// Uso: logueado, en https://act.hoyolab.com/app/zzz-game-record, DevTools → Console,
// pegar entero → Enter. Sin tocar nada trae el roster COMPLETO (~1,4 s por agente).
// Para capturar solo algunos, poner sus ids en IDS.

(async () => {
  // const IDS = [1091, 1311, 1321, 1371, 1431, 1451];
  const IDS = [];

  const BASE = 'https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz';
  const CARD = 'https://sg-act-public-api.hoyolab.com/game_record/card/wapi/getGameRecordCard';
  const ZZZ_GAME_ID = 8;
  const LANGUAGE = 'en-us';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const jitter = () => 300 + Math.floor(Math.random() * 501);
  const headers = {
    'x-rpc-lang': LANGUAGE,
    'x-rpc-language': LANGUAGE,
    'x-rpc-platform': '4',
    'x-rpc-device_id': '',
    'x-rpc-device_fp': '',
  };

  const out = { captured_at: new Date().toISOString(), agents: [], failures: [] };

  async function call(name, url) {
    try {
      const response = await fetch(url, { credentials: 'include', headers });
      const traceId = response.headers.get('x-trace-id');
      const body = await response.json().catch(() => null);
      console.log(
        `[builds] ${name}: retcode=${body?.retcode} message=${JSON.stringify(body?.message ?? '')}` +
          ` x-trace-id=${traceId}`,
      );
      if (body?.retcode !== 0) {
        out.failures.push({ name, retcode: body?.retcode ?? null, message: body?.message ?? '', x_trace_id: traceId });
        return null;
      }
      return body?.data ?? null;
    } catch (error) {
      console.warn(`[builds] ${name}: fallo de red`, error);
      out.failures.push({ name, error: String(error) });
      return null;
    } finally {
      await sleep(jitter());
    }
  }

  const ltuid = (document.cookie.match(/(?:^|; )ltuid_v2=([^;]*)/) || [])[1];
  if (!ltuid) {
    console.error('[builds] no encuentro la cookie ltuid_v2: ¿sesión iniciada en hoyolab.com?');
    return;
  }
  const card = await call('getGameRecordCard', `${CARD}?uid=${encodeURIComponent(ltuid)}`);
  const zzz = (card?.list ?? []).find((game) => Number(game.game_id) === ZZZ_GAME_ID);
  if (!zzz) {
    console.error('[builds] getGameRecordCard no trajo una cuenta de ZZZ.');
    return;
  }
  const roleQs = `role_id=${zzz.game_role_id}&server=${zzz.region}`;

  // El roster manda: pedir un id que la cuenta no tiene sería un fallo confuso.
  const basic = await call('avatar_basic', `${BASE}/avatar/basic?${roleQs}`);
  const roster = new Map(
    (basic?.avatar_list ?? []).map((avatar) => [Number(avatar.id), avatar.name_mi18n]),
  );
  const wanted = IDS.length > 0 ? IDS : [...roster.keys()];
  const missing = wanted.filter((id) => !roster.has(Number(id)));
  if (missing.length > 0) console.warn(`[builds] no están en la cuenta, se saltean: ${missing}`);

  const ids = wanted.filter((id) => roster.has(Number(id)));
  console.log(`[builds] capturando ${ids.length} agentes, uno por request`);

  const started = Date.now();
  for (const id of ids) {
    // `id_list[]` repetido y UN id por request: cualquier otra forma devuelve -400005.
    const data = await call(
      `avatar_info ${id} (${roster.get(Number(id))})`,
      `${BASE}/avatar/info?id_list[]=${id}&need_wiki=false&${roleQs}`,
    );
    if (data) out.agents.push({ id, name: roster.get(Number(id)) ?? null, data });
  }
  // Cuánto tarda de verdad el roster completo.
  out.elapsed_ms = Date.now() - started;
  out.requested = ids;

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `zzz-avatar-info-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(anchor.href);
  console.log(
    `[builds] listo: ${out.agents.length}/${ids.length} agentes en ${Math.round(out.elapsed_ms / 1000)} s` +
      (out.failures.length ? `, ${out.failures.length} fallos` : ''),
  );
})();
