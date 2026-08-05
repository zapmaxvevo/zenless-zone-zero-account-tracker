from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ZZZ Tracker"
    database_url: str = "sqlite:///./data/zzz.db"

    # Enka.Network integration
    static_data_dir: str = "./data/static"
    enka_base_url: str = "https://enka.network/api/zzz"

    model_config = SettingsConfigDict(
        env_prefix="ZZZ_",
        env_file=".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
