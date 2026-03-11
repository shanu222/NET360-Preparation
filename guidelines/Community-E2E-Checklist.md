# Community E2E Checklist (Web + Android Parallel)

## Scope
Validate these Community flows end-to-end:
- Fuzzy user search
- Connection state UX (Connected / Pending)
- Realtime discussion room sync
- Quiz async flow (deferred/offline style)
- Quiz live flow (simultaneous with realtime progress)
- Messages send/receive (including Android send path)

## Prerequisites
- Two student accounts: `User A`, `User B`
- One web session (User A)
- One Android app session (User B)
- Both sessions authenticated and opened to Community
- Backend reachable from both clients

## Test Data Setup
1. Ensure `User A` and `User B` have Community profile saved (username, city optional).
2. Keep both users on the Community screen throughout tests.
3. Clear stale challenge noise:
   - decline old pending challenges
   - finish/ignore old test data only if needed

## Pass/Fail Rules
- Pass: update appears on opposite client within 1-5 seconds (without manual refresh), or after single auto-refresh cycle.
- Fail: update missing, wrong state shown, duplicated actions allowed, or errors/toasts indicate API failure.

---

## Phase 1: Fuzzy Search + Connection State

### 1.1 Fuzzy Search
1. On web (`User A`), open Discover Students.
2. Search by partial username fragment of `User B` (example: `ali` from `ali_khan`).
3. Search by partial first name and last name as separate attempts.

Expected:
- `User B` appears in results for partial username and name matches.
- Result ranking prefers closer matches.

### 1.2 Connection Request + State Lock
1. On web (`User A`), send connection request to `User B`.
2. Immediately try sending again from:
   - Discover list
   - Study Partners card
3. On Android (`User B`), verify incoming request appears.
4. Accept on Android.
5. On web (`User A`), verify state updates to `Connected`.

Expected:
- Duplicate request actions are blocked.
- Buttons show `Request Pending`/`Request Received` correctly before accept.
- After accept, both sides show connected status.

---

## Phase 2: Discussion Room Realtime

### 2.1 Post Sync
1. On web (`User A`), open a room (e.g., physics).
2. Create a post with unique marker text: `E2E-POST-<timestamp>`.
3. On Android (`User B`), in same room, wait for sync.

Expected:
- New post appears on Android without manual full reload.

### 2.2 Reply + Upvote Sync
1. On Android (`User B`), reply to that post with marker: `E2E-REPLY-<timestamp>`.
2. On web (`User A`), verify reply appears.
3. On web, upvote post and reply.
4. On Android, verify upvote counts change.

Expected:
- Reply and upvote changes propagate quickly and consistently.

---

## Phase 3: Messages (Android Send Path)

### 3.1 Android -> Web
1. Open Messages tab on both clients for same connection.
2. Send message from Android: `E2E-MSG-ANDROID-<timestamp>`.
3. Verify web receives it.

### 3.2 Web -> Android
1. Send message from web: `E2E-MSG-WEB-<timestamp>`.
2. Verify Android receives it.

### 3.3 Rapid Tap Guard
1. On Android, type one short message.
2. Tap Send rapidly 3-5 times.

Expected:
- Exactly one message sent.
- Send button shows in-flight state and prevents dupes.

---

## Phase 4: Async Quiz Challenge

### 4.1 Create + Notify
1. On web (`User A`), create challenge type `Async` to `User B`.
2. On Android (`User B`), verify pending async challenge appears.
3. Verify in-app toast for incoming async challenge.

Expected:
- Incoming async challenge visible with correct metadata.
- Notification toast appears once (no spam duplicates).

### 4.2 Accept + Deferred Attempt
1. Accept async challenge on Android.
2. Verify `User A` receives accepted-response toast.
3. Wait ~30-60s before starting attempt (deferred behavior).
4. Complete attempt on Android.
5. Complete attempt on web.

Expected:
- Async challenge remains valid and completable by both users.
- Final winner calculation correct (score, then time tie-breaker).

---

## Phase 5: Live Quiz Challenge (Server-Locked)

### 5.1 Create + Accept Live
1. On web (`User A`), create challenge type `Live` to `User B`.
2. On Android (`User B`), accept immediately.
3. Both enter Battle Arena.

Expected:
- Status moves to `in_progress`.
- Timer active.

### 5.2 Per-Question Lock + Progress
1. On both sides, answer different subsets of questions.
2. Observe realtime progress counters (answered/opponent answered).
3. On one side, change answer for a question already clicked.

Expected:
- First synced answer is locked server-side.
- Progress updates reflect server-validated counts.
- Attempted changes after lock do not unfairly alter locked correctness.

### 5.3 Submit + Outcome
1. Submit from Android first, then web.
2. Verify completed state and winner.

Expected:
- Winner uses total score, then elapsed-time tie-break.
- Completed payload reveals correct final values for both users.

---

## Quick Failure Capture Template
When anything fails, capture and share:
1. Step ID (example: `4.2`)
2. Client where failure occurred (web/android)
3. Exact action performed
4. Actual result vs expected result
5. Screenshot and timestamp

---

## Fast Triage Map
- Search mismatch: check `/api/community/users/search` query + returned `connectionStatus`.
- Duplicate connect allowed: verify backend guard in `/api/community/connections/request`.
- Realtime missed updates: validate SSE `/api/stream` connectivity and sync events.
- Live quiz inconsistency: inspect `/api/community/quiz-challenges/:id/progress` and locked answers persisted in challenge result.
- Android message send issue: inspect send button in-flight state and `/api/community/messages/:connectionId` response.

---

## Exit Criteria
Release-ready when all phases pass on:
- Web (User A)
- Android (User B)
- Re-run of Phase 5 live challenge once more to rule out race conditions
