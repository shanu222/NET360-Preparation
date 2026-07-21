# Branch comparison & cleanup report (web-production phase)

Date: 2026-07-22  
Working branch: **`web-production` only**

## Active branches to keep

| Branch | Reason |
|--------|--------|
| `main` | Default / integration |
| `web-production` | Production web + Railway API line (this phase) |

## Branches that MUST NOT be deleted yet (unique commits)

| Branch | Unique work not fully in `web-production` | Evidence |
|--------|-------------------------------------------|----------|
| `admin-subscriptions-professional` | Paid-services / admin subscription UX (~3k LOC) | 13 commits ahead |
| `deploy-main-search-fix` | Subscription UI expiry tabs + admin search | 14 commits ahead |
| `prod-paid-services` | Paid-services backend/UI | 8 commits ahead |
| `android-build` | FreeTrial ledger + Android-specific divergence | `FreeTrialLedger.js`, large diff |
| `android-production` | Android production line (parallel cherry-picks + possible drift) | Keep until Android cutover plan |

Deleting these would **lose unique production work**. Merge plan into `web-production`/`main` is a **separate** task.

## Temporary branches (safe to remove after this report)

Equivalent Railway migration / health / guide-video work already exists on `web-production` via cherry-picks:

| Branch | Action |
|--------|--------|
| `fix/railway-health-production` | Delete local + remote |
| `fix/production-stabilization-guide-video` | Delete local + remote |
| `migration/railway-mongodb-phase-1` | Delete local + remote |

## Local worktree note

Branches checked out in other worktrees (`main`, `android-*`, etc.) cannot be deleted from this worktree until those worktrees are removed.

## Recommendation

**Do not** reduce GitHub to only `main` + `web-production` until unique admin/paid-services and Android FreeTrial work is merged or explicitly abandoned by product owners.
