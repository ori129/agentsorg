from cryptography.fernet import Fernet

from app.config import settings

_fernet: Fernet | None = None


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not settings.fernet_key:
            raise ValueError("FERNET_KEY environment variable is required")
        _fernet = Fernet(settings.fernet_key.encode())
    return _fernet


def encrypt(value: str) -> str:
    return get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return get_fernet().decrypt(value.encode()).decode()


def mask(value: str | None) -> str | None:
    if not value:
        return None
    return "********"
