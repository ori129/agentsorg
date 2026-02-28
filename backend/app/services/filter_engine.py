import logging

from app.models.models import Configuration

logger = logging.getLogger(__name__)

# Map UI filter keys (underscore) to API values (hyphen)
_VISIBILITY_NORMALIZE = {
    "everyone_in_workspace": "everyone-in-workspace",
    "anyone_with_link": "workspace-with-link",
    "invite_only": "invite-only",
    "just_me": "just-me",
}


def filter_gpts(gpts: list[dict], config: Configuration) -> list[dict]:
    if config.include_all:
        logger.info("include_all=True, returning all GPTs unfiltered")
        return gpts

    filtered = []
    visibility_filters = config.visibility_filters or {}
    enabled_visibilities = {
        _VISIBILITY_NORMALIZE.get(k, k)
        for k, v in visibility_filters.items()
        if v
    }
    excluded = {e.lower() for e in (config.excluded_emails or [])}

    logger.info(f"Filter config: visibilities={enabled_visibilities}, min_shared_users={config.min_shared_users}, excluded_emails={excluded}")

    for gpt in gpts:
        name = gpt.get("name") or "?"
        owner_email = (gpt.get("owner_email") or "").lower()

        if owner_email in excluded:
            logger.info(f"EXCLUDED (email): {name} — owner {owner_email}")
            continue

        visibility = gpt.get("visibility") or ""
        if enabled_visibilities and visibility not in enabled_visibilities:
            logger.info(f"EXCLUDED (visibility): {name} — visibility '{visibility}' not in {enabled_visibilities}")
            continue

        if visibility == "invite-only" and config.min_shared_users > 0:
            shared_count = gpt.get("shared_user_count", 0) or 0
            if shared_count < config.min_shared_users:
                logger.info(f"EXCLUDED (min_shared): {name} — {shared_count} < {config.min_shared_users}")
                continue

        logger.info(f"INCLUDED: {name} — visibility={visibility}, shared={gpt.get('shared_user_count', 0)}")
        filtered.append(gpt)

    return filtered
