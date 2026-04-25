import base64
import hashlib
import hmac
import os
import time


def _secret():
    return os.getenv("SESSION_TOKEN_SECRET", os.getenv("DJANGO_SECRET_KEY", "dev-secret-key")).encode("utf-8")


def sign_session_token(session_id: str, ttl_seconds: int = 86400) -> str:
    payload = f"{session_id}:{int(time.time())}:{int(time.time()) + ttl_seconds}"
    sig = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).digest()
    token = base64.urlsafe_b64encode(f"{payload}:{base64.urlsafe_b64encode(sig).decode('ascii')}".encode("utf-8")).decode("ascii")
    return token


def verify_session_token(token: str) -> str | None:
    try:
        decoded = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        session_id, iat, exp, sig_b64 = decoded.split(":", 3)
        payload = f"{session_id}:{iat}:{exp}"
        expected = base64.urlsafe_b64encode(hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).digest()).decode("ascii")
        if not hmac.compare_digest(expected, sig_b64):
            return None
        if int(exp) < int(time.time()):
            return None
        return session_id
    except Exception:
        return None


def bearer_from_request(request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return auth[7:].strip()


def require_session(request) -> str | None:
    token = bearer_from_request(request)
    if not token:
        return None
    return verify_session_token(token)
