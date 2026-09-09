"""Serverless entrypoint for Vercel.

Vercel turns every file under `api/` into a function and hands it the request with the
original path, so `/api/accounts/1500123456` arrives here spelled in full. The routers are
mounted at the root (`/accounts/...`) because that is what `frontend/vite.config.ts` proxies
to in development, where the `/api` prefix is rewritten away before the request leaves the
dev server. `StripApiPrefix` does the same rewrite in production, which keeps a single URL
shape in `frontend/src/api/client.ts` for both.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import TYPE_CHECKING

ROOT = Path(__file__).resolve().parent.parent

# The package lives in `src/` and Vercel does not `pip install` the project itself.
sys.path.insert(0, str(ROOT / "src"))

# `static_data_dir` defaults to a path relative to the working directory, which is not a
# place we control here. The store files ride along in the deployment (see `.gitignore` and
# `docs/DEPLOY.md`); point at them absolutely unless the environment already says otherwise.
os.environ.setdefault("ZZZ_STATIC_DATA_DIR", str(ROOT / "data" / "static"))

from zzz_tracker.app import create_app  # noqa: E402

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from typing import Any

    Scope = dict[str, Any]
    Receive = Callable[[], Awaitable[dict[str, Any]]]
    Send = Callable[[dict[str, Any]], Awaitable[None]]

API_PREFIX = "/api"


class StripApiPrefix:
    """Drop the `/api` prefix Vercel routes on, before the ASGI app sees the path."""

    def __init__(self, application: object) -> None:
        self.application = application

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in ("http", "websocket"):
            scope = dict(scope)
            scope["path"] = self._strip(scope.get("path", "/"))
            raw_path = scope.get("raw_path")
            if isinstance(raw_path, bytes):
                scope["raw_path"] = self._strip(raw_path.decode("latin-1")).encode("latin-1")
        await self.application(scope, receive, send)  # type: ignore[operator]

    @staticmethod
    def _strip(path: str) -> str:
        if path == API_PREFIX:
            return "/"
        if path.startswith(f"{API_PREFIX}/"):
            return path[len(API_PREFIX) :]
        return path


app = StripApiPrefix(create_app())
