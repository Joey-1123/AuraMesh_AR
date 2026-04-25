# AuraMesh AR

Gesture-driven AR frontend with a Django REST backend and websocket event stream.

## Stack

- Frontend: vanilla HTML, CSS, JavaScript
- Backend: Django REST Framework + Channels
- Runtime: one ASGI service on Render or Docker

## Run locally

```bash
docker compose up --build
```

Open:

- `http://localhost:8080/`

## Render

This repo is configured for one Render web service:

- `auramesh-django`

Use [render.yaml](./render.yaml) at the repo root.

## API

- `POST /v1/sessions`
- `POST /v1/events/gesture`
- `POST /v1/events/sign`
- `POST /v1/analytics/metrics`
- `GET /v1/analytics/session/<session_id>`
- `GET /v1/themes`
- `GET /v1/effects/resolve`
- `POST /v1/profiles/<user_id>/theme`
- `GET /v1/profiles/<user_id>`
- `GET /health`

Sign language support:

- live static-sign classification from webcam hand landmarks
- sign transcript in the HUD
- sign events recorded in session analytics

## WebSocket

- `/ws`
