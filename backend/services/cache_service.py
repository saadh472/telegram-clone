"""Response caching for hot read endpoints (re-exports cache module)."""
from services.cache import get, get_or_set, invalidate_prefix, invalidate_user, set

__all__ = ["get", "set", "get_or_set", "invalidate_prefix", "invalidate_user"]
