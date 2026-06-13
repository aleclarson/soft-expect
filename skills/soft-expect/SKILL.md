---
name: soft-expect
description: Guidance for adding or reviewing `softExpect` runtime checks. Use when Codex needs to decide whether a recoverable suspicious state should use `softExpect`, choose between `softExpect`, hard assertions, validation, metrics, or logs, write actionable messages and context, or apply noise-control variants such as `once`, `rateLimited`, `sampled`, and `devOnly`.
---

# Soft Expect

## Overview

Use `softExpect(condition, message, context?)` for suspicious runtime states where code can safely continue, but the violated expectation should be investigated.

Read it as: "I expect this to be true. If it is false, continuing is acceptable, but the team should know."

## Decision Rule

Use `softExpect` only when all are true:

1. Treat the state as surprising.
2. Confirm the app can safely continue.
3. Expect the signal to change someone's behavior.
4. Keep the check cheap.
5. Write a message that names the failed expectation and include useful context.

Prefer stronger or more specific tools when they fit:

- Use type modeling for compile-time guarantees.
- Use schema validation for boundary data.
- Use exhaustiveness checks for closed unions.
- Use hard assertions for unsafe continuation.
- Use metrics for expected-but-important rates.
- Use logs for ordinary observability.

## Good Uses

Add `softExpect` where runtime reality can drift from static belief:

- API responses, `JSON.parse`, localStorage/sessionStorage, URL params, `postMessage` payloads, server-rendered bootstrap data, and third-party SDK callbacks.
- Rare or supposedly impossible state transitions that remain recoverable.
- Critical product flows where the fallback is safe but suspicious.
- Regression tripwires near subtle bugs that were fixed.
- Migrations, rollouts, and feature flag interactions.

```ts
softExpect(typeof payload.userId === 'string', 'Auth callback missing string userId', {
  provider,
  payloadShape: Object.keys(payload ?? {}),
})
```

```ts
softExpect(
  !(prev === 'submitted' && next === 'draft'),
  'Order moved from submitted back to draft',
  { orderId, prev, next },
)
```

## Bad Uses

Do not use `softExpect` for real invariants where continuing may corrupt state, leak data, charge money incorrectly, or persist invalid records. Throw, fail closed, or return a typed error instead.

```ts
assert(paymentAmount > 0, 'Payment amount must be positive')
```

Do not repeat what TypeScript already proves locally.

```ts
function renderUser(user: User) {
  softExpect(typeof user.id === 'string', 'User id should be a string')
}
```

Use it where TypeScript had to trust runtime data.

```ts
const raw = JSON.parse(text) as User

softExpect(typeof raw.id === 'string', 'Parsed user has invalid id', { raw })
```

Do not use it for expected user behavior. Put that in validation or UX state.

Do not use it for normal fallback paths. If "that happens sometimes" and nobody plans to act, it is not a soft expectation.

Do not use it as vague logging.

```ts
// Bad
softExpect(value != null, 'Unexpected null')
```

Prefer messages that name the violated expectation and include debugging context.

```ts
softExpect(
  order.status !== 'paid' || order.receiptId != null,
  'Paid order is missing receiptId after payment confirmation',
  { orderId: order.id, paymentIntentId },
)
```

## Noise Control

Keep production `softExpect` checks cheap, actionable, and owned.

Use variants for noisy surfaces:

```ts
softExpect.once(key, condition, message, context)
softExpect.rateLimited(key, condition, message, context)
softExpect.sampled(0.01, condition, message, context)
softExpect.devOnly(condition, message, context)
```

If a `softExpect` fires repeatedly and nobody changes code, removes it, silences it, or turns it into a metric, treat it as noise.
