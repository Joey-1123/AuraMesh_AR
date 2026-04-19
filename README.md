# AuraMesh AR (Microservices Upgrade)

This project upgrades the original single-file AR demo into:

- A modular frontend with reliability/performance fixes
- A microservices backend behind an API gateway
- Real-time event delivery via WebSocket from the gateway

## Services

- `gateway` (port `8080`): single public entrypoint, HTTP routing, WS fan-out
- `session-service` (port `8081`): session lifecycle
- `gesture-service` (port `8082`): gesture ingest and validation
- `effects-service` (port `8083`): theme/effect resolution
- `analytics-service` (port `8084`): metrics/event collection
- `profile-service` (port `8085`): user theme preferences

## Frontend

`frontend/` contains:

- `index.html`
- `css/styles.css`
- `js/app.js`
- `js/config.js`
- `js/state.js`
- `js/ui.js`
- `js/audio.js`
- `js/effects.js`
- `js/renderer.js`
- `js/gestures.js`
- `js/mediapipe.js`
- `js/api.js`

## Fixes Implemented

- Camera and microphone/audio startup error handling
- Explicit teardown (`beforeunload`, `visibilitychange`) for camera/audio/animation/WS
- Pinch-state reset when hands disappear
- Backpressure throttle around MediaPipe inference sends
- Removed inline script/styles into modules/files
- CSP policy and explicit external script loading
- Structured metrics shipping to analytics service
- Adaptive quality mode for low-power devices

## Run with Docker Compose

```bash
docker compose up --build
```

Open:

- `http://localhost:8080/`

## Deploy to Render (Blueprint)

This repo is Render-ready with:

- `render.yaml` at repo root
- Dockerized services
- Internal private-network wiring using `fromService.property: hostport`
- Shared secret group for internal event auth

### Deploy steps

1. Push this project to GitHub.
2. In Render Dashboard, choose **New +** -> **Blueprint**.
3. Select the repo and deploy.
4. Render provisions:
   - `auramesh-gateway` (public web service)
   - `auramesh-session` (web)
   - `auramesh-gesture` (web)
   - `auramesh-effects` (web)
   - `auramesh-analytics` (web)
   - `auramesh-profile` (web)
   - `auramesh-secrets` env group with generated `INTERNAL_EVENT_TOKEN`
5. Open the `auramesh-gateway` public URL.

### Free-tier note

This Blueprint is configured for `plan: free` on all services.

Because free web services cannot receive private-network traffic, service-to-service calls are wired through each service's `RENDER_EXTERNAL_URL` (public URL) in `render.yaml`.

Expected free-tier behavior:
- Services spin down after ~15 minutes idle.
- First request after idle may take ~1 minute.
- Ephemeral filesystem and periodic restarts.
- Monthly free usage limits apply.

## Run Locally (without Docker)

Run each service directory:

```bash
npm install
npm start
```

Ports must match the defaults above.

