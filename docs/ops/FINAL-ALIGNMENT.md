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

## Production verification snapshot

| Check | Result |
|-------|--------|
| Guide video in `main` tree | Present |
| No `server/s3.js` on `main` | PASS |
| Railway live secrets | Still needs redeploy (`env=development` historically) |
| GitHub branch count | 2 |

## Commits

| Action | Hash |
|--------|------|
| `main` consolidation docs / FreeTrial / architecture | `af39763` (includes `4844d91`, `8d306a8`) |
| `android-production` Android-only rebase | `e747b74` |
