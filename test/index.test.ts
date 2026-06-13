import { afterEach, describe, expect, it, vi } from 'vitest'
import { softExpect, type SoftExpectFailure } from '../src/index'

const captureFailures = () => {
  const failures: SoftExpectFailure[] = []
  const restore = softExpect.configure({
    reporter: (failure) => failures.push(failure),
  })

  return { failures, restore }
}

afterEach(() => {
  softExpect.reset()
  vi.unstubAllGlobals()
})

describe('softExpect', () => {
  it('returns true for passing conditions without reporting', () => {
    const { failures, restore } = captureFailures()

    expect(softExpect(true, 'Expected value to pass')).toBe(true)

    expect(failures).toEqual([])
    restore()
  })

  it('returns false and reports failed expectations', () => {
    const { failures, restore } = captureFailures()

    expect(softExpect(false, 'Parsed user has invalid id', { raw: { id: 1 } })).toBe(false)

    expect(failures).toMatchObject([
      {
        message: 'Parsed user has invalid id',
        context: { raw: { id: 1 } },
        variant: 'default',
      },
    ])
    expect(failures[0]?.timestamp).toEqual(expect.any(Number))
    restore()
  })

  it('does not let reporter failures escape', () => {
    softExpect.configure({
      reporter: () => {
        throw new Error('telemetry unavailable')
      },
    })

    expect(() => softExpect(false, 'Checkout opened with empty cart')).not.toThrow()
  })

  it('reports a once key only on the first failure', () => {
    const { failures, restore } = captureFailures()

    expect(softExpect.once('auth:user-id', false, 'Auth callback missing string userId')).toBe(
      false,
    )
    expect(softExpect.once('auth:user-id', false, 'Auth callback missing string userId')).toBe(
      false,
    )
    expect(softExpect.once('auth:email', false, 'Auth callback missing email')).toBe(false)

    expect(failures.map((failure) => failure.key)).toEqual(['auth:user-id', 'auth:email'])
    expect(failures.map((failure) => failure.variant)).toEqual(['once', 'once'])
    restore()
  })

  it('rate limits repeated failures by key', () => {
    const failures: SoftExpectFailure[] = []
    let now = 1_000
    softExpect.configure({
      now: () => now,
      reporter: (failure) => failures.push(failure),
      rateLimitMs: 500,
    })

    expect(
      softExpect.rateLimited('checkout:empty-cart', false, 'Checkout opened with empty cart'),
    ).toBe(false)
    now = 1_100
    expect(
      softExpect.rateLimited('checkout:empty-cart', false, 'Checkout opened with empty cart'),
    ).toBe(false)
    now = 1_500
    expect(
      softExpect.rateLimited('checkout:empty-cart', false, 'Checkout opened with empty cart'),
    ).toBe(false)

    expect(failures.map((failure) => failure.timestamp)).toEqual([1_000, 1_500])
  })

  it('samples failed expectations', () => {
    const { failures, restore } = captureFailures()

    softExpect.configure({ random: () => 0.5 })

    expect(softExpect.sampled(0.25, false, 'Suppressed sampled failure')).toBe(false)
    expect(softExpect.sampled(0.75, false, 'Reported sampled failure')).toBe(false)

    expect(failures.map((failure) => failure.message)).toEqual(['Reported sampled failure'])
    restore()
  })

  it('keeps dev-only failures out of production reports', () => {
    const { failures, restore } = captureFailures()

    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } })

    expect(softExpect.devOnly(false, 'Development-only expectation failed')).toBe(false)

    expect(failures).toEqual([])
    restore()
  })
})
