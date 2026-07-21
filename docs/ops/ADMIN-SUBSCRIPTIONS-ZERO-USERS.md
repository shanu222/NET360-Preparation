# Admin Subscriptions — zero users root cause & fix

Date: 2026-07-22

## Execution chain

```
AdminApp Subscriptions UI
  → GET /api/admin/subscriptions/management/users?page&pageSize[&showAll|&q]
  → authMiddleware + requireAdmin
  → fetchAdminManagedUsers()
      → getGlobalAccessGrantSnapshot()
      → optional ensureCentralizedAppUsersSync() (only when sync=true / Sync button)
      → buildSubscriptionManagementSearchFilter(q)
      → UserModel.find({ role: { $ne: 'admin' }, ...search })  // collection: users
      → UserModel.countDocuments(...)
      → CommunityProfileModel.find(...)
      → map entitlements / badges
  → JSON { users, totalMatched, ... }
```

Sync button:

```
POST /api/admin/subscriptions/management/sync-firebase-users
  → ensureCentralizedAppUsersSync({ force: true })
  → firebaseAdminAuth.listUsers() pages
  → UserModel.findOne / create / updateOne
```

## Root cause

1. **Silent empty fallback (primary):** Admin bootstrap used `fetchAdminBootstrapStep` with an **8s** timeout. `/api/admin/subscriptions/management/users` often exceeds 8s under parallel admin load. On timeout the UI **swallowed the error** and applied `{ users: [], totalMatched: 0 }` → “Matched users: 0”.

2. **Filter reload amplified it:** Changing Show All / search re-ran **full** `loadAdminData` (all heavy endpoints) under the same 8s budget, so Show All still appeared empty.

3. **Over-narrow authProvider filters (secondary):** `/api/admin/users`, subscription overview counts, and `/api/admin/subscriptions/users` required `authProvider: 'firebase'`, hiding legacy `local` / other provider rows from related admin views. Management list already used `role: { $ne: 'admin' }` only.

4. **Weak search:** Partial email used a prefix-only regex (`^query[^@]*@`) and omitted `displayName`.

## Fix

- Dedicated `loadSubscriptionManagementUsers` with **30s** timeout + retry; filter changes no longer depend on full bootstrap.
- Bootstrap step for managed users also uses 30s.
- Surface backend `warning` toasts; detect Mongo query timeouts instead of returning silent zeros.
- Search includes name / displayName / email substring / firebaseUid prefix.
- Count all non-admin users in overview / users list / subscription users.
- Mongo connect logs `db` + `host` (no credentials).

## API contracts

Paths and response shapes unchanged (optional `warning` field only). Android unaffected.
