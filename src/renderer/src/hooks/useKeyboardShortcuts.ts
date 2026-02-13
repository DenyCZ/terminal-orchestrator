/**
 * Global keyboard shortcuts hook for the keyboard-first UX.
 * 
 * Shortcuts:
 * - Ctrl+Space: Open command palette
 * - Ctrl+Tab: Next terminal
 * - Ctrl+Shift+Tab: Previous terminal
 * - Ctrl+R: Run terminal
 * - Ctrl+Shift+R: Restart terminal
 * - Ctrl+W: Kill terminal
 * - Ctrl+P: Switch project (opens command palette with "project " prefix)
 * - Ctrl+T: Switch terminal (opens command palette with "terminal " prefix)
 * - Ctrl+N: New terminal
 * - Ctrl+Shift+N: New project
 * - F: Focus terminal input
 * - ?: Show help
 * - Escape: Close command palette / cancel
 */

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description?: string;
}

interface UseKeyboardShortcutsOptions {
  onOpenCommandPalette: () => void;
  onCloseCommandPalette: () => void;
  onNextTerminal: () => void;
  onPrevTerminal: () => void;
  onRunTerminal: () => void;
  onRestartTerminal: () => void;
  onKillTerminal: () => void;
  onNewTerminal: () => void;
  onNewProject: () => void;
  onSwitchProject: () => void;
  onSwitchTerminal: () => void;
  onClearTerminal?: () => void;
  onFocusTerminal?: () => void;
  onOpenHelp?: () => void;
  isCommandPaletteOpen: boolean;
  enabled?: boolean;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const {
    onOpenCommandPalette,
    onCloseCommandPalette,
    onNextTerminal,
    onPrevTerminal,
    onRunTerminal,
    onRestartTerminal,
    onKillTerminal,
    onNewTerminal,
    onNewProject,
    onSwitchProject,
    onSwitchTerminal,
    onClearTerminal,
    onFocusTerminal,
    onOpenHelp,
    isCommandPaletteOpen,
    enabled = true
  } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    const { key, ctrlKey, shiftKey } = event;

    // Ignore if we're in an input field (unless it's Escape)
    const target = event.target as HTMLElement;
    const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    // Also check if we're inside an xterm terminal (the helper textarea might not be the event target)
    const isXtermTerminal = target.closest('.xterm') !== null || target.classList.contains('xterm');
    
    // Escape - always handle to close palette
    if (key === 'Escape') {
      if (isCommandPaletteOpen) {
        event.preventDefault();
        onCloseCommandPalette();
      }
      return;
    }

    // In input fields or xterm terminal, only allow certain shortcuts
    if ((isInputField || isXtermTerminal) && !isCommandPaletteOpen) {
      // Allow Ctrl+Space to open command palette even in inputs
      if (ctrlKey && key === ' ') {
        event.preventDefault();
        onOpenCommandPalette();
        return;
      }
      return;
    }

    // Ctrl+Space - Toggle command palette
    if (ctrlKey && key === ' ') {
      event.preventDefault();
      if (isCommandPaletteOpen) {
        onCloseCommandPalette();
      } else {
        onOpenCommandPalette();
      }
      return;
    }

    // If command palette is open, let it handle keyboard events
    if (isCommandPaletteOpen) {
      return;
    }

    // Ctrl+Tab - Next terminal
    if (ctrlKey && key === 'Tab' && !shiftKey) {
      event.preventDefault();
      onNextTerminal();
      return;
    }

    // Ctrl+Shift+Tab - Previous terminal
    if (ctrlKey && key === 'Tab' && shiftKey) {
      event.preventDefault();
      onPrevTerminal();
      return;
    }

    // Ctrl+R - Run terminal (only if not in input)
    if (ctrlKey && key === 'r' && !shiftKey) {
      event.preventDefault();
      onRunTerminal();
      return;
    }

    // Ctrl+Shift+R - Restart terminal
    if (ctrlKey && key === 'R' && shiftKey) {
      event.preventDefault();
      onRestartTerminal();
      return;
    }

    // Ctrl+W - Kill terminal
    if (ctrlKey && key === 'w') {
      event.preventDefault();
      onKillTerminal();
      return;
    }

    // Ctrl+P - Switch project (open palette with focus on projects)
    if (ctrlKey && key === 'p' && !shiftKey) {
      event.preventDefault();
      onSwitchProject();
      return;
    }

    // Ctrl+T - Switch terminal (open palette with focus on terminals)
    if (ctrlKey && key === 't' && !shiftKey) {
      event.preventDefault();
      onSwitchTerminal();
      return;
    }

    // Ctrl+N - New terminal
    if (ctrlKey && key === 'n' && !shiftKey) {
      event.preventDefault();
      onNewTerminal();
      return;
    }

    // Ctrl+Shift+N - New project
    if (ctrlKey && key === 'N' && shiftKey) {
      event.preventDefault();
      onNewProject();
      return;
    }

    // Ctrl+L or Ctrl+K - Clear terminal
    if (ctrlKey && (key === 'l' || key === 'k') && !shiftKey) {
      event.preventDefault();
      onClearTerminal?.();
      return;
    }

    // F - Focus terminal input (quick jump)
    if (key === 'f' && !ctrlKey && !shiftKey) {
      event.preventDefault();
      onFocusTerminal?.();
      return;
    }

    // ? or Shift+/ - Show help
    if (key === '?' || (key === '/' && shiftKey)) {
      event.preventDefault();
      onOpenHelp?.();
      return;
    }

  }, [
    enabled,
    isCommandPaletteOpen,
    onOpenCommandPalette,
    onCloseCommandPalette,
    onNextTerminal,
    onPrevTerminal,
    onRunTerminal,
    onRestartTerminal,
    onKillTerminal,
    onNewTerminal,
    onNewProject,
    onSwitchProject,
    onSwitchTerminal,
    onClearTerminal,
    onFocusTerminal,
    onOpenHelp
  ]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, enabled]);

  return {
    // Expose shortcuts info for help display
    shortcuts: [
      { keys: ['Ctrl', 'Space'], description: 'Open command palette' },
      { keys: ['Ctrl', 'Tab'], description: 'Next terminal' },
      { keys: ['Ctrl', 'Shift', 'Tab'], description: 'Previous terminal' },
      { keys: ['Ctrl', 'R'], description: 'Run terminal' },
      { keys: ['Ctrl', 'Shift', 'R'], description: 'Restart terminal' },
      { keys: ['Ctrl', 'W'], description: 'Kill terminal' },
      { keys: ['Ctrl', 'P'], description: 'Switch project' },
      { keys: ['Ctrl', 'T'], description: 'Switch terminal' },
      { keys: ['Ctrl', 'N'], description: 'New terminal' },
      { keys: ['Ctrl', 'Shift', 'N'], description: 'New project' },
      { keys: ['F'], description: 'Focus terminal' },
      { keys: ['?'], description: 'Show help' },
      { keys: ['Esc'], description: 'Close command palette' },
    ]
  };
}
