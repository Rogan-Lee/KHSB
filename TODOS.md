# TODOS

## P1 — Critical (do these first)

### [P1] Switch from `prisma db push` to `prisma migrate dev`
**What:** Replace `db push` with `prisma migrate dev` for all schema changes.
**Why:** `db push` has no migration history. A failed schema change on production requires manual SQL recovery. With 1 paying customer in production, this is an incident waiting to happen.
**Pros:** Reversible schema changes, reviewable SQL, Vercel auto-runs migrations on deploy.
**Cons:** Slightly more workflow overhead per schema change.
**Context:** The codebase currently has no migration history. Before any future schema changes (including the Google Calendar/Sheets per-facility work), run `prisma migrate dev --name init` to baseline the current schema.
**Effort:** S (human: 2h / CC: ~10 min)
**Blocked by:** Nothing — do first.

### [P1] Observe current customer usage for 30 days
**What:** (1) Add Vercel Analytics to capture page views. (2) Schedule a 30-minute call with the customer: "What do you open first every morning? What's missing? What's confusing?"
**Why:** Depth First strategy depends on knowing which 3 features drive retention. 99 files changed, but unknown which are actually used daily.
**Pros:** Informs every future product decision. Prevents building unused features.
**Cons:** Takes time before acting.
**Context:** Add `@vercel/analytics` (1 line: `import { Analytics } from "@vercel/analytics/react"` in layout.tsx). Then observe for 30 days before making any significant product changes.
**Effort:** XS for analytics (CC: ~5 min). Call: 1 hour of your time.
**Blocked by:** Nothing — do this week.

### [P1] Create acquisition playbook before customer #2
**What:** (1) A 2-minute demo flow (screen recording or live walkthrough). (2) A simple pricing page. (3) A referral ask to the current customer.
**Why:** "5-10 facilities in 12 months" has no path to 5-10 facilities. Korean study room operators buy via word-of-mouth and KakaoTalk referrals — not SaaS directories.
**Pros:** The current customer is your best salesperson. One referral ask could unlock 2-3 facilities immediately.
**Cons:** None — this costs almost nothing.
**Context:** Your story: "You're probably using Excel and Kakao. This replaced a $160/month LMS for our first customer. It's built specifically for 관리형 독서실 directors."
**Effort:** S (human: 1 day / CC: ~30 min for materials)
**Blocked by:** Vercel Analytics data (observe first to know which features to demo).

### [P1] ~~Set up vitest + write 5 critical path tests + GitHub Actions CI~~ ✅
**Completed:** v0.1.1.0 (2026-03-27)
5 test files, 16 tests, vitest, GitHub Actions CI (.github/workflows/test.yml) all shipped.

## P2 — Important (do after P1s)

### [P2] Fix DailyOuting ownership check (security)
**What:** `updateDailyOuting` / `deleteDailyOuting` / `createDailyOuting` accept raw `id`/`studentId` with no authorization check that the caller manages that student. Any authenticated user can update/delete any outing record.
**Fix:** Fetch the record first, assert `session.user` has access to the `studentId`. Same pattern as `assertDirector`.
**Effort:** XS (CC: ~10 min)
**Blocked by:** Nothing.

### [P2] Fix daysSinceLast timezone (off-by-1 on KST boundary dates)
**What:** `getWeeklyPlanData` uses `.setHours(0,0,0,0)` (server local TZ) instead of `.setUTCHours(0,0,0,0)` when computing `daysSinceLast`. On Vercel (UTC), this gives wrong results for KST midnight sessions.
**Fix:** Replace `new Date(lastDate).setHours(0,0,0,0)` with `new Date(lastDate).setUTCHours(0,0,0,0)` in `mentoring-plan.ts`.
**Effort:** XS (CC: ~5 min)
**Blocked by:** Nothing.

### [P2] Fix getMeritsByRange timezone-naive boundary
**What:** `new Date(from)` produces UTC midnight = KST 09:00. `toDate.setHours(23,59,59,999)` uses server TZ (UTC on Vercel). First/last day records may be cut off for KST users.
**Fix:** Use `new Date(from + "T00:00:00Z")` and `new Date(to + "T23:59:59.999Z")`.
**Effort:** XS (CC: ~5 min)
**Blocked by:** Nothing.

### [P2] Prevent duplicate mentoring entries on double-click
**What:** `scheduleWeeklyMentoring` unconditionally calls `prisma.mentoring.create` — rapid double-click or concurrent sessions can create two `SCHEDULED` rows for the same student+mentor+date.
**Fix:** Add `@@unique([studentId, mentorId, scheduledAt])` to the Prisma schema, or use `upsert`.
**Effort:** XS (CC: ~10 min)
**Blocked by:** `prisma migrate` (P1) — schema change requires migration.

