# JARVIS Cloudflare Worker

This is the authenticated backend implementation for the `jarvis-memory-auth-upgrade` branch. It is not live until it is deliberately deployed to the Cloudflare Worker.

## Required Worker bindings

- Secret: `GEMINI_API_KEY`
- Secret: `TAVILY_API_KEY`
- Secret: `JARVIS_PASSWORD_HASH` — PBKDF2-SHA256, 310,000 iterations, 16-byte salt and 32-byte derived key, encoded as base64 `salt:hash`.
- Secret: `JARVIS_SESSION_SECRET` — a long random secret (the configured 64-character hex secret is suitable).
- KV namespace binding: `JARVIS_MEMORY` — keep the existing namespace so the existing `main_memory` value remains available.

Do not put any of these secrets in frontend files or commit them to GitHub.

## Deploy

1. Open the Cloudflare dashboard and select the existing `jarvis-ai-backend` Worker.
2. First save a copy of its current deployed source somewhere private as a rollback copy.
3. Open the Worker editor and replace its source with the complete contents of this file.
4. Confirm the bindings above are present. Do not create a new KV namespace if the current Worker already uses one; keep the existing `JARVIS_MEMORY` binding.
5. Save and deploy only after the frontend has been updated to use the new action-based API.

The current frontend still sends its legacy request format. Do not deploy this Worker by itself: the current app will not be compatible until the frontend integration is committed and tested.

## API

All requests are JSON POSTs to the Worker URL. The browser origin must be exactly `https://darlaniteesh86-debug.github.io`.

### Login (no bearer token)

```json
{ "action": "login", "password": "your-password" }
```

Returns a short-lived bearer token. Store only the token in the browser, never the password.

### Authenticated requests

Send `Authorization: Bearer <token>`.

- Load chat history: `{ "action": "history" }`
- Send a message: `{ "action": "chat", "message": "Hello" }`
- Save a memory item: `{ "action": "remember", "text": "The user prefers concise answers." }`

The session token expires after seven days. A new login is then required.

## Important limitations

- The login endpoint currently has no robust brute-force protection. Add Cloudflare rate limiting or Turnstile before treating this as an internet-hardened authentication system.
- Bearer tokens stored by a browser frontend are accessible to same-origin JavaScript. Preventing XSS and keeping the frontend dependencies minimal are important.
- This Worker persists one conversation history and one long-term memory for this JARVIS installation; it is not a multi-user service.
- The backend code has been added to GitHub but has not yet been deployed or tested against the live Worker.
