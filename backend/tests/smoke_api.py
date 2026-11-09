"""Live API smoke tests for the local Flask server.

Run after starting the backend:
    python backend/tests/smoke_api.py
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request


BASE_URL = "http://127.0.0.1:3000/api"


def request(path: str, method: str = "GET", body: dict | str | None = None, token: str | None = None):
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if isinstance(body, dict):
        data = json.dumps(body).encode("utf-8")
    elif isinstance(body, str):
        data = body.encode("utf-8")

    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            payload = res.read().decode("utf-8") or "{}"
            return res.status, json.loads(payload)
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8") or "{}"
        return exc.code, json.loads(payload)


def assert_status(name: str, actual: int, expected: int):
    if actual != expected:
        raise AssertionError(f"{name}: expected HTTP {expected}, got {actual}")


def main() -> int:
    status, health = request("/health")
    assert_status("health", status, 200)
    if health.get("status") != "ok":
        raise AssertionError(f"health: unexpected payload {health}")

    status, login = request("/auth/login", "POST", {"username": "saad", "password": "12345678"})
    assert_status("login", status, 200)
    token = login.get("token")
    if not token:
        raise AssertionError("login: missing token")

    status, me = request("/users/me", token=token)
    assert_status("current user", status, 200)
    if me.get("username") != "saad":
        raise AssertionError(f"current user: unexpected payload {me}")

    status, chats = request("/chats", token=token)
    assert_status("chat list", status, 200)
    if not isinstance(chats, list):
        raise AssertionError("chat list: expected JSON array")

    status, malformed = request("/chats", "POST", "{bad", token=token)
    assert_status("malformed JSON", status, 400)
    if "error" not in malformed:
        raise AssertionError("malformed JSON: missing error message")

    print("API smoke tests passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"API smoke tests failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
