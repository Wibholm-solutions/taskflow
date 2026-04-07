# Security

## Authentication Model

TaskFlow is designed as a **single-user** application. There is no built-in authentication system.

### X-User-Id Header

The `X-User-Id` HTTP header is a **placeholder**, not a real authentication mechanism. Any client can send any value in this header. It exists to keep the data model multi-user-ready, but it provides no access control on its own.

By default, all requests are attributed to a `default` user.

### Production Deployment

For production use, deploy TaskFlow behind a **trusted reverse proxy** (e.g. Caddy, nginx, Traefik) that:

1. Handles authentication (SSO, OAuth, basic auth, client certificates, etc.)
2. Strips or overwrites the `X-User-Id` header with a verified identity
3. Blocks direct access to the TaskFlow port

### Future Multi-User Support

If multi-user support is needed, a proper authentication layer should be implemented:

- JWT or session-based authentication
- Server-side token validation in the auth middleware
- User registration and login endpoints
- Per-user data isolation enforcement at the query level

See `server/src/middleware/auth.ts` for the current auth middleware.
