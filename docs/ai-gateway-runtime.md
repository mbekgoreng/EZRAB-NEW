# EZRAB AI Gateway Runtime (local development)

This runtime is a local-development prototype. Browser identity headers and browser-supplied project context are not server-authenticated ownership evidence.

## Ports and startup

| Service | Default | Health check |
| --- | --- | --- |
| Vite frontend | `5173` | browser UI |
| TypeScript AI backend | `3001` | `GET http://127.0.0.1:3001/api/ai/health` |
| FastAPI AI Core | `8000` | `GET http://127.0.0.1:8000/health` |
| Ollama | `11434` | `GET http://127.0.0.1:11434/api/tags` |

Start Ollama first, then FastAPI from `EZRAB-LOCAL-AI` (`.venv\\Scripts\\python -m uvicorn main:app --host 127.0.0.1 --port 8000`), then the existing TypeScript backend runner on port 3001, then `npm run dev`. This repository currently does not declare a backend start script or TypeScript runtime dependency; add a reviewed server runner before treating this as a reproducible production runtime.

## Environment variables

- `EZRAB_AI_CORE_URL`: backend-to-FastAPI URL; default `http://127.0.0.1:8000`.
- `EZRAB_AI_CORE_TIMEOUT_MS`: backend-to-FastAPI timeout; default 40,000 ms.
- `EZRAB_AI_CORE_SERVICE_TOKEN`: server-only shared token. Never use a `VITE_` prefix. When present, FastAPI requires it for `/api/*` requests.
- `EZRAB_AI_CORE_REQUIRE_SERVICE_TOKEN`: explicitly enables token enforcement. Enforcement also enables automatically when the token is set.
- `EZRAB_OLLAMA_URL`: FastAPI-to-Ollama URL; default `http://127.0.0.1:11434`.
- `EZRAB_OLLAMA_TIMEOUT_SECONDS`: FastAPI-to-Ollama timeout; default 35 seconds.

For local development without a token, leave `EZRAB_AI_CORE_SERVICE_TOKEN` empty and set `EZRAB_AI_CORE_REQUIRE_SERVICE_TOKEN=false`. This disables only the FastAPI service-token check and is not production safe. With a token, set the same value in the backend and FastAPI process environments; the browser never receives it.

## Limits and troubleshooting

- Browser → backend timeout: 45 seconds; backend → FastAPI: 40 seconds; FastAPI → Ollama: 35 seconds.
- JSON body is capped at 128 KiB, project context at 96 KiB, messages at 4,000 characters, and model output at 12,000 characters.
- The backend uses an in-memory 20 requests/minute/IP limiter plus an in-flight duplicate guard. It resets on restart and is not a distributed production rate limiter.
- `AI_CORE_TIMEOUT` (HTTP 504) may be retried. `AI_CORE_UNAVAILABLE` (HTTP 502) may be retried after verifying FastAPI/Ollama health. Validation and authorization failures are not retryable.

Bind FastAPI and Ollama to loopback or a private network. Do not expose port 8000/11434 publicly. A production deployment still needs server-side session authentication, trusted project ownership checks, a shared/distributed rate limiter, TLS/network policy, and removal or separate protection of legacy mutation endpoints.
