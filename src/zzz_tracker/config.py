from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ZZZ Tracker"
    database_url: str = "sqlite:///./data/zzz.db"

    static_data_dir: str = "./data/static"
    enka_base_url: str = "https://enka.network/api/zzz"

    # Nothing here talks to HoYoLAB: the Battle Chronicle arrives as a bundle the browser
    # extension captured and posted. `api_token`, when set, is an extra gate on that import.
    api_token: str = ""

    model_config = SettingsConfigDict(
        env_prefix="ZZZ_",
        env_file=".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