### [P2] Add error tracking (Sentry or Vercel Error Tracking)
**What:** Integrate Sentry (free tier) or Vercel's built-in error tracking.
**Why:** Currently, if a Server Action throws for a user, you only find out if they report it. Can't distinguish "no bugs" from "nobody told me."
**Pros:** Captures every unhandled exception with stack trace, user context, frequency. Essential for debugging post-ship.
**Cons:** Sentry has a learning curve; Vercel's built-in is simpler but less powerful.
**Context:** Start with Vercel's built-in error tracking (already available in dashboard). Upgrade to Sentry if you need more detail.
**Effort:** S (human: 2h / CC: ~15 min)
**Blocked by:** Nothing.

### [P2] Add try/catch around Prisma calls in critical Server Actions
**What:** Wrap DB operations in createStudent, upsertAttendance, createMentoring, and other write actions with try/catch. Log errors with context (what operation, what user, what data).
**Why:** Currently, any DB error throws an unhandled exception → generic 500 page for the user. No logging of what failed.
**Pros:** Better error messages, structured logs, easier debugging.
**Cons:** More verbose code.
**Context:** Pattern: `try { await prisma.xxx } catch (e) { console.error("[createStudent] failed", { userId: session.user.id, error: e }); throw new Error("학생 등록에 실패했습니다. 다시 시도해주세요."); }`
**Effort:** M (human: 1 day / CC: ~20 min)
**Blocked by:** Error tracking setup (P2 above — so you can see the logs).

### [P2] Infrastructure isolation for customer #2 (separate Vercel+Neon)
**What:** When onboarding customer #2, deploy a separate Vercel project pointing to a separate Neon database. Document the setup steps.
**Why:** No multi-tenancy in the schema. Infrastructure isolation is the chosen approach for now — zero code risk, each facility gets its own DB.
**Pros:** Immediate isolation, no code changes, each facility can have different versions deployed.
**Cons:** Ops burden grows at 5+ customers. Each facility needs separate environment variables, separate Clerk instance, separate deploy.
**Context:** At 5+ facilities, evaluate whether schema-level multi-tenancy (facilityId) is worth implementing. By then you'll understand the data model differences between facilities.
**Effort:** S per customer (human: 2h / CC: ~30 min)
**Blocked by:** Customer #2 arrival.

### [P2] Investigate Kakao Friends API TOS for commercial use
**What:** Review Kakao's Terms of Service for using the personal Friends API in a commercial SaaS product.
**Why:** Kakao Friends API is designed for personal use. Commercial messaging may violate TOS. If revoked, the parent report "wow point" breaks silently with no fallback.
**Pros:** Catches a potential shutdown risk before customer #2.
**Cons:** May find that Kakao BizChannel (paid) is required, adding cost.
**Context:** Current implementation uses personal OAuth per director. Risk: Kakao can revoke tokens without notice. Alternative if TOS is a problem: Kakao BizChannel (business messaging), or reframe as "the director manually shares the link via KakaoTalk" (no API at all).
**Effort:** XS (30 min research)
**Blocked by:** Nothing — do before customer #2.

### [P2] Document infra isolation runbook for customer #2
**What:** Write a step-by-step runbook: how to deploy a new Vercel project + Neon DB instance for each new customer.
**Why:** Infrastructure isolation is the chosen multi-tenancy strategy. Without a runbook, onboarding customer #2 requires 2 hours of figuring it out from scratch each time.
**Pros:** Consistent setup, less ops burden per customer.
**Cons:** Runbook can become stale.
**Context:** Runbook should cover: (1) create Neon DB, (2) create Vercel project, (3) set env vars (DATABASE_URL, CLERK keys, GROQ key, Google OAuth, Kakao keys), (4) `prisma migrate deploy`, (5) seed admin user. At 5+ customers, evaluate CLI automation.
**Effort:** S (human: 2h / CC: ~30 min)
**Blocked by:** Customer #2 arrival.

## P3 — Track (low urgency)

### [P3] Add a parent report expiry/revocation mechanism
**What:** Add `expiresAt` field to ParentReport and StudyPlanReport. Allow directors to revoke shared links.
**Why:** Currently, report tokens (cuid) are valid forever. A parent who receives a report link can access it indefinitely. Minor privacy concern.
**Effort:** S (human: 4h / CC: ~20 min)
**Blocked by:** Nothing.

### [P3] Add Vercel Analytics page view tracking to identify hot features
**What:** `import { Analytics } from "@vercel/analytics/react"` in layout.tsx. Review weekly which pages are most visited.
**Why:** Feeds the Depth First strategy. Know which 3 features to polish.
**Effort:** XS (CC: ~5 min)
**Note:** Being done in this session as part of the "Observe usage" P1 task.

## NOT in scope (reviewed, explicitly deferred)

- Schema-level multi-tenancy (facilityId): Deferred — using infrastructure isolation instead until 5+ customers where the patterns become clear.
- Kakao AlimTalk / BizMessage API: Not needed — Web Share + Kakao Friends API covers the current use case with no business registration required.
- Full test suite: 5 critical path tests being added now. Full coverage deferred.
- Staging environment: Deferred — at 1 customer with infrastructure isolation, just deploy to a separate Vercel project for testing.
- UI/UX polish: Deferred — observe usage first to know what to polish.
