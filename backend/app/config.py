from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TeleHealthPro API"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/telehealthpro"

    jwt_secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # External FHIR (e.g. HAPI FHIR base URL)
    fhir_base_url: str | None = None
    fhir_token: str | None = None

    # SQLite clinical store (medical history + lab results only)
    clinical_sqlite_path: str = "data/clinical.sqlite3"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
    ]

    # Used for telehealth join links (must match Vite dev server or production URL)
    frontend_base_url: str = "http://localhost:5173"

    # Jitsi Meet base (public cloud or your own deployment, e.g. https://meet.jit.si)
    jitsi_base_url: str = "https://meet.jit.si"

    # Telehealth lifecycle safety rails
    telehealth_no_join_expire_minutes: int = 30
    telehealth_after_end_expire_minutes: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
