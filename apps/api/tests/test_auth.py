from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.auth import auth_required, owner_id_for_token, resolve_principal
from app.config import Settings


def test_auth_required_false_when_token_empty():
    settings = Settings(access_token="")
    assert auth_required(settings) is False


def test_owner_id_is_stable_hash():
    assert owner_id_for_token("secret-a") == owner_id_for_token("secret-a")
    assert owner_id_for_token("secret-a") != owner_id_for_token("secret-b")


def test_resolve_principal_open_mode():
    settings = Settings(access_token="")
    request = MagicMock()
    principal = resolve_principal(settings, request)
    assert principal.authenticated
    assert principal.owner_id == "anonymous"


def test_resolve_principal_accepts_bearer_token():
    settings = Settings(access_token="site-secret")
    request = MagicMock()
    request.headers = {"authorization": "Bearer site-secret"}
    request.query_params = {}
    principal = resolve_principal(settings, request)
    assert principal.authenticated
    assert principal.owner_id == owner_id_for_token("site-secret")


def test_resolve_principal_rejects_bad_token():
    settings = Settings(access_token="site-secret")
    request = MagicMock()
    request.headers = {"authorization": "Bearer wrong"}
    request.query_params = {}
    with pytest.raises(HTTPException) as exc:
        resolve_principal(settings, request)
    assert exc.value.status_code == 401


def test_resolve_principal_accepts_query_token_for_download():
    settings = Settings(access_token="site-secret")
    request = MagicMock()
    request.headers = {}
    request.query_params = {"access_token": "site-secret"}
    principal = resolve_principal(settings, request)
    assert principal.authenticated
