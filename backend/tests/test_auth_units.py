"""Unit tests for auth primitives — no database required."""
import jwt as pyjwt
import pytest

from app.auth.hashing import hash_password, verify_password
from app.auth.jwt import create_access_token, decode_access_token


def test_password_hash_roundtrip():
    h = hash_password("Demo@1234")
    assert h != "Demo@1234"
    assert h.startswith("$2")
    assert verify_password("Demo@1234", h)
    assert not verify_password("wrong-password", h)


def test_password_hash_is_salted():
    assert hash_password("same") != hash_password("same")


def test_verify_against_garbage_hash_returns_false():
    assert not verify_password("anything", "not-a-bcrypt-hash")


def test_jwt_roundtrip():
    token = create_access_token(42, "officer")
    payload = decode_access_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "officer"
    assert payload["exp"] > payload["iat"]


def test_jwt_tampered_token_rejected():
    token = create_access_token(42, "officer")
    with pytest.raises(pyjwt.PyJWTError):
        decode_access_token(token[:-2] + "xx")
