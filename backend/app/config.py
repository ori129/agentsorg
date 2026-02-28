from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://gpt_registry:changeme@postgres:5432/gpt_registry"
    fernet_key: str = ""
    backend_cors_origins: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
