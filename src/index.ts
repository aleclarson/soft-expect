export type SoftExpectContext = unknown

export type SoftExpectVariant = 'default' | 'once' | 'rateLimited' | 'sampled' | 'devOnly'

export interface SoftExpectFailure {
  message: string
  context?: SoftExpectContext
  key?: string
  variant: SoftExpectVariant
  timestamp: number
}

export type SoftExpectReporter = (failure: SoftExpectFailure) => void

export interface SoftExpectOptions {
  /**
   * Sends failed soft expectations to application-owned telemetry.
   *
   * Reporter errors are swallowed so a failed diagnostic path cannot turn a
   * recoverable state into an application failure.
   */
  reporter: SoftExpectReporter
  /**
   * Default interval for `softExpect.rateLimited`, in milliseconds.
   */
  rateLimitMs: number
  /**
   * Clock used for timestamps and rate limiting.
   */
  now: () => number
  /**
   * Random source used by `softExpect.sampled`.
   */
  random: () => number
}

export interface SoftExpect extends SoftExpectFn {
  /**
   * Report only the first failed expectation for a stable key.
   */
  once: (key: string, condition: unknown, message: string, context?: SoftExpectContext) => boolean
  /**
   * Report at most once per key within the configured rate-limit window.
   */
  rateLimited: (
    key: string,
    condition: unknown,
    message: string,
    context?: SoftExpectContext,
  ) => boolean
  /**
   * Report a percentage of failures. Rates outside 0..1 are clamped so noisy
   * runtime configuration cannot crash the caller.
   */
  sampled: (
    sampleRate: number,
    condition: unknown,
    message: string,
    context?: SoftExpectContext,
  ) => boolean
  /**
   * Report only outside production. The boolean result still reflects the
   * condition in every environment so fallback code can share one branch.
   */
  devOnly: (condition: unknown, message: string, context?: SoftExpectContext) => boolean
  /**
   * Override reporting and test hooks. Returns a cleanup function that restores
   * the previous options.
   */
  configure: (options: Partial<SoftExpectOptions>) => () => void
  /**
   * Clear variant state and restore default options.
   */
  reset: () => void
}

export type SoftExpectFn = (
  condition: unknown,
  message: string,
  context?: SoftExpectContext,
) => boolean

const defaultReporter: SoftExpectReporter = (failure) => {
  const maybeConsole = (
    globalThis as unknown as { console?: { warn?: (...data: unknown[]) => void } }
  ).console
  maybeConsole?.warn?.('[soft-expect]', failure.message, failure.context ?? '')
}

const defaultOptions = (): SoftExpectOptions => ({
  reporter: defaultReporter,
  rateLimitMs: 60_000,
  now: Date.now,
  random: Math.random,
})

let options = defaultOptions()
const seenOnceKeys = new Set<string>()
const rateLimitedKeys = new Map<string, number>()

const report = (
  variant: SoftExpectVariant,
  condition: unknown,
  message: string,
  context: SoftExpectContext | undefined,
  key?: string,
) => {
  const passed = Boolean(condition)
  if (passed) {
    return true
  }

  try {
    options.reporter({
      message,
      context,
      key,
      variant,
      timestamp: options.now(),
    })
  } catch {
    // Reporting is deliberately best-effort. Callers choose softExpect only for
    // states where continuing is safe, so the diagnostic path must not hard-fail
    // the product flow.
  }

  return false
}

const isProduction = () => {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: {
      env?: {
        NODE_ENV?: string
      }
    }
  }

  return maybeProcess.process?.env?.NODE_ENV === 'production'
}

export const softExpect: SoftExpect = Object.assign(
  (condition: unknown, message: string, context?: SoftExpectContext) =>
    report('default', condition, message, context),
  {
    once: (key: string, condition: unknown, message: string, context?: SoftExpectContext) => {
      if (condition) {
        return true
      }

      if (seenOnceKeys.has(key)) {
        return false
      }

      seenOnceKeys.add(key)
      return report('once', false, message, context, key)
    },

    rateLimited: (
      key: string,
      condition: unknown,
      message: string,
      context?: SoftExpectContext,
    ) => {
      if (condition) {
        return true
      }

      const now = options.now()
      const lastReportedAt = rateLimitedKeys.get(key)
      if (lastReportedAt !== undefined && now - lastReportedAt < options.rateLimitMs) {
        return false
      }

      rateLimitedKeys.set(key, now)
      return report('rateLimited', false, message, context, key)
    },

    sampled: (
      sampleRate: number,
      condition: unknown,
      message: string,
      context?: SoftExpectContext,
    ) => {
      if (condition) {
        return true
      }

      const clampedRate = Math.min(1, Math.max(0, sampleRate))
      if (options.random() >= clampedRate) {
        return false
      }

      return report('sampled', false, message, context)
    },

    devOnly: (condition: unknown, message: string, context?: SoftExpectContext) => {
      if (condition) {
        return true
      }

      if (isProduction()) {
        return false
      }

      return report('devOnly', false, message, context)
    },

    configure: (nextOptions: Partial<SoftExpectOptions>) => {
      const previousOptions = options
      options = {
        ...options,
        ...nextOptions,
      }

      return () => {
        options = previousOptions
      }
    },

    reset: () => {
      options = defaultOptions()
      seenOnceKeys.clear()
      rateLimitedKeys.clear()
    },
  },
)

export const configureSoftExpect = softExpect.configure
export const resetSoftExpect = softExpect.reset
