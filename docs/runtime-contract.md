# taskflow runtime contract

Version: `1.0.0`

This application-owned contract defines the interface a deployment authority
may rely on. Server-specific ports, paths, image digests, and secret references
belong in the infrastructure repository.

## Image and process

- Image package: `ghcr.io/wibholm-solutions/taskflow`
- Container process: `node dist/server/index.js`
- Architecture: Linux `amd64`
- Listen port: TCP `3000` by default, from `PORT`
- Base path: `/todo` in the published image
- Health endpoint: `GET ${BASE_PATH}/api/health`, so `/todo/api/health` as shipped

The health response is `{"status":"ok","version":"<YYYY-MM-DD>"}`. Deployment
verification must require HTTP `200` and the JSON field `status` equal to `ok`.

**Do not treat `version` as a release identifier.** It is
`new Date().toISOString().slice(0, 10)`, computed at request time, so it reports
the day the request was served and says nothing about which image is running.
The deployed identity is the digest in `desired-state.json`, not this field.

The base path is baked in at **build** time as well as read at runtime: the CI
workflow passes `--build-arg BASE_PATH=/todo` so the client's asset base agrees
with the server's routing. Both halves must agree, because the reverse-proxy
route keeps the prefix rather than stripping it. Changing the base path is a
rebuild, not a configuration change.

## Configuration

| Variable | Required | Contract |
| --- | --- | --- |
| `PORT` | no | Defaults to `3000`; production wiring should leave it there. |
| `DATABASE_PATH` | yes in production | Absolute path to the SQLite database inside the container. Production wiring uses `/app/data/taskflow.db`. The default, `./data/taskflow.db`, is relative to the working directory. |
| `BASE_PATH` | yes | Must match the value the image was built with. `/todo` as published. |

No other variable is read by runtime code. `NODE_ENV` is set in deployment but
is not read anywhere in this application's own source; `HOST_PORT` is consumed
by Compose for host-side port mapping and never reaches the application.
`VITE_FEEDBACK_REPO` and `VITE_FEEDBACK_API_URL` are build-time client values,
not runtime configuration.

Note a discrepancy this contract resolves in favour of the code: the README and
`.env.example` state the `BASE_PATH` default as `/`, while the server's actual
fallback is `/todo`. The Dockerfile's build-time default is `/`. The published
image is built with `/todo`, and that is the value this contract fixes.

## Persistent state and rollback

The application owns persistent state: a SQLite database at `DATABASE_PATH`, in
**WAL** journal mode with foreign keys enabled. Production backs it with a
directory mounted at `/app/data`, so the data survives container replacement. A
deployment must preserve that mount; replacing it destroys application data.

Because the database survives the container, the WAL must be checkpointed before
the data is moved or copied, or the newest writes are left behind.

The schema is created and amended **at startup**, not by a migration tool:
`CREATE TABLE IF NOT EXISTS` for `tasks` and `subtasks`, followed by a guarded
`ALTER TABLE tasks ADD COLUMN sort_order` when that column is absent. Every
change to date is additive, which is what makes rollback safe today: an older
image meets a database with an extra column it ignores.

Version `1.0.0` permits automatic rollback between images whose schema changes
are additive in exactly that sense. A release that drops or rewrites a column,
changes a column's meaning, or otherwise makes the schema unreadable to the
previous image must increment the contract version, declare the change as an
irreversible change in the deployment verification contract, and be reviewed
before promotion. A release that changes the port, base path, health endpoint or
required configuration must do the same.
