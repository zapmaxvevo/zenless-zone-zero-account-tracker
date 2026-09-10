# ZZZ Tracker

Zenless Zone Zero account tracker: account info, agent roster, builds (W-Engine + drive discs)
and team comps.

- Backend: FastAPI + SQLAlchemy, managed with [uv](https://docs.astral.sh/uv/).
- Frontend: Vite + React + TypeScript (in `frontend/`).
- Browser extension: WXT + React + TypeScript (in `extension/`), which imports the Battle
  Chronicle from the HoYoLAB session already open in your browser. It is the only way HoYoLAB
  data gets in, and the only way an account gets an owner.

`docs/PLAN.md` is the development plan, `docs/OWNERSHIP.md` the ownership model,
`docs/DEPLOY.md` the steps to publish it, and `docs/DESIGN.md` the design system every screen
has to follow.

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
one of them, with its default and what it costs to leave it empty, is in `.env.example`.
**There is no mandatory secret**: the server never talks to HoYoLAB and stores no cookies, so
the only thing to get right is `ZZZ_DATABASE_URL`. `ZZZ_API_TOKEN` is optional (see below).
Alembic reads `ZZZ_DATABASE_URL` too, falling back to the URL in `alembic.ini`.

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

Writing asks for a key. Editing an agent, saving a team, importing a Chronicle into an account
that already has an owner: all of them take an `X-Account-Key` header carrying the key of
*that* account. The key is a random secret the backend issues per UID, stores hashed, and shows
exactly once — there is no login, no password and no account of your own to create.

**The only way to get one is to import the account's Battle Chronicle with the browser
extension.** Typing a UID into the web (`POST /accounts`) starts tracking it and hands out
nothing: a UID is a public number, and typing one in says nothing about whose account it is. An
account nobody has imported can be read by everyone and written by no one.

An import proves nothing on its own either — a bundle is a JSON the client chose, UID included
— so what it buys is the right to take an account **nobody has taken yet**. The first import
claims the UID and answers with the key once; from then on the key is the only thing that
speaks for the account, and an import without it is refused with a 403 rather than rotating
anything. First come, first served, like a username.

The extension keeps the key it was handed and passes it to the app through the link it opens,
so nothing has to be copied by hand — except onto a second machine, where you paste it once.
`GET /accounts/{uid}/ownership` with the key answers whether it is the right one (204) without
writing anything, so a bad paste says so immediately instead of at the first failed save.

Losing the key is not recoverable from the browser: re-importing will not give you a new one.
It takes `zzz-tracker rotate-key <uid>` on the machine that holds the database, which is
exactly the price that makes the rule worth something.

`docs/OWNERSHIP.md` has the whole model: what an import is and is not allowed to prove, why the
key belongs to an account rather than to a caller, and how the errors are meant to be read.

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
Shiyu Defense and Deadly Assault runs, and Lost Void progress. It gets in one way only — the
**browser extension**, which reads HoYoLAB from your own browser with your own session and IP,
and posts the raw payloads to `POST /accounts/{uid}/chronicle/import`. The backend never sees a
cookie, keeps no credentials and makes no request of its own.

That is deliberate, and it is what a server cannot do: HoYoLAB's captcha is unanswerable
headless, and datacenter IPs attract both the captcha and the rate limits. In the user's
browser the captcha can be shown and solved. The price is that the Chronicle is only as fresh
as the last manual import, which is cheap — the seasons last weeks.

See `extension/README.md` to install and use it, `docs/EXTENSION.md` for the plan behind it,
and `docs/HOYOLAB.md` for the technical reference: what each endpoint returns, how the payloads
are interpreted, the retcodes, and what is still unverified.

`ZZZ_API_TOKEN` is an optional extra bar on that import: when set, the endpoint demands a
`Bearer` on top of the ownership rules. It cannot be the only defence — a token that ships
inside a published extension is not a secret — so it defaults to empty.

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
- `claim UID` — takes ownership of a tracked account nobody owns and prints its key, once,
  without going through the extension. It is how the accounts that predate account keys stop
  being read-only, and the escape hatch for anyone who cannot run the extension. An account
  that already has an owner is refused; use `rotate-key` for those.
- `rotate-key UID` — issues a new key and kills the one the account had, printing it once. It
  is the only way back in for an owner who lost theirs, since no import can take over an
  account that already has one. Whoever runs it becomes the owner, so it is run for the real
  one; anything still holding the old key — a browser, the extension on another machine — has
  to be given the new one.
