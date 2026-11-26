"""Isolated test settings allowing automated unit/API tests to run without live Postgres credentials.

Production/local development settings remain strictly PostgreSQL in config/settings.py.
"""

from config.settings import *  # noqa: F401, F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

ORS_API_KEY = "test-ors-key"
OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1"
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "spotter-test-cache",
    }
}
