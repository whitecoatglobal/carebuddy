# Local deterministic contract
Node.js 18+; no dependencies or network. Input is JSON on stdin; output is one JSON object. The script reads supplied state only and writes no files.

All requests: `state` (CareBuddy State), `profileId`, `expectedClock` exactly matching `state.now`. Action proposals also require a unique `actionId` and future `scheduledAt` in ISO format with timezone. Appointment package requires `appointmentId`; reminder package requires `userRequestedTime: true` (the exact time came from the user), `reminderId` and `scope` (`occurrence` or `future`); benefits package requires `category`.

Statuses: `proposal`, `information`, `clarification`, `refusal`. Every result has `executed: false`. Proposals carry `action` matching the PWA Action/Command types and `expectedClock`; the host must never directly evaluate or execute returned JSON. No durable receipt is fabricated. Only CareBuddy's confirmed local handler can record a receipt. Revalidate recipient, source snapshot, permissions, future time and duplicate action at actual confirmation.

`fixtures/request.json` contains the current full fictional seed State generated from src/domain.ts; export the live demo state for a current-state dry-run. This package makes no clinical or insurer inference.
