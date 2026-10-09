# Deployment

The public application is at **https://carebuddy.life/**. Nginx serves HTTPS and proxies application requests to the Express process, which serves the React build and care APIs. The backend listens on port 3000 by default.

## Build a release

Use Node.js 24 and install dependencies from the lockfile:

```sh
npm ci
npm run build -w shared
npm test
npm run build:public-demo
npm run build:backend
```

The public-demo build sets `VITE_BUDDY_BACKEND_URL=/` and `VITE_PUBLIC_DEMO=true` for same-origin API calls and fictional demo initialization.

## Runtime files and configuration

Deploy the frontend `dist/`, backend and shared packages (including their compiled `dist/` directories), workspace manifests/lockfile and runtime dependencies. Keep `agent-plugin/` beside `backend/`; the export service reads those templates at runtime.

Configure the backend process:

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend listen port; default `3000` |
| `STATIC_DIR` | Absolute path to the frontend build |
| `DB_DIR` | Persistent directory containing `care-buddy.db` |
| `TOKENHUB_BASE_URL` | Account's HTTPS TokenHub endpoint ending in `/v1` |
| `TOKENHUB_MODEL` | Account's selected model ID |
| `TOKENHUB_API_KEY` | Private backend credential |

When starting through `npm run start:backend`, the default static and database directories resolve to the project-root `dist/` and `data/`. Use explicit absolute paths for a service deployment. Provider configuration is documented in [TokenHub setup](docs/tokenhub.md).

An example systemd service uses an existing private environment file and project-relative runtime layout:

```ini
[Service]
WorkingDirectory=/srv/carebuddy/backend
ExecStart=/usr/bin/node /srv/carebuddy/backend/dist/index.js
Environment=PORT=3000
Environment=STATIC_DIR=/srv/carebuddy/dist
Environment=DB_DIR=/var/lib/carebuddy
EnvironmentFile=/etc/care-buddy-tokenhub.env
Restart=on-failure
```

Adapt these example paths to the host. Keep the persistent database and credentials outside release replacement. Create a SQLite-consistent backup before deployment, stage the build, then switch/restart the existing service and verify the application.

## HTTPS and verification

The existing Nginx application route proxies to the backend:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Retain the host's TLS configuration. Check:

```sh
curl --fail https://carebuddy.life/api/health
```

Then open Today, review weather/sleep/health, and test a supported Buddy change with an isolated fictional care space. Verify the saved receipt and reload persistence. A health-status response alone does not prove provider access or care writes.

## Submission video hosting

The submission playback page is hosted separately from application releases at `/submissions/carebuddy-2026/`. Copy `submissions/carebuddy-2026/public/` to the static submission directory while preserving relative symlinks.

The existing server uses this route before its application proxy:

```nginx
location ^~ /submissions/carebuddy-2026/ {
    alias /var/www/carebuddy-submissions/carebuddy-2026/;
    index index.html;
    autoindex off;
    add_header X-Content-Type-Options nosniff always;
    add_header Cache-Control "public, max-age=300" always;
    limit_except GET HEAD { deny all; }
}
```

The MP4 uses H.264/AAC and byte-range seeking. The [submission guide](submissions/carebuddy-2026/README.md) contains the media manifest and rebuild commands.
