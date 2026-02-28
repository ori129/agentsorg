"""In-memory demo mode state. Resets on server restart."""

_demo_state: dict = {
    "enabled": False,
    "size": "medium",
}

SIZE_MAP = {
    "small": 50,
    "medium": 500,
    "large": 2000,
    "enterprise": 5000,
}


def is_demo_mode() -> bool:
    return _demo_state["enabled"]


def get_demo_state() -> dict:
    return dict(_demo_state)


def set_demo_state(enabled: bool, size: str = "medium") -> dict:
    if size not in SIZE_MAP:
        raise ValueError(f"Invalid size: {size}. Must be one of {list(SIZE_MAP.keys())}")
    _demo_state["enabled"] = enabled
    _demo_state["size"] = size
    return dict(_demo_state)


def get_demo_gpt_count() -> int:
    return SIZE_MAP[_demo_state["size"]]
