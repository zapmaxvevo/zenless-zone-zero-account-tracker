// Fase 0 (continuación) — sonda de `avatar/info`.
//
// Por qué existe: la captura del 2026-08-30 trajo retcode 0 en TODOS los endpoints menos
// `avatar/info`, que devolvió -400005 "Parameter Error" con `id_list[0]=<id>&need_wiki=false`.
// Los ids eran correctos (salen de avatar/basic), así que lo que está mal es la forma de los
// parámetros. Esta sonda prueba las variantes de a una, con jitter, y en cuanto una responde
// retcode 0 sigue con el batch: resuelve la incógnita 1 del plan (¿id_list acepta N ids?)
// en la misma corrida.
//
// Uso: igual que capture.js — logueado, en https://act.hoyolab.com/app/zzz-game-record,
// DevTools → Console → pegar entero → Enter. Descarga un JSON al terminar.

(async () => {
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

  const out = { captured_at: new Date().toISOString(), attempts: [] };

  async function call(name, url, { keepData = false } = {}) {
    let body = null;
    let status = 0;
    let traceId = null;
    try {
      const response = await fetch(url, { credentials: 'include', headers });
      status = response.status;
      traceId = response.headers.get('x-trace-id');
      try {
        body = await response.json();
      } catch {
        // cuerpo no JSON
      }
    } catch (error) {
      console.warn(`[probe] ${name}: fallo de red`, error);
      out.attempts.push({ name, url, error: String(error) });
      await sleep(jitter());
      return null;
    }
    const retcode = body?.retcode ?? null;
    const list = body?.data?.avatar_list;
    const count = Array.isArray(list) ? list.length : null;
    console.log(
      `[probe] ${name}: retcode=${retcode} message=${JSON.stringify(body?.message ?? '')}` +
        (count === null ? '' : ` avatar_list=${count}`),
    );
    out.attempts.push({
      name,
      url,
      http_status: status,
      x_trace_id: traceId,
      retcode,
      message: body?.message ?? '',
      avatar_list_count: count,
      // El data solo se guarda del ganador: es lo que hace falta para el mapper, y así el
      // JSON no pesa 40 MB si varias variantes funcionan.
      data: keepData ? (body?.data ?? null) : undefined,
    });
    await sleep(jitter());
    return retcode === 0 ? body?.data ?? null : null;
  }

  const ltuid = (document.cookie.match(/(?:^|; )ltuid_v2=([^;]*)/) || [])[1];
  if (!ltuid) {
    console.error('[probe] no encuentro la cookie ltuid_v2: ¿sesión iniciada en hoyolab.com?');
    return;
  }
  const card = await call('getGameRecordCard', `${CARD}?uid=${encodeURIComponent(ltuid)}`);
  const zzz = (card?.list ?? []).find((game) => Number(game.game_id) === ZZZ_GAME_ID);
  if (!zzz) {
    console.error('[probe] getGameRecordCard no trajo una cuenta de ZZZ.');
    return;
  }
  const roleQs = `role_id=${zzz.game_role_id}&server=${zzz.region}`;

  const basic = await call('avatar_basic', `${BASE}/avatar/basic?${roleQs}`);
  const ids = (basic?.avatar_list ?? []).map((avatar) => avatar.id).filter((id) => id != null);
  if (ids.length === 0) {
    console.error('[probe] avatar/basic no trajo ids; sin eso no hay nada que sondear.');
    return download();
  }
  const id = ids[0];
  console.log(`[probe] ${ids.length} agentes en el roster; sondeo con id=${id}`);

  // Una variante por dimensión, para que el resultado diga QUÉ estaba mal y no solo que
  // "esta anda": corchetes repetidos vs indexados vs sin corchetes, codificados o no,
  // y need_wiki en sus cuatro formas.
  const variants = [
    ['repetido_wiki_false', `id_list[]=${id}&need_wiki=false`],
    ['repetido_wiki_true', `id_list[]=${id}&need_wiki=true`],
    ['repetido_sin_wiki', `id_list[]=${id}`],
    ['repetido_codificado', `id_list%5B%5D=${id}&need_wiki=false`],
    ['indexado_wiki_true', `id_list[0]=${id}&need_wiki=true`],
    ['indexado_codificado', `id_list%5B0%5D=${id}&need_wiki=false`],
    ['plano', `id_list=${id}&need_wiki=false`],
    ['repetido_wiki_cero', `id_list[]=${id}&need_wiki=0`],
  ];

  let winner = null;
  for (const [name, qs] of variants) {
    const data = await call(name, `${BASE}/avatar/info?${qs}&${roleQs}`);
    if (data) {
      winner = { name, qs: qs.replace(String(id), '{id}') };
      console.log(`[probe] ✅ forma buena: ${name}`);
      break;
    }
  }

  if (!winner) {
    // -400005 en todas las formas de parámetros apunta a la ruta, no a los parámetros.
    // avatar/basic responde OK, así que la sesión y el role_id están bien.
    console.warn('[probe] ninguna variante anduvo; pruebo rutas alternativas.');
    for (const path of ['avatar/detail', 'avatar/list', 'avatar/get_info']) {
      const data = await call(`ruta_${path.replace('/', '_')}`, `${BASE}/${path}?id_list[]=${id}&need_wiki=false&${roleQs}`);
      if (data) {
        winner = { name: `ruta ${path}`, qs: `id_list[]={id}&need_wiki=false`, path };
        console.log(`[probe] ✅ ruta buena: ${path}`);
        break;
      }
    }
  }

  if (!winner) {
    console.error('[probe] no hubo forma válida. El JSON descargado tiene los retcodes de todas.');
    return download();
  }

  out.winner = winner;
  const path = winner.path ?? 'avatar/info';
  // El need_wiki y la forma del array salen de la variante ganadora, no de un default:
  // el batch tiene que repetir exactamente lo que HoYoLAB aceptó.
  const needWiki = /need_wiki=([^&]*)/.exec(winner.qs)?.[1] ?? null;
  const serialize = winner.qs.includes('id_list[]') || winner.qs.includes('id_list%5B%5D')
    ? (values) => values.map((value) => `id_list[]=${value}`).join('&')
    : winner.qs.startsWith('id_list=')
      ? (values) => values.map((value) => `id_list=${value}`).join('&')
      : (values) => values.map((value, position) => `id_list[${position}]=${value}`).join('&');
  const build = (values) =>
    [`${BASE}/${path}?${serialize(values)}`, needWiki === null ? null : `need_wiki=${needWiki}`, roleQs]
      .filter(Boolean)
      .join('&');

  // El data completo de un solo agente: de acá salen la forma de properties/equip/weapon,
  // si hay conteo de rolls y si promotion_level y core_skill_enhancement vienen explícitos.
  await call('ganador_single', build([id]), { keepData: true });

  // Incógnita 1: ¿cuántos ids por request? Tres primero, después todo el roster.
  await call('batch_3', build(ids.slice(0, 3)), { keepData: true });
  await call('batch_all', build(ids), { keepData: true });

  download();

  function download() {
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `zzz-avatar-info-probe-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(anchor.href);
    console.log('[probe] listo:', out.winner ?? 'sin forma válida');
  }
})();
