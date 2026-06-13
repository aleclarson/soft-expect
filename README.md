# soft-expect

Recoverable runtime expectation checks for TypeScript and JavaScript.

Use `soft-expect` sparingly when a state should be surprising, the application
can safely continue, and someone should investigate if it happens.

Default to not adding a soft expectation. Use one only when the state is
surprising, continuation is safe, the signal would change someone's behavior,
the check is cheap, and the message can identify the failed expectation with
useful context. A missing check is usually better than a noisy one.

Do not use it for hard invariants. If continuing could corrupt state, leak data,
charge money incorrectly, or persist invalid records, throw, fail closed, or
return a typed error instead. If structured boundary data needs shape
validation, use a schema validator first.

## Install

```sh
pnpm add soft-expect
```

## Basic usage

```ts
import { softExpect } from 'soft-expect'

if (surprisingButRecoverableState) {
  softExpect(false, 'Expected condition failed while choosing safe fallback', {
    relevantId,
    observedState,
  })

  return safeFallback
}
```

The branch remains ordinary application logic. `softExpect(false, ...)` only
records that this recoverable path was surprising enough to investigate. Use the
condition form only when it reads clearly and does not hide important branch
behavior:

```ts
softExpect(conditionThatShouldHold, 'Expected condition failed during recoverable operation', {
  relevantId,
  observedState,
})
```

## Reporting

By default, failures are sent to `console.warn`. Configure a reporter to send
them to your application telemetry:

```ts
import { softExpect } from 'soft-expect'

softExpect.configure({
  reporter: (failure) => {
    telemetry.capture('soft_expect_failed', failure)
  },
})
```

Reporter failures are swallowed so telemetry outages do not turn a recoverable
path into an application failure.

## Noise control

Keep production checks cheap, actionable, and owned. Choose silence over spam
when actionability is unclear. Use a variant when a check can fire repeatedly:

```ts
if (surprisingButRecoverableState) {
  softExpect.once(key, false, 'Expected condition failed once', {
    relevantId,
    observedState,
  })

  return safeFallback
}

softExpect.rateLimited(key, conditionThatShouldHold, message, context)
softExpect.sampled(0.01, conditionThatShouldHold, message, context)
softExpect.devOnly(conditionThatShouldHold, message, context)
```

- `once(key, ...)` reports only the first failure for a stable key.
- `rateLimited(key, ...)` reports at most once per key per configured interval.
- `sampled(rate, ...)` reports a percentage of failures.
- `devOnly(...)` reports outside production only, but still returns the
  condition result in every environment.

## Configuration

```ts
const restore = softExpect.configure({
  rateLimitMs: 30_000,
  reporter: (failure) => {
    telemetry.capture('soft_expect_failed', failure)
  },
})

restore()
```

`configure` accepts:

- `reporter`: receives `{ message, context, key, variant, timestamp }`.
- `rateLimitMs`: default window for `rateLimited`; defaults to 60 seconds.
- `now`: clock hook, primarily for tests.
- `random`: random source for `sampled`, primarily for tests.

Use `softExpect.reset()` to restore defaults and clear `once` and `rateLimited`
state.

## Fit

Use this package when you want a tiny, dependency-free primitive for actionable
recoverable expectation failures.

It is not a schema validator, assertion library, logging framework, metrics
system, or error boundary. Prefer those tools when they directly model the
problem. Do not add `softExpect` just because a branch looks unusual; add it
only when the team would plausibly investigate that branch firing.
