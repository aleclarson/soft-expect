---
name: soft-expect
description: Use when adding or reviewing `softExpect` checks for surprising runtime states where code can safely continue, but the team should investigate if the expectation fails.
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

## Fit

Do not treat this skill as a catalog of allowed scenarios. Apply the decision
rule to the local code path. `softExpect` fits when the code has discovered a
surprising recoverable state and has already chosen a safe continuation path.

For conditional gates, keep the branch as ordinary application logic and force
the report inside the branch:

```ts
if (surprisingButRecoverableState) {
  softExpect(false, 'Expected condition failed while choosing safe fallback', {
    relevantId,
    observedState,
  })

  return safeFallback
}
```

For direct expectation checks, use the condition form only when it reads clearly
and does not hide important branch behavior:

```ts
softExpect(conditionThatShouldHold, 'Expected condition failed during recoverable operation', {
  relevantId,
  observedState,
})
```

## Bad Uses

Do not use `softExpect` for real invariants where continuing may corrupt state, leak data, charge money incorrectly, or persist invalid records. Throw, fail closed, or return a typed error instead.

```ts
assert(conditionRequiredForSafety, 'Required condition failed')
```

Do not repeat what TypeScript already proves locally.

```ts
function renderEntity(entity: TypedEntity) {
  softExpect(typeof entity.id === 'string', 'Entity id should be a string')
}
```

Use schema validation when structured boundary data needs shape validation.
Reach for `softExpect` only after validation or a normal conditional branch has
already chosen a safe fallback and the fallback itself is suspicious.

```ts
const parsed = Schema.safeParse(input)

if (!parsed.success) {
  softExpect(false, 'Structured input failed validation before safe fallback', {
    inputSource,
    issues: parsed.error.issues,
  })

  return safeFallback
}
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
  conditionThatShouldHold,
  'Expected condition failed while safe fallback remained available',
  { relevantId, observedState },
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
