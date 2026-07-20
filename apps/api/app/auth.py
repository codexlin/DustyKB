from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass

from fastapi import HTTPException, Request

from app.config import Settings

ANONYMOUS_OWNER_ID = "anonymous"
PUBLIC_PATHS = {
    "/health",
    "/api/auth/status",
    "/docs",
    "/openapi.json",
    "/redoc",
}


@dataclass(frozen=True)
class Principal:
    owner_id: str
    authenticated: bool


def owner_id_for_token(token: str) -> str:
    digest = hashlib.sha256(f"dustykb:{token}".encode("utf-8")).hexdigest()
    return digest[:32]


def auth_required(settings: Settings) -> bool:
    return bool(settings.access_token.strip())


def resolve_principal(settings: Settings, request: Request) -> Principal:
    expected = settings.access_token.strip()
    if not expected:
        return Principal(owner_id=ANONYMOUS_OWNER_ID, authenticated=True)

    provided = _extract_token(request)
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing access token")
    return Principal(owner_id=owner_id_for_token(expected), authenticated=True)


def _extract_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    # Browser download links cannot set Authorization headers.
    return (request.query_params.get("access_token") or "").strip()


def is_public_path(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    return path.startswith("/docs") or path.startswith("/redoc")
