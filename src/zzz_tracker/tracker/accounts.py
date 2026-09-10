from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from zzz_tracker.errors import ConflictError, NotFoundError, ValidationError
from zzz_tracker.storage import keys
from zzz_tracker.storage.models import (
    CHINA_REGION,
    Account,
    AccountKey,
    region_for_uid,
    utc_now,
)


class AccountService:
    """Tracked accounts and the keys that own them."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_accounts(self) -> list[Account]:
        return list(self._session.scalars(select(Account).order_by(Account.uid)))

    def find_account(self, uid: str) -> Account | None:
        return self._session.get(Account, uid)

    def get_account(self, uid: str) -> Account:
        account = self.find_account(uid)
        if account is None:
            raise NotFoundError(f"Account {uid} is not tracked yet")
        return account

    def claim_account(self, uid: str) -> str:
        """Take ownership of a tracked account nobody claimed, and get its key once."""
        account = self.get_account(uid)
        if account.is_claimed:
            raise ConflictError(
                f"Account {uid} already has an owner; write to it with its `X-Account-Key`, "
                f"or run `zzz-tracker rotate-key {uid}` where the database lives to issue a "
                "new key and invalidate the old one"
            )
        return self.issue_key(account)

    def rotate_key(self, uid: str) -> str:
        """Give the account a brand new key, killing the one it had."""
        account = self.get_account(uid)
        return self.issue_key(account, rotating=account.is_claimed)

    def verify_key(self, uid: str, given: str) -> bool:
        """Whether `given` is the key of that account, stamping it as used when it is."""
        account = self.get_account(uid)
        key = account.key
        if key is None or not keys.verify_key(key.key_hash, given):
            return False
        key.last_used_at = utc_now()
        self._session.commit()
        return True

    def issue_key(self, account: Account, rotating: bool = False) -> str:
        key = account.key or AccountKey(account_uid=account.uid)
        secret = keys.generate_key()
        key.key_hash = keys.hash_key(secret)
        if rotating:
            key.rotated_at = utc_now()
        else:
            key.claimed_at = utc_now()
        account.key = key
        self._session.commit()
        return secret

    def find_or_create(self, uid: str) -> Account:
        """Track the UID if it is new, surviving the race of two imports creating it at once."""
        account = self.find_account(uid)
        if account is not None:
            return account
        account = Account(uid=uid)
        self._session.add(account)
        try:
            self._session.flush()
        except IntegrityError:
            self._session.rollback()
            existing = self.find_account(uid)
            if existing is None:
                raise
            return existing
        return account

    def region_for(self, account: Account) -> str:
        region = account.region or region_for_uid(account.uid)
        if region == CHINA_REGION:
            raise ValidationError(
                f"UID {account.uid} belongs to the Chinese client, which this tracker "
                "cannot read from HoYoLAB"
            )
        return region
