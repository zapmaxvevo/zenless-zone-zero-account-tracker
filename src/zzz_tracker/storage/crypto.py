from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from zzz_tracker.errors import ValidationError


class CredentialCipher:
    def __init__(self, key: str) -> None:
        if not key:
            raise ValidationError(
                "Storing HoYoLAB credentials needs ZZZ_CREDENTIALS_KEY; "
                "generate one with `zzz-tracker new-credentials-key`"
            )
        try:
            self._fernet = Fernet(key.encode("utf-8"))
        except (ValueError, TypeError) as exc:
            raise ValidationError("ZZZ_CREDENTIALS_KEY is not a valid Fernet key") from exc

    @classmethod
    def generate_key(cls) -> str:
        return Fernet.generate_key().decode("utf-8")

    def encrypt(self, value: str) -> str:
        return self._fernet.encrypt(value.encode("utf-8")).decode("utf-8")

    def decrypt(self, value: str) -> str:
        try:
            return self._fernet.decrypt(value.encode("utf-8")).decode("utf-8")
        except (InvalidToken, ValueError) as exc:
            raise ValidationError(
                "Stored credentials could not be decrypted; ZZZ_CREDENTIALS_KEY has changed"
            ) from exc
