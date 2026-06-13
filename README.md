# soft-expect

Recoverable runtime expectation checks for TypeScript and JavaScript.

Use `soft-expect` when a state should be surprising, the application can safely
continue, and someone should investigate if it happens. It is a small diagnostic
primitive for the gap between static types and runtime reality: parsed JSON, API
responses, storage, URL params, SDK callbacks, feature flag rollouts, and rare
state transitions.

Do not use it for hard invariants. If continuing could corrupt state, leak data,
charge money incorrectly, or persist invalid records, throw, fail closed, or
return a typed error instead.

## Install

```sh
pnpm add soft-expect
```

## Basic usage

```ts
import { softExpect } from 'soft-expect'

const raw = JSON.parse(text) as { id?: unknown; email?: unknown }

if (
  !softExpect(typeof raw.id === 'string', 'Parsed user has invalid id', {
    raw,
  })
) {
  return null
}
```

The check returns the boolean result of the condition. A failed expectation is
reported, then your code keeps running.

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

Use a variant when a check can fire repeatedly:

```ts
softExpect.once(
  'auth-callback-user-id',
  typeof payload.userId === 'string',
  'Auth callback missing string userId',
  { provider, payloadShape: Object.keys(payload ?? {}) },
)

softExpect.rateLimited(
  `order-status:${order.id}`,
  !(prev === 'submitted' && next === 'draft'),
  'Order moved from submitted back to draft',
  { orderId: order.id, prev, next },
)

softExpect.sampled(0.01, cart.items.length > 0, 'Checkout opened with empty cart', {
  cartId,
  source,
})

softExpect.devOnly(
  oldFlowEnabled || !newFlowUsed,
  'New flow used while old-flow compatibility flag is disabled',
  { userId, experiment, removeAfter: 'checkout-migration' },
)
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
problem.
