# mc_sync_worker

A Cloudflare Worker that lets a small, invite-only group share a Minecraft server world without anyone holding R2 credentials. Players authenticate with a personal token obtained through a Discord slash command. The Worker enforces a single-host lock per server profile, hands out short-lived presigned URLs, and serves an admin-curated server profile (configs, mods, version pin).

This repository contains the worker and some utility scripts to register discor commands, seed e2e environment and add profile specific config and files to R2. The desktop client lives separately.

## How it works

```
Discord /getkey ──> Worker ──> issues token

Client ──(Bearer token + X-Session)──> Worker ──> lock / presigned URLs ──> R2
Client ──(presigned URL, no auth header)──────────────────────────────────> R2
```

| Piece                             | Purpose                                              |
| --------------------------------- | ---------------------------------------------------- |
| **R2 bucket** (`WORLD` binding)   | World snapshots, profile manifests and profile files |
| **KV namespace** (`USERS`)        | Token hash to `{ id, name }` records                 |
| **Durable Object** (`Lock`)       | One lease-based lock per profile                     |
| **Discord interactions endpoint** | `/getkey` issues or replaces a personal token        |

The R2 S3 keys exist only as Worker secrets. Clients never see them.

### Locking

Each profile has its own `Lock` Durable Object, so different profiles can be hosted at the same time, but each world has exactly one writer.

- `acquire` takes the lease.
- `heartbeat` renews it..
- `release` frees it. If a host crashes, the lease simply expires.
- `upload-url` and `commit` both verify the caller still holds the lock.
- The lock is bound to the user and a per-run `X-Session` id, so the same person on two machines cannot both host.
- A heartbeat that returns `409` means the lock was lost. The client must stop and warn the user.

### Storage layout (R2)

```
profiles/<name>/manifest.json        admin-published
profiles/<name>/files/<sha256>       admin-published, content-addressed
worlds/<name>/<timestamp>.zip        world snapshots
latest/<name>.json                   pointer to the current snapshot
```

A profile exists once it has a valid published manifest.

File ownership:

| Category                                           | Where              | Written by                          |
| -------------------------------------------------- | ------------------ | ----------------------------------- |
| Profile (configs, server properties, mods/plugins) | `profiles/<name>/` | Admin only, via the publish scripts |
| Session state (world, ban lists, ops, whitelist)   | World snapshot zip | The current host, under the lock    |
| Local-only (server jar, JRE, logs, `eula.txt`)     | Player's machine   | Never synced                        |

### Commit safety

A new snapshot is uploaded to a unique key first. `commit` then verifies the key belongs to the caller's profile and exists, and only then switches `latest/<name>.json`. A failed upload never replaces the current world. Old snapshots are pruned per profile.

## API

All routes except `/discord` need `Authorization: Bearer <token>`. Other routes also need an `X-Session` header (generated once per client run).

| Route                          | Description                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `POST /discord`                | Discord interactions endpoint (signature verified)                                |
| `GET /me`                      | Returns the identity behind the token. Use it to validate a pasted token          |
| `GET /profiles`                | Lists profiles with `mc_version`, `type` and `locked_by`                          |
| `GET /p/<profile>/profile`     | Manifest with presigned URLs for each profile file                                |
| `GET /p/<profile>/latest`      | Pointer to the latest snapshot plus a presigned download URL                      |
| `POST /p/<profile>/lock`       | Acquire the lock                                                                  |
| `POST /p/<profile>/heartbeat`  | Renew the lease                                                                   |
| `POST /p/<profile>/upload-url` | Presigned PUT URL for a new snapshot (requires the lock)                          |
| `POST /p/<profile>/commit`     | Make an uploaded snapshot the latest (body `{ "key": "..." }`, requires the lock) |
| `POST /p/<profile>/release`    | Release the lock                                                                  |

## Environments

| Environment | Worker       | Command              | Purpose                        |
| ----------- | ------------ | -------------------- | ------------------------------ |
| default     | `mcsync`     | `npm run deploy`     | Production                     |
| `e2e`       | `mcsync-e2e` | `npm run deploy:e2e` | Staging and end-to-end testing |

Each environment has its own R2 bucket, KV namespace and Durable Object namespace, plus its own secrets, so tests can never touch production data or locks.

> **All `e2e:*` tests run against the deployed `e2e` environment.**

## Setup

### Prerequisites

- Node.js 22+
- A Cloudflare account with R2 enabled
- A Discord application (one for production, a separate one for e2e)

### Install

