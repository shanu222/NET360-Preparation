# Final repository alignment (2026-07-22)

## GitHub branches (only)

| Branch | Tip | Purpose |
|--------|-----|---------|
| `main` | `af39763` | Full production web + Express API + Railway/Vercel/Mongo/Firebase |
| `android-production` | `e747b74` | `main` + **Android-only** deltas |

## `android-production` vs `main` (verified paths only)

- `android/**` (manifests, icons, gradle, google-services, network security)
- `capacitor.config.json` (Google OAuth navigation + SocialLogin)
- `public/.well-known/assetlinks.json`
- `scripts/merge-android-vite-env.mjs`, `mobile-build-android.mjs`, `validate-mobile-env.mjs`
- `package.json` / lock: adds `@capgo/capacitor-social-login` only

No exclusive backend/web/Railway/Mongo/Firebase Admin changes remain on `android-production`.

## Rebuild method (verified)

1. Reset `android-production` to `origin/main`.
2. Restore Android paths from previous tip `09b3d65`.
3. Force-with-lease push.

## Local folders

| Path | Status |
|------|--------|
| `D:\NET360\NET360-Preparation` | **Canonical** — keep |
| `D:\NET360\.vscode` | Keep |
| `D:\NET360\net360-release-key.jks` | Keep |
| `NET360-admin-refactor` | **Deleted** |
| `NET360-main-push` | **Locked by process** — delete after closing IDE handles |

## Production verification snapshot (2026-07-22)

| Check | Result |
|-------|--------|
| Guide video on Vercel | **PASS** — `200` `video/mp4` (~18MB) |
| www.net360preparation.com | **PASS** — `200` |
| `api.net360preparation.com` | **FAIL** — connect timeout (DNS/cutover) |
| `*.up.railway.app` default | **FAIL** — `Application not found` (service URL may have changed) |
| Guide video in `main` tree | Present |
| No `server/s3.js` on `main` | PASS |
| GitHub branches | **PASS** — only `main` + `android-production` |
| Local branches | **PASS** — only `main` + `android-production` |
| Local folders | **PARTIAL** — empty locked stub `NET360-main-push` remains |

## Commits

| Action | Hash |
|--------|------|
| `main` tip | `269b0d0` |
| Prior consolidation / FreeTrial / architecture | `af39763`, `4844d91`, `8d306a8` |
| `android-production` Android-only rebase | `e747b74` |
| `android-production` tip (merged main docs) | `1cf30a4` |
