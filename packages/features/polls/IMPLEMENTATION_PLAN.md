# Polls implementation plan (to feature completeness)

This plan extends the current poll backend foundation into a production-ready Doodle-style experience while preserving Cal.com conventions and minimizing risk to existing booking flows.

## Current baseline (already implemented)

- Poll domain schema exists (`Poll`, `PollOption`, `PollParticipant`, `PollVote`) in `packages/prisma/schema.prisma`.
- Poll consensus logic exists (`MANUAL`, `MAJORITY`, `UNANIMOUS`) in `packages/features/polls/lib/poll-consensus.ts`.
- Poll repository/service skeleton exists in `packages/features/polls/repositories/PollRepository.ts` and `packages/features/polls/services/PollService.ts`.
- Poll TRPC routes are wired for authenticated organizer and public voting paths:
  - `packages/trpc/server/routers/viewer/polls/_router.ts`
  - `packages/trpc/server/routers/publicViewer/polls/_router.ts`

---

## Guiding principles

1. Keep polling as a separate domain module.
2. Keep booking creation behind a single integration seam (`onFinalize`).
3. Ship in small, reviewable PRs with independent value.
4. Prefer additive changes; avoid changing existing event-type scheduling semantics.
5. Add tests at each stage before adding more surface area.

---

## Stage 1: Finalization-to-booking integration

### Goal

When a poll is finalized (manual or auto), create a real booking via existing booking services.

### Work

- Implement `onFinalize` adapter that maps poll option + participant context into booking input.
- Call booking service (`RegularBookingService` or equivalent) from the finalize hook.
- Persist resulting booking id on `Poll.finalizedBookingId`.
- Handle idempotency so repeated finalize attempts do not duplicate bookings.

### Files (expected)

- `packages/features/polls/services/PollService.ts`
- New adapter/service file under `packages/features/polls/services/` (for booking bridge)
- Possibly booking-domain helper wiring in `packages/features/bookings/lib/service/`

### Acceptance criteria

- Manual finalize creates exactly one booking.
- Auto-finalize creates exactly one booking when threshold is reached.
- Re-finalize attempts on finalized polls return a safe error.

### Tests

- Unit tests for adapter mapping and idempotency.
- Integration test for finalize -> booking created -> poll updated.

---

## Stage 2: Organizer poll management UI

### Goal

Allow hosts to create/manage polls from event type settings.

### Work

- Add a `Polls` tab in event type settings navigation.
- Build create/edit/close/finalize views for polls.
- Add option builder (date/time proposals), participant input, and mode selector.
- Add optimistic state handling and clear error surfaces.

### Files (expected)

- `apps/web/modules/event-types/components/EventTypeWebWrapper.tsx`
- `packages/platform/atoms/event-types/hooks/useTabsNavigations.tsx`
- New UI module under `apps/web/modules/event-types/components/tabs/polls/`

### Acceptance criteria

- Organizer can create poll for an event type they control.
- Organizer can close and manually finalize poll.
- Organizer can view vote summaries per option.

### Tests

- Component tests for create/finalize flows.
- TRPC client integration tests for organizer operations.

---

## Stage 3: Public poll page and voting UX

### Goal

Provide Doodle-style participant voting on shareable poll links.

### Work

- Add public route for poll page under booking wrapper conventions.
- Build voting matrix (options x participant availability) with `YES/NO/IF_NEEDED` states.
- Add participant identity capture (name/email) and vote submission.
- Show aggregate vote results and poll status (`OPEN`, `CLOSED`, `FINALIZED`).

### Files (expected)

- New route under `apps/web/app/(booking-page-wrapper)/poll/[uid]/page.tsx` (or equivalent route strategy)
- New module under `apps/web/modules/bookings/components/` or dedicated `apps/web/modules/polls/`

### Acceptance criteria

- Public user can load poll via UID link and submit votes.
- Invite-only polls reject unknown participant emails.
- Finalized polls display the selected slot and booking result.

### Tests

- Component tests for matrix interactions and submit payload.
- E2E flow: organizer creates poll -> participant votes -> poll finalizes.

---

## Stage 4: Security, anti-abuse, and constraints

### Goal

Protect public endpoints and ensure robust poll lifecycle rules.

### Work

- Add rate limiting and bot protection pattern for public vote submissions.
- Add stronger input constraints (max options, max participants, expiration windows).
- Ensure vote updates are safe for concurrent submissions.
- Add audit log events for key state transitions (optional but recommended).

### Acceptance criteria

- Public vote endpoint is protected against high-frequency abuse.
- Invalid/expired/closed poll submissions fail with stable errors.
- Concurrent vote updates do not corrupt aggregate results.

### Tests

- Integration tests for constraints and closed/expired behavior.
- Concurrency test for parallel vote writes.

---

## Stage 5: Notifications and workflows

### Goal

Integrate poll lifecycle with user communication and existing workflow systems.

### Work

- Notify organizer on threshold-reached (for manual mode) and finalization events.
- Notify participants when poll is finalized (with booking details if available).
- Integrate with existing workflow event model where appropriate.

### Acceptance criteria

- Organizer receives finalize/threshold notifications.
- Participants receive final decision with selected slot.

### Tests

- Workflow/notification unit tests.
- End-to-end verification of message triggering.

---

## Stage 6: API v2 parity and external consumers

### Goal

Expose polls via API v2 module boundaries for platform consumers.

### Work

- Create API v2 polls module in `apps/api/v2/src/ee/`.
- Implement organizer and public endpoints with request/response schemas.
- Add auth and ownership checks aligned with API v2 patterns.

### Acceptance criteria

- API v2 supports create/list/get/close/finalize and submit-vote operations.
- API docs and schema snapshots are updated.

### Tests

- Controller/service tests in API v2.
- Contract tests for payload shape and status codes.

---

## Stage 7: Production hardening and observability

### Goal

Make polling operable and diagnosable in production.

### Work

- Add structured logging around vote submissions and finalize attempts.
- Add metrics (poll created, vote submitted, auto-finalized, finalize failures).
- Add admin/debug tooling for stuck polls (if needed).

### Acceptance criteria

- Key poll lifecycle events are visible in logs and metrics.
- Operational runbook exists for common failure modes.

---

## Stage 8: Docs, rollout, and feature completeness sign-off

### Goal

Finalize docs and launch plan for maintainable long-term support.

### Work

- Add user docs (organizer + participant usage).
- Add developer docs (module boundaries, lifecycle, extension points).
- Add migration notes and backward compatibility notes.
- Gate release via feature flag and progressive rollout.

### Completion checklist

- [ ] End-to-end flows pass in CI (manual and auto modes).
- [ ] Security checks pass (rate limit, invite-only guard, validation).
- [ ] API v2 parity is implemented.
- [ ] Notifications/workflows integrated.
- [ ] Feature flag rollout plan and rollback plan documented.
- [ ] No regressions in booking core test suites.

---

## Suggested PR sequence

1. Finalize-booking bridge + idempotency.
2. Organizer UI tab and CRUD.
3. Public voting page + UX.
4. Security/anti-abuse hardening.
5. Notifications/workflows.
6. API v2 parity.
7. Observability/docs/rollout finalization.

Each PR should stay narrowly scoped and include tests specific to the added surface area.
