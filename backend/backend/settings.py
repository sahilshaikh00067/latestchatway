from pathlib import Path
import os

import dj_database_url


# ============================================================
# BASE DIRECTORY
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent


# ============================================================
# SECURITY
# ============================================================

# Render Environment Variable:
# SECRET_KEY=your-existing-secret-key
#
# Fallback only for local development.
SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "django-insecure-%3x!z6^b07cqqh))o&o*l&u8tvp*o6$vv$nyr=p2dn(i_45+-0"
)


DEBUG = os.environ.get(
    "DEBUG",
    "False"
).lower() == "true"


# ============================================================
# ALLOWED HOSTS
# ============================================================

ALLOWED_HOSTS = [

    "127.0.0.1",

    "localhost",

    ".onrender.com",

    "cloudwhatsapp.in",

    "www.cloudwhatsapp.in",

]


# ============================================================
# CSRF TRUSTED ORIGINS
# ============================================================

CSRF_TRUSTED_ORIGINS = [

    "http://127.0.0.1:5173",

    "http://localhost:5173",

    "https://latestchatway.vercel.app",

    "https://cloudwhatsapp.in",

    "https://www.cloudwhatsapp.in",

    "https://latestchatway.onrender.com",

]


# ============================================================
# INSTALLED APPS
# ============================================================

INSTALLED_APPS = [

    "django.contrib.admin",

    "django.contrib.auth",

    "django.contrib.contenttypes",

    "django.contrib.sessions",

    "django.contrib.messages",

    "django.contrib.staticfiles",

    "rest_framework",

    "corsheaders",

    "api",

]


# ============================================================
# MIDDLEWARE
# ============================================================

MIDDLEWARE = [

    # CORS should remain near the top
    "corsheaders.middleware.CorsMiddleware",

    "django.middleware.security.SecurityMiddleware",

    # Static file serving
    "whitenoise.middleware.WhiteNoiseMiddleware",

    "django.contrib.sessions.middleware.SessionMiddleware",

    "django.middleware.common.CommonMiddleware",

    # NOTE:
    # Keeping this commented because your existing React API
    # setup is currently working without CSRF middleware.
    #
    # "django.middleware.csrf.CsrfViewMiddleware",

    "django.contrib.auth.middleware.AuthenticationMiddleware",

    "django.contrib.messages.middleware.MessageMiddleware",

    "django.middleware.clickjacking.XFrameOptionsMiddleware",

]


# ============================================================
# CORS SETTINGS
# ============================================================

CORS_ALLOWED_ORIGINS = [

    "http://127.0.0.1:5173",

    "http://localhost:5173",

    "https://latestchatway.vercel.app",

    "https://cloudwhatsapp.in",

    "https://www.cloudwhatsapp.in",

    "https://latestchatway.onrender.com",

]


CORS_ALLOW_CREDENTIALS = True


CORS_ALLOW_METHODS = [

    "DELETE",

    "GET",

    "OPTIONS",

    "PATCH",

    "POST",

    "PUT",

]


CORS_ALLOW_HEADERS = [

    "accept",

    "accept-encoding",

    "authorization",

    "content-type",

    "dnt",

    "origin",

    "user-agent",

    "x-csrftoken",

    "x-requested-with",

]


# ============================================================
# URL CONFIGURATION
# ============================================================

ROOT_URLCONF = "backend.urls"


# ============================================================
# TEMPLATES
# ============================================================

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


# ============================================================
# WSGI
# ============================================================

WSGI_APPLICATION = "backend.wsgi.application"


# ============================================================
# DATABASE
# ============================================================
#
# IMPORTANT:
#
# DO NOT change your existing DATABASE_URL on Render.
#
# Same DATABASE_URL
#        ↓
# Same PostgreSQL Database
#        ↓
# Same Users       ✅
# Same Resellers   ✅
# Same Credits     ✅
# Same Campaigns   ✅
# Same Reports     ✅
#
# ============================================================

DATABASE_URL = os.environ.get("DATABASE_URL")


if DATABASE_URL:

    DATABASES = {

        "default": dj_database_url.parse(

            DATABASE_URL,

            # Reuse database connections for better performance
            conn_max_age=600,

            # Django checks whether the connection is still usable
            conn_health_checks=True,

            ssl_require=True,

        )

    }


else:

    # Local development only
    DATABASES = {

        "default": {

            "ENGINE": "django.db.backends.sqlite3",

            "NAME": BASE_DIR / "db.sqlite3",

        }

    }


# ============================================================
# PASSWORD VALIDATORS
# ============================================================

AUTH_PASSWORD_VALIDATORS = [

    {
        "NAME":
        "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },

    {
        "NAME":
        "django.contrib.auth.password_validation.MinimumLengthValidator"
    },

    {
        "NAME":
        "django.contrib.auth.password_validation.CommonPasswordValidator"
    },

    {
        "NAME":
        "django.contrib.auth.password_validation.NumericPasswordValidator"
    },

]


# ============================================================
# INTERNATIONALIZATION
# ============================================================

LANGUAGE_CODE = "en-us"


TIME_ZONE = "UTC"


USE_I18N = True


USE_TZ = True


# ============================================================
# STATIC FILES
# ============================================================

STATIC_URL = "/static/"


STATIC_ROOT = BASE_DIR / "staticfiles"


# WhiteNoise static file storage
STORAGES = {

    "staticfiles": {

        "BACKEND":
        "whitenoise.storage.CompressedManifestStaticFilesStorage",

    },

}


# ============================================================
# MEDIA FILES
# ============================================================

MEDIA_URL = "/media/"


MEDIA_ROOT = BASE_DIR / "media"


# ============================================================
# FILE UPLOAD SIZE
# ============================================================

DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024


FILE_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024


# Allow large FormData requests with many numbers
DATA_UPLOAD_MAX_NUMBER_FIELDS = None


# ============================================================
# REST FRAMEWORK
# ============================================================

REST_FRAMEWORK = {

    "DEFAULT_PARSER_CLASSES": [

        "rest_framework.parsers.MultiPartParser",

        "rest_framework.parsers.FormParser",

        "rest_framework.parsers.JSONParser",

    ],

}


# ============================================================
# PERFORMANCE
# ============================================================

# Prevent excessive upload handling delays
FILE_UPLOAD_PERMISSIONS = 0o644