# Railway build failure — vite: not found

## Root cause (exact)

1. Railway’s Node provider runs the default build: **`npm run build`**.
2. `package.json` defines `"build": "vite build && …"`.
3. **`vite` is only in `devDependencies`**. With production installs (`NODE_ENV=production` / `--omit=dev`), Vite is **not** installed → `sh: 1: vite: not found`.
4. Architecture is **Vercel = frontend**, **Railway = Express API**. Railway must **not** run Vite.
5. Existing `nixpacks.toml` skip was **not** applied effectively (Railway often uses **Railpack** by default; `nixpacks.toml` is ignored unless Nixpacks is selected). `railway.toml` had **no `buildCommand`**, so the default `npm run build` still ran.

This is **not** a Mongo/Firebase failure.

## Fix

| File | Change |
|------|--------|
| `railway.toml` | Explicit `buildCommand` that skips Vite; keep `startCommand = node server/index.js` |
| `nixpacks.toml` | Install with `--omit=dev`, build phase echo-only, Node 20 |
| `package.json` | `engines.node`: `>=20 <23` (API runs on 20; Node 22 warnings were from frontend tooling) |

Vercel is unchanged — it still uses `npm run build` / Vite with `devDependencies` available in its build image.

## Node 20 vs 22

Keep **Node 20** on Railway (`.nvmrc` / Nixpacks). Express API does not require Node 22. Warnings about Node 22 come from frontend/dev packages that Railway should not build.

## Defense in depth

1. `railway.toml` `buildCommand` skips Vite.
2. `nixpacks.toml` build phase skips Vite (if Nixpacks is selected).
3. `npm run build` → `scripts/build-for-host.mjs` no-ops when any `RAILWAY_*` env is present (covers dashboard override of Build Command = `npm run build`).
4. Vercel / local still run full Vite via the same script (no `RAILWAY_*`).

Optional explicit web build: `npm run build:web`.
