/**
 * OpenCode Integration Module
 * 
 * Provides access to OpenCode session data for the Terminal Orchestrator.
 * Uses SQLite + SSE + CLI fallback for reliable session tracking.
 */

export * from './types'
export { OpenCodeSessionWatcher, getOpenCodeWatcher } from './session-watcher'
export { ensureOpenCodePlugin, isPluginInstalled, uninstallOpenCodePlugin } from './plugin-installer'
