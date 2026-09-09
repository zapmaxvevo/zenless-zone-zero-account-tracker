# ZZZ Tracker

Zenless Zone Zero account tracker: account info, agent roster, builds (W-Engine + drive discs)
and team comps.

- Backend: FastAPI + SQLAlchemy, managed with [uv](https://docs.astral.sh/uv/).
- Frontend: Vite + React + TypeScript (in `frontend/`).
- Browser extension: WXT + React + TypeScript (in `extension/`), which imports the Battle
  Chronicle from the HoYoLAB session already open in your browser.

`docs/PLAN.md` is the development plan, `docs/DEPLOY.md` the steps to publish it, and
`docs/DESIGN.md` the design system every screen has to follow.

## Backend

First run:

```bash
uv sync                       # install dependencies
uv run alembic upgrade head   # create the schema (ZZZ_DATABASE_URL, or ./data/zzz.db)
uv run zzz-tracker sync-static # download Enka's id -> name/icon tables into ./data/static
uv run zzz-tracker serve --reload
```

Day to day:

```bash
uv run pytest
uv run ruff check . && uv run ruff format .
uv run mypy src
```

Configuration comes from environment variables prefixed with `ZZZ_` (or a `.env` file); every
one of them, with its default and what it costs to leave it empty, is in `.env.example`. The
two that are secrets and have no default worth using are `ZZZ_CREDENTIALS_KEY` (the Fernet key
that encrypts stored HoYoLAB cookies) and `ZZZ_API_TOKEN` (optional, see below). Alembic reads
`ZZZ_DATABASE_URL` too, falling back to the URL in `alembic.ini`.

## Frontend

```bash
cd frontend
npm install
npm run dev     # proxies /api to http://127.0.0.1:8000, so run the backend too
npm run build   # tsc -b && vite build: a type error fails the build
npm run lint && npm run test
```

The look is the New Eridu design system. It is written down in `docs/DESIGN.md`, and that
document is the source of truth, not a suggestion: read it before building or changing a
screen.

## Who can write: account keys

Reading is public. Anyone can type a UID and look at the profile, the roster, the builds, the
teams and the Chronicle — the Enka showcase is public anyway, and a tracker nobody can look at
is not worth much.

Writing asks for a key. Editing an agent, saving a team, storing HoYoLAB cookies or running a
Chronicle sync all take an `X-Account-Key` header carrying the key of *that* account. The key
is a random secret the backend issues per UID, stores hashed, and shows exactly once — there is
no login, no password and no account of your own to create.

You get the key one of two ways:

- **From the web.** The first person to track a UID (`POST /accounts`) or to claim one nobody
  owns yet (`POST /accounts/{uid}/claim`) is handed the key on the spot, and the app shows it
  once with a "write this down" banner. This proves nothing: whoever got there first holds the
  UID, whether it is theirs or not.
- **From the extension.** Importing a UID's Battle Chronicle takes the account over from a
  claim made on the web: the key rotates, and the extension both keeps the new one and hands
  it to the app through the link it opens, so nothing has to be copied by hand.

An import proves no more than a web claim does — a bundle is a JSON the client chose, UID
included — so what it buys is only the right to take an account **nobody has taken yet**. From
the first import onwards the key is the only thing that speaks for the account: a second import
that does not present it is refused with a 403, however correctly it names the UID. Otherwise
anyone could forge a bundle, become the owner and then drive the stored HoYoLAB cookies with
`chronicle/sync`.

The cost of that rule is that losing the key is not recoverable from the browser. It takes
`zzz-tracker rotate-key <uid>` on the machine that holds the database, which is exactly the
price that makes the rule worth something.

`docs/OWNERSHIP.md` has the whole model: the claim levels, what an import is and is not allowed
to prove, and why the key belongs to an account rather than to a caller.

## Where the data comes from

### Enka.Network

`POST /accounts {"uid": "..."}` imports an account from
[Enka.Network](https://enka.network/api/zzz), and `POST /accounts/{uid}/sync` refreshes it.
Enka only exposes the agents the player put in their showcase, so the import is deliberately
additive:

- The `ttl` Enka reports is honoured — a sync inside that window reuses what is stored unless
  `?force=true` is passed.
- Agents whose `source` is `manual` are never overwritten by a sync.
- Agents that disappear from the showcase are kept, not deleted.

Ids in the API responses (agents, W-Engines, disc sets, stat properties) are resolved to names
and icons from the files `sync-static` downloads. The app still runs without them; those fields
simply stay unresolved.

### HoYoLAB's Battle Chronicle

The Chronicle covers what the showcase cannot: the whole roster with its builds, bangboos,
Shiyu Defense and Deadly Assault runs, and Lost Void progress. There are two ways in, and they
share a single persistence path in the backend.

The **browser extension** is the recommended one. It reads HoYoLAB from your own browser, with
your own session and IP, and uploads the raw payloads to
`POST /accounts/{uid}/chronicle/import`; the backend never sees a cookie and makes no request
of its own. It also solves what a server cannot: HoYoLAB's captcha, which is unanswerable
headless, and the rate limits that datacenter IPs attract. See `extension/README.md` to install
and use it, and `docs/EXTENSION.md` for the plan behind it.

The **server-side sync** is the older path, and stays for whoever prefers pasting cookies and
for the cron. `zzz-tracker set-credentials` stores the `ltuid_v2` / `ltoken_v2` pair encrypted
with `ZZZ_CREDENTIALS_KEY`, and from then on the backend can call HoYoLAB itself, honouring a
ttl between syncs and backing off after a rate limit or a captcha.
`POST /accounts/{uid}/chronicle/sync` does it on demand; `zzz-tracker sync-chronicle` does it
for every account with usable cookies, which is the mode meant for a cron on a machine with a
residential IP. `docs/HOYOLAB.md` is the technical reference: endpoints, retcodes, the mapper
and its schema versions, and the limits that are known.

`ZZZ_API_TOKEN` fits here as an optional extra bar: when it is set, the import endpoint demands
a `Bearer` on top of the account key. It cannot be the only defence — a token that ships inside
a published extension is not a secret — so it defaults to empty.

## Command line

Everything runs through `uv run zzz-tracker <command>`, and `--help` lists them with their
options.

- `serve [--host] [--port] [--reload]` — runs the API with uvicorn.
- `version` — prints the package version.
- `sync-static [DIRECTORY] [--base-url]` — downloads Enka's store files (`avatars`, `weapons`,
  `equipments`, `property`, `locs`) into `ZZZ_STATIC_DATA_DIR`. They are what turns game ids
  into names and icons, and they are committed under `data/static/` so the deployment ships
  with them.
- `init-db` — creates the missing tables directly, for local work without Alembic. Anything
  that will be deployed goes through `alembic upgrade head` instead.
- `new-credentials-key` — prints a fresh Fernet key for `ZZZ_CREDENTIALS_KEY`. Changing that
  key makes every credential already stored unreadable, so it is generated once and kept.
- `set-credentials UID [--ltuid] [--ltoken]` — stores an account's HoYoLAB cookies, encrypted.
  Omitting the options makes it ask for them, and it asks for the `ltoken_v2` without echoing
  it, which keeps the token out of the shell history.
- `claim UID` — takes ownership of a tracked account nobody owns and prints its key, once. It
  is meant for accounts that predate account keys — the ones the migration left `unclaimed`,
  and therefore read-only. The web claims new accounts by itself, and an account that already
  has an owner is refused.
- `rotate-key UID` — issues a new key and kills the one the account had, printing it once. It
  is the way back in for an owner who lost theirs, since an import cannot take over an account
  that was already claimed. Whoever runs it becomes the owner, and anything still holding the
  old key — a browser, the extension on another machine — has to be given the new one.
- `sync-chronicle [UID] [--force] [--no-previous]` — reads the Battle Chronicle over the
  network using the stored cookies. With no UID it walks every account that has usable ones,
  skipping (and naming) those whose cookies HoYoLAB has rejected: that is the cron mode. It
  exits 1 if any account failed. `--force` ignores the ttl and is for debugging, not for the
  cron; `--no-previous` reads only the running season instead of that one and the last.