```bash
npm install
npx wrangler login
```

### Cloudflare resources

Create these once per environment:

1. An R2 bucket (public access off) and an R2 S3 API token scoped to that bucket only (Object Read & Write).
2. A KV namespace for `USERS`.
3. Put the bucket name, KV id, account id and other non-secret values in `wrangler.toml`. Use a different KV namespace and bucket for `e2e`.

### Secrets

Set per environment (they are stored encrypted and survive deploys):

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_ROLE_ID

# e2e
npx wrangler secret put R2_ACCESS_KEY_ID --env e2e
npx wrangler secret put R2_SECRET_ACCESS_KEY --env e2e
npx wrangler secret put DISCORD_PUBLIC_KEY --env e2e
npx wrangler secret put DISCORD_ROLE_ID --env e2e
```

For local dev, put test values in `.dev.vars`.

### Vars (`wrangler.toml`)

| Var             | Meaning                                              |
| --------------- | ---------------------------------------------------- |
| `R2_ACCOUNT_ID` | Cloudflare account id, used to build the S3 endpoint |
| `R2_BUCKET`     | Bucket name used when presigning                     |
| `KEEP_VERSIONS` | World snapshots kept per profile                     |

## Scripts

### Development

| Script              | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`       | Runs the Worker locally with simulated bindings (`wrangler dev`)                 |
| `npm run dev:e2e`   | Runs the Worker locally against the **real** e2e bindings (`--env e2e --remote`) |
| `npm run typecheck` | Type-checks with `tsc --noEmit` (Wrangler does not type-check)                   |
| `npm test`          | Runs the unit tests (Jest)                                                       |

### Deployment and logs

| Script                     | What it does                                                        |
| -------------------------- | ------------------------------------------------------------------- |
| `npm run deploy`           | Deploys to **production** (`--env=""` selects the top-level config) |
| `npm run deploy:e2e`       | Deploys to the e2e environment                                      |
| `npm run log`              | Tails production logs                                               |
| `npm run log:e2e`          | Tails e2e logs                                                      |
| `npm run register:discord` | Registers the Discord slash commands                                |

### Profile management

A profile is a folder of server files plus a manifest. Generating hashes the files and builds `manifest.json`; publishing uploads the files to `profiles/<name>/files/<sha256>` and the manifest to `profiles/<name>/manifest.json`. These scripts use the R2 S3 credentials (via `@aws-sdk/client-s3`), not the Worker.

| Script                          | What it does                                     |
| ------------------------------- | ------------------------------------------------ |
| `npm run generate:p:vanilla`    | Generates the manifest for the `vanilla` profile |
| `npm run generate:p:test`       | Generates the manifest for the `test` profile    |
| `npm run publish:p:vanilla`     | Publishes `vanilla` to production R2             |
| `npm run publish:p:vanilla:e2e` | Publishes `vanilla` to the e2e bucket            |
| `npm run publish:p:test:e2e`    | Publishes `test` to the e2e bucket               |

Typical flow: edit files, generate the manifest, publish to e2e, test, then publish to production. Players pick up changes on their next launch because the client syncs by hash.

To add a profile, create directory `profiles/<name>`, then create the `base.json`, create your local server directory and configure your server locally. Add your generate/publish profile script to `package.json` and run them.

### End-to-end tests

These run against the deployed e2e environment. Run `npm run deploy:e2e` first.

| Script                  | What it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `npm run seed:e2e:auth` | Seeds the e2e test user and token into the e2e KV    |
| `npm run e2e:auth`      | Test auth works                                      |
| `npm run e2e:lock`      | Full lock flow (acquire, heartbeat, release)         |
| `npm run e2e:lock:a`    | Acquire cases only                                   |
| `npm run e2e:lock:h`    | Heartbeat cases only                                 |
| `npm run e2e:lock:r`    | Release cases only                                   |
| `npm run e2e:latest`    | Latest-snapshot pointer and download URL             |
| `npm run e2e:commit`    | Upload URL and commit flow, including key validation |
| `npm run e2e:profile`   | Profile manifest endpoint                            |

## Project layout

```
src/
  index.ts      routing
  auth.ts       token lookup
  discord.ts    /getkey interaction handler
  lock.ts       Lock Durable Object + lockCall
  world.ts      latest / upload-url / commit
  profile.ts    manifest validation, profile listing and download
  r2.ts         presigning
  types.ts      shared types
scripts/        profile generate/publish, Discord registration, e2e seeding
test/e2e/       end-to-end tests (run against the e2e environment)
```
