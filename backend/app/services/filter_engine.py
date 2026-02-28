from app.models.models import Configuration


def filter_gpts(gpts: list[dict], config: Configuration) -> list[dict]:
    if config.include_all:
        return gpts

    filtered = []
    visibility_filters = config.visibility_filters or {}
    enabled_visibilities = {k for k, v in visibility_filters.items() if v}
    excluded = {e.lower() for e in (config.excluded_emails or [])}

    for gpt in gpts:
        owner_email = (gpt.get("owner_email") or "").lower()
        if owner_email in excluded:
            continue

        visibility = gpt.get("visibility", "")
        if enabled_visibilities and visibility not in enabled_visibilities:
            continue

        if visibility == "invite_only" and config.min_shared_users > 0:
            shared_count = gpt.get("shared_user_count", 0) or 0
            if shared_count < config.min_shared_users:
                continue

        filtered.append(gpt)

    return filtered
