import json
import os
import time
import uuid
from pathlib import Path

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.http import FileResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .auth import require_session, sign_session_token
from .serializers import GestureSerializer, MetricsSerializer, SessionCreateSerializer, SignSerializer, ThemeSerializer

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"

SESSIONS = {}
METRICS = {}
EVENTS = {}
SIGNS = {}
PROFILES = {}
THEMES = ["Rainbow", "Cyberpunk", "Lava", "Ocean", "Galaxy"]
INTERNAL_TOKEN = os.getenv("INTERNAL_EVENT_TOKEN", "internal-dev-token")
SESSION_TTL_SEC = int(os.getenv("SESSION_TTL_SEC", "86400"))


def _log(request, status_code, started, extra=None):
    payload = {
        "service": "auramesh-django",
        "requestId": request.headers.get("x-request-id") or str(uuid.uuid4()),
        "method": request.method,
        "path": request.path,
        "status": status_code,
        "ms": int((time.time() - started) * 1000),
    }
    if extra:
        payload.update(extra)
    print(json.dumps(payload))


def _broadcast(payload):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        "auramesh.events",
        {"type": "broadcast.message", "payload": payload},
    )


def _fallback_effect(gesture_type, theme):
    effect = {
        "pinch": "shockwave",
        "open_hand": "aura_expand",
        "fist": "pulse_compress",
    }.get(gesture_type, "idle")
    return {"effect": effect, "intensity": 0.95 if gesture_type == "pinch" else 0.7, "theme": theme or "Rainbow"}


def index(request):
    index_path = FRONTEND_DIR / "index.html"
    return FileResponse(open(index_path, "rb"), content_type="text/html")


@api_view(["GET"])
def health(request):
    return Response({"ok": True, "service": "auramesh-django"})


@api_view(["POST"])
def create_session(request):
    started = time.time()
    serializer = SessionCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    session_id = uuid.uuid4().hex
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    session = {
        "sessionId": session_id,
        "createdAt": created_at,
        "source": serializer.validated_data["source"],
        "status": "active",
    }
    token = sign_session_token(session_id, SESSION_TTL_SEC)
    SESSIONS[session_id] = session
    _log(request, status.HTTP_201_CREATED, started)
    return Response({**session, "sessionToken": token, "expiresInSec": SESSION_TTL_SEC}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def themes(request):
    return Response({"themes": THEMES})


@api_view(["GET"])
def resolve_effect(request):
    gesture = request.query_params.get("gesture", "idle")
    theme = request.query_params.get("theme", "Rainbow")
    if gesture not in {"pinch", "open_hand", "fist", "idle"}:
        return Response({"error": "invalid gesture"}, status=status.HTTP_400_BAD_REQUEST)
    if theme not in THEMES:
        theme = "Rainbow"
    return Response(_fallback_effect(gesture, theme))


@api_view(["POST"])
def post_gesture(request):
    started = time.time()
    token_session_id = require_session(request)
    if not token_session_id:
        return Response({"error": "invalid session token"}, status=status.HTTP_401_UNAUTHORIZED)

    serializer = GestureSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    if data["sessionId"] != token_session_id:
        return Response({"error": "session mismatch"}, status=status.HTTP_403_FORBIDDEN)
    event = {
        **data,
        "receivedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    enriched = {**event, "effect": _fallback_effect(data["type"], data.get("theme"))}
    EVENTS.setdefault(data["sessionId"], []).append(enriched)
    _broadcast({"type": "effects.applied", "payload": enriched})
    _log(request, status.HTTP_202_ACCEPTED, started)
    return Response({"ok": True, "event": enriched}, status=status.HTTP_202_ACCEPTED)


@api_view(["POST"])
def post_metrics(request):
    started = time.time()
    token_session_id = require_session(request)
    if not token_session_id:
        return Response({"error": "invalid session token"}, status=status.HTTP_401_UNAUTHORIZED)

    serializer = MetricsSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    row = {**serializer.validated_data, "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    if row["sessionId"] != token_session_id:
        return Response({"error": "session mismatch"}, status=status.HTTP_403_FORBIDDEN)
    METRICS.setdefault(row["sessionId"], []).append(row)
    _log(request, status.HTTP_202_ACCEPTED, started)
    return Response({"ok": True}, status=status.HTTP_202_ACCEPTED)


@api_view(["POST"])
def post_sign(request):
    started = time.time()
    token_session_id = require_session(request)
    if not token_session_id:
        return Response({"error": "invalid session token"}, status=status.HTTP_401_UNAUTHORIZED)

    serializer = SignSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    if data["sessionId"] != token_session_id:
        return Response({"error": "session mismatch"}, status=status.HTTP_403_FORBIDDEN)

    row = {
        **data,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    SIGNS.setdefault(row["sessionId"], []).append(row)
    if len(SIGNS[row["sessionId"]]) > 200:
        SIGNS[row["sessionId"]] = SIGNS[row["sessionId"]][-200:]
    _broadcast({"type": "sign.recognized", "payload": row})
    _log(request, status.HTTP_202_ACCEPTED, started)
    return Response({"ok": True, "event": row}, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
def session_analytics(request, session_id):
    if not require_session(request):
        return Response({"error": "invalid session token"}, status=status.HTTP_401_UNAUTHORIZED)
    metrics = METRICS.get(session_id, [])
    events = EVENTS.get(session_id, [])
    signs = SIGNS.get(session_id, [])
    return Response(
        {
            "sessionId": session_id,
            "metricsCount": len(metrics),
            "eventsCount": len(events),
            "signCount": len(signs),
            "latestMetric": metrics[-1] if metrics else None,
            "latestEvent": events[-1] if events else None,
            "latestSign": signs[-1] if signs else None,
            "signTranscript": [entry["label"] for entry in signs[-20:]],
        }
    )


@api_view(["POST"])
def profile_theme(request, user_id):
    token_session_id = require_session(request)
    if not token_session_id:
        return Response({"error": "invalid session token"}, status=status.HTTP_401_UNAUTHORIZED)
    serializer = ThemeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    profile = {"theme": serializer.validated_data["theme"], "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    PROFILES[user_id] = profile
    return Response({"userId": user_id, **profile})


@api_view(["GET"])
def profile_detail(request, user_id):
    if not require_session(request):
        return Response({"error": "invalid session token"}, status=status.HTTP_401_UNAUTHORIZED)
    profile = PROFILES.get(user_id, {"theme": "Rainbow", "updatedAt": None})
    return Response({"userId": user_id, **profile})


@api_view(["POST"])
def internal_event(request):
    if request.headers.get("x-internal-token") != INTERNAL_TOKEN:
        return Response({"error": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
    payload = request.data if isinstance(request.data, dict) else {}
    _broadcast(payload)
    return Response({"ok": True})
