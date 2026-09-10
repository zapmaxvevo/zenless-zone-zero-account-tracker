"""The secret that proves someone owns a tracked account.

The tracker has no login: a key is the whole proof of ownership, handed out once when an
account is claimed and never readable again. It is stored hashed, so a dump of the database
does not hand anyone the write access it grants.

`token_urlsafe(32)` is 256 bits of entropy, which is why a plain sha256 is enough here: a
key is not a password nobody can remember, so there is nothing to brute-force and no reason
to pay for argon2. The `zzk_` prefix is there to make a leaked key greppable in a log.
"""

from __future__ import annotations

import hashlib
import secrets

KEY_PREFIX = "zzk_"
KEY_BYTES = 32


def generate_key() -> str:
    """A fresh account key, in the clear. This is the only moment it can be read."""
    return f"{KEY_PREFIX}{secrets.token_urlsafe(KEY_BYTES)}"


def hash_key(key: str) -> str:
    """The sha256 hex digest kept in the database instead of the key itself."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def verify_key(key_hash: str, given: str) -> bool:
    """Whether `given` is the key behind `key_hash`, compared without leaking timing."""
    if not given or not key_hash:
        return False
    return secrets.compare_digest(hash_key(given), key_hash)
