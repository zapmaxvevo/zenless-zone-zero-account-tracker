from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ZZZ Tracker"
    database_url: str = "sqlite:///./data/zzz.db"

    static_data_dir: str = "./data/static"
    enka_base_url: str = "https://enka.network/api/zzz"

    hoyolab_base_url: str = "https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz"
    hoyolab_language: str = "en-us"
    hoyolab_sync_ttl_seconds: int = 3600
    hoyolab_backoff_seconds: int = 900
    credentials_key: str = ""
    api_token: str = ""

    model_config = SettingsConfigDict(
        env_prefix="ZZZ_",
        env_file=".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
