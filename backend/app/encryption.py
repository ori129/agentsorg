from cryptography.fernet import Fernet

from app.config import settings

_fernet: Fernet | None = None


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not settings.fernet_key:
            raise ValueError("FERNET_KEY environment variable is required")
        try:
            _fernet = Fernet(settings.fernet_key.encode())
        except Exception as e:
            raise ValueError(f"Invalid FERNET_KEY format: {e}") from e
    return _fernet


def encrypt(value: str) -> str:
    return get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return get_fernet().decrypt(value.encode()).decode()


def mask(value: str | None) -> str | None:
    if not value:
        return None
    return "********"


def mask_email(email: str | None) -> str:
    """Return a privacy-safe email for logging: alice@company.com → a***@company.com"""
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    return f"{local[0]}***@{domain}"
