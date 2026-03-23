# Polls feature module

This module implements Doodle-style polling as a separate feature domain, without changing the existing booking flow.

Implementation roadmap: see `packages/features/polls/IMPLEMENTATION_PLAN.md`.

## Module boundaries

- `lib/`
  - Pure domain logic and shared types only.
  - No Prisma access, no external side effects.
  - Current files: `poll-types.ts`, `poll-consensus.ts`.

- `repositories/`
  - Data access only (Prisma queries and persistence operations).
  - No cross-domain orchestration, no booking side effects.
  - Current file: `PollRepository.ts`.

- `services/`
  - Poll business logic and orchestration (validation, vote handling, auto-finalization decisions).
  - Owns when to call the finalize-booking hook.
  - Current file: `PollService.ts`.

## Out-of-module integration points

- Schema models are in `packages/prisma/schema.prisma` (`Poll`, `PollOption`, `PollParticipant`, `PollVote`).
- TRPC exposure currently lives in:
  - `packages/trpc/server/routers/viewer/polls/_router.ts`
  - `packages/trpc/server/routers/publicViewer/polls/_router.ts`

## Finalize-booking hook contract

`PollService` accepts an optional `onFinalize` callback through constructor deps:

```ts
type PollFinalizeCallbackInput = {
  pollId: number;
  pollOptionId: number;
};

type PollFinalizeCallbackOutput = {
  bookingId: number | null;
};
```

### Behavior

- The hook is called by `finalizePollInternal(...)` when a poll is finalized (manual or auto mode).
- If no hook is provided, finalization still completes and stores `finalizedBookingId = null`.
- If the hook returns `{ bookingId }`, that value is persisted to `Poll.finalizedBookingId`.
- If the hook throws, poll finalization fails and the error bubbles up.

### Integration intent

This is the only intended bridge from poll domain into booking creation. A future integration should wire
`onFinalize` to booking services (for example `RegularBookingService`) while keeping poll vote collection and
consensus logic independent from core booking internals.
