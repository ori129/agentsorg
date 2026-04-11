from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://agentsorg:agentsorg@localhost:5433/agentsorg"
    fernet_key: str = ""
    backend_cors_origins: str = "http://localhost:3000"
    # Set this at deployment time to enable the break-glass recovery endpoint.
    # Generate with: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
    break_glass_token: str = ""
    # Public base URL for OIDC redirect_uri construction (e.g. https://app.example.com).
    # When running behind a reverse proxy (nginx), set this to the public-facing origin.
    # If unset, the backend derives it from X-Forwarded-Proto/Host headers, then falls
    # back to the request's own base URL.
    public_url: str = ""
    # Gap 1: set True in production behind HTTPS. Default True; set COOKIE_SECURE=false
    # only for local HTTP development.
    cookie_secure: bool = True

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
