"""Django settings for the Weather-Aware Truck Routing platform."""

import os
from pathlib import Path

import dj_database_url
from dotenv import dotenv_values, load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

_ENV_PATH = BASE_DIR / ".env"
load_dotenv(_ENV_PATH)
if _ENV_PATH.exists():
    for _env_key, _env_val in dotenv_values(_ENV_PATH).items():
        if _env_val:
            os.environ[_env_key] = _env_val


def _parse_csv_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "django-insecure-dev-only-change-before-production",
)

DEBUG = os.getenv("DEBUG", "True").strip().lower() in {"1", "true", "yes", "on"}

ALLOWED_HOSTS = _parse_csv_env("ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "routing",
    "weather",
    "risk_engine",
    "trips",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgres://postgres:postgres@localhost:5432/spotter_routing",
)

DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=600,
        conn_health_checks=True,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = _parse_csv_env(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "EXCEPTION_HANDLER": "config.exceptions.custom_exception_handler",
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "spotter-weather-cache",
    }
}

# External API configuration (read exclusively on backend; never exposed to client)
ORS_API_KEY = os.getenv("ORS_API_KEY", "").strip().strip('"').strip("'")
ORS_BASE_URL = (
    os.getenv("ORS_BASE_URL", "https://api.heigit.org/openrouteservice")
    .strip()
    .rstrip("/")
    .removesuffix("/v2")
)
ORS_GEOCODE_BASE_URL = (
    os.getenv("ORS_GEOCODE_BASE_URL", "https://api.heigit.org/pelias/v1")
    .strip()
    .rstrip("/")
)
OPEN_METEO_BASE_URL = os.getenv(
    "OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1"
).strip().rstrip("/")
EXTERNAL_API_TIMEOUT_SECONDS = float(os.getenv("EXTERNAL_API_TIMEOUT_SECONDS", "15"))
WEATHER_CACHE_TTL_SECONDS = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "900"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "routing": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "weather": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "risk_engine": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "trips": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
