#!/usr/bin/env python3
"""Baja los iconos de la wiki de ZZZ a `frontend/src/assets/icons/`.

Los nombres de archivo de la wiki no coinciden con las claves que usa la app
(Enka dice `Physics`, la wiki `Icon_Physical.png`), así que el mapeo va escrito
a mano acá abajo: es la única fuente de verdad de qué imagen es cada cosa.

Uso:
    uv run python scripts/fetch_wiki_icons.py [--force] [--width N]

Sin `--force` no vuelve a bajar lo que ya está en disco. `--width` pide a la
wiki una versión reescalada en vez del PNG original.

Las imágenes son assets del juego (HoYoverse) servidos por una wiki CC-BY-SA;
para un tracker personal alcanza, pero si esto se publica conviene acreditar.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://zenless-zone-zero.fandom.com/api.php"
USER_AGENT = "personal-zzz-tracker/1.0 (icon fetch; personal use)"
DEST = Path(__file__).resolve().parent.parent / "frontend" / "src" / "assets" / "icons"

# grupo -> nombre en disco (sin extensión) -> archivo en la wiki.
# Las claves de `elements`, `professions` y `skills` salen de frontend/src/lib/labels.ts.
ICONS: dict[str, dict[str, str]] = {
    # Atributos. Enka los llama `Physics`/`AuricInk`; la wiki, `Physical`/`Auric Ink`.
    "element": {
        "physics": "Icon_Physical.png",
        "fire": "Icon_Fire.png",
        "ice": "Icon_Ice.png",
        "electric": "Icon_Electric.png",
        "ether": "Icon_Ether.png",
        "frost": "Icon_Frost.png",
        "auric-ink": "Icon_Auric_Ink.png",
        "wind": "Icon_Wind.png",
        "lumiflux": "Icon_Lumiflux.png",
        # `Assault` es como Enka nombra el atributo de Ye Shunguang (`ZhenZhenAssault`);
        # el juego y la wiki lo llaman `Honed Edge`.
        "assault": "Icon_Honed_Edge.png",
    },
    # Especialidades (los "roles" del equipo).
    "profession": {
        "attack": "Icon_Attack.png",
        "stun": "Icon_Stun.png",
        "anomaly": "Icon_Anomaly.png",
        "support": "Icon_Support.png",
        "defense": "Icon_Defense.png",
        "rupture": "Icon_Rupture.png",
    },
    # Rangos de agente. S/A/B es la escala 2..4 que manda Enka; `i` es el rango propio de
    # Pyrois, que en el dato de Enka viaja como una rareza 4 más (ver `rankIcon` en icons.ts).
    "rank": {
        "s": "Icon_AgentRank_S.png",
        "a": "Icon_AgentRank_A.png",
        "b": "Icon_AgentRank_B.png",
        "i": "Icon_AgentRank_I.png",
    },
    # Tipo de ataque del agente.
    "attack": {
        "slash": "Icon_Slash.png",
        "strike": "Icon_Strike.png",
        "pierce": "Icon_Pierce.png",
    },
    # Habilidades, en el mismo orden que SKILLS en labels.ts (el índice 4 no existe).
    "skill": {
        "basic-attack": "Icon_Basic_Attack.png",
        "special-attack": "Icon_Special_Attack.png",
        "dodge": "Icon_Dodge.png",
        "chain-attack": "Icon_Chain_Attack.png",
        "core-skill": "Icon_Core_Skill.png",
        "assist": "Icon_Assist_Attack.png",
    },
    # Retratos redondos de agente. La clave es el `game_id` de Enka (las claves de
    # data/static/avatars.json, que es lo que viaja en AgentRead.game_id); la wiki
    # los archiva por nombre completo, que casi nunca es el nombre corto de Enka
    # (Enka dice `Rina`, la wiki `Alexandrina Sebastiane`).
    # Solo el look base: los archivos con sufijo extra son skins/trajes.
    "agent": {
        "1011": "Agent_Anby_Demara_Circle_Icon.png",
        "1021": "Agent_Nekomiya_Mana_Circle_Icon.png",
        "1031": "Agent_Nicole_Demara_Circle_Icon.png",
        "1041": "Agent_Soldier_11_Circle_Icon.png",
        "1051": "Agent_Yidhari_Murphy_Circle_Icon.png",
        "1061": "Agent_Corin_Wickes_Circle_Icon.png",
        "1071": "Agent_Caesar_King_Circle_Icon.png",
        "1081": "Agent_Billy_Kid_Circle_Icon.png",
        "1091": "Agent_Hoshimi_Miyabi_Circle_Icon.png",
        "1101": "Agent_Koleda_Belobog_Circle_Icon.png",
        "1111": "Agent_Anton_Ivanov_Circle_Icon.png",
        "1121": "Agent_Ben_Bigger_Circle_Icon.png",
        "1131": "Agent_Soukaku_Circle_Icon.png",
        "1141": "Agent_Von_Lycaon_Circle_Icon.png",
        "1151": "Agent_Luciana_de_Montefio_Circle_Icon.png",
        "1161": "Agent_Lighter_Circle_Icon.png",
        "1171": "Agent_Burnice_White_Circle_Icon.png",
        "1181": "Agent_Grace_Howard_Circle_Icon.png",
        "1191": "Agent_Ellen_Joe_Circle_Icon.png",
        "1201": "Agent_Asaba_Harumasa_Circle_Icon.png",
        "1211": "Agent_Alexandrina_Sebastiane_Circle_Icon.png",
        "1221": "Agent_Tsukishiro_Yanagi_Circle_Icon.png",
        "1241": "Agent_Zhu_Yuan_Circle_Icon.png",
        "1251": "Agent_Qingyi_Circle_Icon.png",
        "1261": "Agent_Jane_Doe_Circle_Icon.png",
        "1271": "Agent_Seth_Lowell_Circle_Icon.png",
        "1281": "Agent_Piper_Wheel_Circle_Icon.png",
        "1291": "Agent_Hugo_Vlad_Circle_Icon.png",
        "1301": "Agent_Orphie_Magnusson_&_Magus_Circle_Icon.png",
        "1311": "Agent_Astra_Yao_Circle_Icon.png",
        "1321": "Agent_Evelyn_Chevalier_Circle_Icon.png",
        "1331": "Agent_Vivian_Banshee_Circle_Icon.png",
        "1341": "Agent_Zhao_Circle_Icon.png",
        "1351": "Agent_Pulchra_Fellini_Circle_Icon.png",
        "1361": "Agent_Trigger_Circle_Icon.png",
        "1371": "Agent_Yixuan_Circle_Icon.png",
        "1381": "Agent_Soldier_0_-_Anby_Circle_Icon.png",
        "1391": "Agent_Ju_Fufu_Circle_Icon.png",
        "1401": "Agent_Alice_Thymefield_Circle_Icon.png",
        "1411": "Agent_Ukinami_Yuzuha_Circle_Icon.png",
        "1421": "Agent_Pan_Yinhu_Circle_Icon.png",
        "1431": "Agent_Ye_Shunguang_Circle_Icon.png",
        "1441": "Agent_Komano_Manato_Circle_Icon.png",
        "1451": "Agent_Lucia_Elowen_Circle_Icon.png",
        "1461": "Agent_Seed_Circle_Icon.png",
        "1471": "Agent_Banyue_Circle_Icon.png",
        "1481": "Agent_Dialyn_Circle_Icon.png",
        "1491": "Agent_Sunna_Circle_Icon.png",
        "1501": "Agent_Aria_Circle_Icon.png",
        "1511": "Agent_Nangong_Yu_Circle_Icon.png",
        "1521": "Agent_Cissia_Circle_Icon.png",
        "1531": "Agent_Starlight_-_Billy_Kid_Circle_Icon.png",
        "1541": "Agent_Promeia_Circle_Icon.png",
        "1551": "Agent_Pyrois_Circle_Icon.png",
        "1561": "Agent_Velina_Airgid_Circle_Icon.png",
        "1571": "Agent_Norma_Hollowell_Circle_Icon.png",
        "1581": "Agent_Remielle_Dan_Circle_Icon.png",
        "1591": "Agent_Sigrid_de_L'Azur_Circle_Icon.png",
    },
}


def _get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        data: bytes = response.read()
    return data


def resolve_urls(filenames: list[str]) -> dict[str, str]:
    """Pide a la API la URL real de cada `File:...`, de a 50 como permite MediaWiki."""
    urls: dict[str, str] = {}
    for start in range(0, len(filenames), 50):
        batch = filenames[start : start + 50]
        query = urllib.parse.urlencode(
            {
                "action": "query",
                "titles": "|".join(f"File:{name}" for name in batch),
                "prop": "imageinfo",
                "iiprop": "url|size",
                "format": "json",
            }
        )
        pages = json.loads(_get(f"{API}?{query}"))["query"]["pages"]
        for page in pages.values():
            info = page.get("imageinfo")
            if not info:
                print(f"  ! la wiki no tiene {page['title']}", file=sys.stderr)
                continue
            urls[page["title"].removeprefix("File:").replace(" ", "_")] = info[0]["url"]
    return urls


def variant(url: str, width: int | None) -> str:
    """URL de descarga: PNG de verdad y, si se pidió, reescalado por la propia wiki.

    Sin `format=original` el CDN negocia por Accept y devuelve WebP aunque la URL
    termine en `.png`, así que el archivo quedaría mintiendo sobre su formato.
    """
    base, _, cache = url.partition("/revision/latest")
    path = f"{base}/revision/latest"
    if width is not None:
        path += f"/scale-to-width-down/{width}"
    query = cache.removeprefix("?")
    return f"{path}?{query}&format=original" if query else f"{path}?format=original"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="rebajar los que ya existen")
    parser.add_argument("--width", type=int, default=None, help="reescalar a N px de ancho")
    args = parser.parse_args()

    wanted = [name for group in ICONS.values() for name in group.values()]
    print(f"Resolviendo {len(wanted)} archivos en la wiki…")
    urls = resolve_urls(wanted)

    downloaded = skipped = failed = 0
    for group, entries in ICONS.items():
        (DEST / group).mkdir(parents=True, exist_ok=True)
        for key, wiki_name in entries.items():
            target = DEST / group / f"{key}.png"
            if target.exists() and not args.force:
                skipped += 1
                continue
            url = urls.get(wiki_name)
            if url is None:
                failed += 1
                continue
            try:
                data = _get(variant(url, args.width))
            except OSError as error:  # red caída, 404 en el CDN, etc.
                print(f"  ! {wiki_name}: {error}", file=sys.stderr)
                failed += 1
                continue
            target.write_bytes(data)
            downloaded += 1
            print(f"  {group}/{key}.png  ({len(data) // 1024} KB)  <- {wiki_name}")

    print(f"\n{downloaded} bajados, {skipped} ya estaban, {failed} fallaron.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
