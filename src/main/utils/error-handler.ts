/**
 * Error handling utilities for DRY try/catch patterns
 */

/**
 * Execute a synchronous function with error handling
 * Returns fallback on error
 */
export const withError = <T>(fn: () => T, fallback: T): T => {
  try { return fn() } catch { return fallback }
}

/**
 * Execute an async function with error handling
 * Returns fallback on error
 */
export const withErrorAsync = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn() } catch { return fallback }
}

/**
 * Execute a function and return null on error
 */
export const tryOrNull = <T>(fn: () => T): T | null => {
  try { return fn() } catch { return null }
}

/**
 * Execute an async function and return null on error
 */
export const tryOrNullAsync = async <T>(fn: () => Promise<T>): Promise<T | null> => {
  try { return await fn() } catch { return null }
}

/**
 * Execute a function and return undefined on error
 */
export const tryOrUndefined = <T>(fn: () => T): T | undefined => {
  try { return fn() } catch { return undefined }
}

/**
 * Execute a function and log error on failure, return fallback
 */
export const withErrorLog = <T>(fn: () => T, fallback: T, context?: string): T => {
  try { return fn() } catch (e) {
    if (context) console.warn(`[${context}]`, e)
    return fallback
  }
}

/**
 * Execute an async function and log error on failure, return fallback
 */
export const withErrorLogAsync = async <T>(fn: () => Promise<T>, fallback: T, context?: string): Promise<T> => {
  try { return await fn() } catch (e) {
    if (context) console.warn(`[${context}]`, e)
    return fallback
  }
}
