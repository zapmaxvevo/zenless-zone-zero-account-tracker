// Fase 0 — captura de payloads reales del Battle Chronicle de ZZZ.
//
// Cómo usarlo:
//   1. Iniciar sesión en hoyolab.com y abrir https://act.hoyolab.com/app/zzz-game-record
//   2. Abrir DevTools (F12) → Console, pegar este archivo entero y dar Enter.
//   3. Esperar: corre en serie con jitter de 300-800 ms entre requests (nunca en ráfaga,
//      para no disparar el rate limit ni el captcha).
//   4. Al final descarga un único JSON con todos los payloads crudos. Ese archivo,
//      anonimizado (role_id, ltuid, nickname), es la materia prima para reemplazar las
//      fixtures inventadas de tests/fixtures/ y correr el checklist de HOYOLAB.md.
//
// Cada request anota retcode y x-trace-id en la consola; el x-trace-id es lo único que
// sirve para correlacionar un fallo con HoYoLAB.

(async () => {
  const BASE = 'https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz';
  const CARD = 'https://sg-act-public-api.hoyolab.com/game_record/card/wapi/getGameRecordCard';
  const ZZZ_GAME_ID = 8;
  const LANGUAGE = 'en-us';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const jitter = () => 300 + Math.floor(Math.random() * 501);

  // Incógnita: headers x-rpc-* mínimos. Mandamos los que el bundle oficial manda
  // (device_id y device_fp van vacíos a propósito); si esto funciona, son suficientes.
  const headers = {
    'x-rpc-lang': LANGUAGE,
    'x-rpc-language': LANGUAGE,
    'x-rpc-platform': '4',
    'x-rpc-device_id': '',
    'x-rpc-device_fp': '',
  };

  const capture = {
    captured_at: new Date().toISOString(),
    page: location.href,
    requests: [],
  };

  async function call(name, url) {
    let data = null;
    try {
      const response = await fetch(url, { credentials: 'include', headers });
      const traceId = response.headers.get('x-trace-id');
      let body = null;
      try {
        body = await response.json();
      } catch {
        // cuerpo no JSON: se registra igual con data null
      }
      console.log(
        `[capture] ${name}: http=${response.status} retcode=${body?.retcode} ` +
          `message=${JSON.stringify(body?.message ?? '')} x-trace-id=${traceId}`,
      );
      capture.requests.push({
        name,
        url,
        http_status: response.status,
        x_trace_id: traceId,
        retcode: body?.retcode ?? null,
        message: body?.message ?? '',
        data: body?.data ?? null,
      });
      data = body?.data ?? null;
    } catch (error) {
      console.warn(`[capture] ${name}: fallo de red`, error);
      capture.requests.push({ name, url, error: String(error) });
    }
    await sleep(jitter());
    return data;
  }

  // ltuid_v2 sale de las cookies del propio sitio: es lo único que hace falta tipear... nada.
  const ltuid = (document.cookie.match(/(?:^|; )ltuid_v2=([^;]*)/) || [])[1];
  if (!ltuid) {
    console.error('[capture] no encuentro la cookie ltuid_v2: ¿sesión iniciada en hoyolab.com?');
    return;
  }

  // Descubrimiento de role_id + server: getGameRecordCard con el ltuid de las cookies.
  // Confirma que el usuario no necesita tipear UID ni región.
  const card = await call('getGameRecordCard', `${CARD}?uid=${encodeURIComponent(ltuid)}`);
  const zzz = (card?.list ?? []).find((game) => Number(game.game_id) === ZZZ_GAME_ID);
  if (!zzz) {
    console.error('[capture] getGameRecordCard no trajo una cuenta de ZZZ; se corta acá.');
    download();
    return;
  }
  const roleId = String(zzz.game_role_id);
  const server = String(zzz.region);
  console.log(`[capture] role_id=${roleId} server=${server}`);

  const roleQs = `role_id=${roleId}&server=${server}`;
  const uidQs = `uid=${roleId}&region=${server}`;

  // La familia role_id + server (la trampa de los parámetros de HOYOLAB.md).
  await call('index', `${BASE}/index?${roleQs}`);
  const basic = await call('avatar_basic', `${BASE}/avatar/basic?${roleQs}`);

  const ids = (basic?.avatar_list ?? []).map((avatar) => avatar.id).filter((id) => id != null);
  if (ids.length === 0) {
    console.warn('[capture] avatar/basic no trajo ids; se saltea avatar/info.');
  } else {
    // Incógnita 2 del plan: cómo vienen los valores de las propiedades (¿"24%" como
    // string?, ¿hay conteo de rolls?). Se resuelve mirando el data de esta request.
    // need_wiki=false porque los links de wiki son ruido para el tracker.
    await call(
      'avatar_info_single',
      `${BASE}/avatar/info?id_list[0]=${ids[0]}&need_wiki=false&${roleQs}`,
    );

    // Incógnita 1, la de mayor impacto: ¿id_list acepta varios ids por request y hasta
    // cuántos? Se mandan TODOS los ids del roster serializados como id_list[0..n] (así
    // serializa qs en el bundle oficial). Si la respuesta trae avatar_list con todos,
    // el sync de la fase 3 es 1 request en vez de ~60.
    const batchQs = ids.map((id, position) => `id_list[${position}]=${id}`).join('&');
    await call('avatar_info_batch', `${BASE}/avatar/info?${batchQs}&need_wiki=false&${roleQs}`);
  }

  await call('buddy_info', `${BASE}/buddy/info?${roleQs}`);

  // Shiyu Defense: schedule_type 1 (actual) y 2 (anterior); no hay más historia.
  // Del payload interesa hadal_ver, si la errata fitfh_layer_detail sigue viva, y
  // todas las claves que terminan en _layer_detail (mapa capa → nodo).
  await call('shiyu_defense_1', `${BASE}/hadal_info_v2?schedule_type=1&${roleQs}`);
  await call('shiyu_defense_2', `${BASE}/hadal_info_v2?schedule_type=2&${roleQs}`);

  // La familia uid + region. En Deadly Assault buscar cualquier clave de rating:
  // hoy se asume que no existe (HOYOLAB.md, "Lo que no se sabe todavía").
  await call('deadly_assault_1', `${BASE}/hadal_mem_detail_v2?schedule_type=1&${uidQs}`);
  await call('deadly_assault_2', `${BASE}/hadal_mem_detail_v2?schedule_type=2&${uidQs}`);

  // Lost Void: verificar que el mapeo no quede todo en 0 (así se ve un fallo silencioso).
  // abysss2 con tres eses es la errata real de HoYoLAB.
  await call('lost_void', `${BASE}/abysss2_abstract?${uidQs}`);

  download();

  function download() {
    const blob = new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `zzz-chronicle-capture-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(anchor.href);
    console.log(`[capture] listo: ${capture.requests.length} requests en el JSON descargado.`);
  }
})();
