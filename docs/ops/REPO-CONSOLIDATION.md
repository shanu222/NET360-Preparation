# Repository consolidation report

Date: 2026-07-22

## Preserved onto `main`

| Source | Action | Result commit |
|--------|--------|---------------|
| `web-production` tip cleanup | cherry-pick `6d6dbee` | `8d306a8` |
| `android-build` FreeTrial ledger | cherry-pick `02b0f9a` | `4844d91` |
| Railway / AWS / guide video / Firebase | already on `main` | `e6650ec` and ancestors |
| Paid-services / admin-search | already on `main` | e.g. `02c68b3`, `1fd960f` |

## Preserved onto `android-production`

| Source | Action | Result |
|--------|--------|--------|
| FreeTrial ledger | cherry-pick `02b0f9a` | `09b3d65` |

## Not merged (would regress)

| Branch | Reason |
|--------|--------|
| `admin-subscriptions-professional` tip tree | Diff vs `main` **re-adds** `server/s3.js`, upload middleware, removes guide video / Railway config. Unique commit *patches* already on `main` (identical `git patch-id` to `1fd960f` / `7b570e6`). |

## Canonical remotes after cleanup

- `main`
- `android-production`
