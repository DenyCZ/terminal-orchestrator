import { useEffect, useCallback } from 'react'
import { useAppStore } from '../store'
import { DEFAULT_SHORTCUTS, type KeyBinding, type PredefinedTerminal } from '@shared/types'

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
  onNewWorktree?: () => void;
  onSwitchProject: () => void;
  onSwitchTerminal: () => void;
  onClearTerminal?: () => void;
  onFocusTerminal?: () => void;
  onOpenHelp?: () => void;
  onSpawnPredefinedTerminal?: (terminal: PredefinedTerminal) => void;
  predefinedTerminals?: PredefinedTerminal[];
  isCommandPaletteOpen: boolean;
  enabled?: boolean;
}

/**
 * Check if a keyboard event matches a key binding
 */
function matchesBinding(event: KeyboardEvent, binding: KeyBinding): boolean {
  const keyMatch = event.key.toLowerCase() === binding.key.toLowerCase() ||
    (binding.key === ' ' && event.key === ' ') ||
    (binding.key === '?' && event.key === '?');
  
  if (!keyMatch) return false;
  
  const ctrlMatch = !!binding.ctrl === event.ctrlKey;
  const shiftMatch = !!binding.shift === event.shiftKey;
  const altMatch = !!binding.alt === event.altKey;
  const metaMatch = !!binding.meta === event.metaKey;
  
  return ctrlMatch && shiftMatch && altMatch && metaMatch;
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
    onNewWorktree,
    onSwitchProject,
    onSwitchTerminal,
    onClearTerminal,
    onFocusTerminal,
    onOpenHelp,
    onSpawnPredefinedTerminal,
    predefinedTerminals = [],
    isCommandPaletteOpen,
    enabled = true
  } = options;
  
  // Get shortcuts from store
  const settings = useAppStore(state => state.settings);
  const shortcuts = settings.keyboardShortcuts || DEFAULT_SHORTCUTS;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Ignore if we're in an input field (unless it's Escape)
    const target = event.target as HTMLElement;
    const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    // Also check if we're inside an xterm terminal (the helper textarea might not be the event target)
    const isXtermTerminal = target.closest('.xterm') !== null || target.classList.contains('xterm');
    
    // Escape - always handle to close palette
    if (matchesBinding(event, shortcuts.closeCommandPalette)) {
      if (isCommandPaletteOpen) {
        event.preventDefault();
        onCloseCommandPalette();
      }
      return;
    }

    // Check for openCommandPalette shortcut
    if (matchesBinding(event, shortcuts.openCommandPalette)) {
      // In input fields or xterm terminal, only allow Ctrl+Space to open command palette
      if ((isInputField || isXtermTerminal) && !isCommandPaletteOpen) {
        event.preventDefault();
        onOpenCommandPalette();
        return;
      }
      
      // If not in input, toggle palette
      if (!isInputField && !isXtermTerminal) {
        event.preventDefault();
        if (isCommandPaletteOpen) {
          onCloseCommandPalette();
        } else {
          onOpenCommandPalette();
        }
        return;
      }
    }

    // In input fields or xterm terminal, only allow certain shortcuts
    if ((isInputField || isXtermTerminal) && !isCommandPaletteOpen) {
      return;
    }

    // If command palette is open, let it handle keyboard events
    if (isCommandPaletteOpen) {
      return;
    }
    
    // Check all other shortcuts dynamically
    if (matchesBinding(event, shortcuts.nextTerminal)) {
      event.preventDefault();
      onNextTerminal();
      return;
    }

    if (matchesBinding(event, shortcuts.prevTerminal)) {
      event.preventDefault();
      onPrevTerminal();
      return;
    }

    if (matchesBinding(event, shortcuts.runTerminal)) {
      event.preventDefault();
      onRunTerminal();
      return;
    }

    if (matchesBinding(event, shortcuts.restartTerminal)) {
      event.preventDefault();
      onRestartTerminal();
      return;
    }

    if (matchesBinding(event, shortcuts.killTerminal)) {
      event.preventDefault();
      onKillTerminal();
      return;
    }

    if (matchesBinding(event, shortcuts.newWorktree)) {
      event.preventDefault();
      onNewWorktree?.();
      return;
    }

    if (matchesBinding(event, shortcuts.switchProject)) {
      event.preventDefault();
      onSwitchProject();
      return;
    }

    if (matchesBinding(event, shortcuts.switchTerminal)) {
      event.preventDefault();
      onSwitchTerminal();
      return;
    }

    if (matchesBinding(event, shortcuts.newTerminal)) {
      event.preventDefault();
      onNewTerminal();
      return;
    }

    if (matchesBinding(event, shortcuts.newProject)) {
      event.preventDefault();
      onNewProject();
      return;
    }

    if (matchesBinding(event, shortcuts.clearTerminal)) {
      event.preventDefault();
      onClearTerminal?.();
      return;
    }

    if (matchesBinding(event, shortcuts.focusTerminal)) {
      event.preventDefault();
      onFocusTerminal?.();
      return;
    }

    if (matchesBinding(event, shortcuts.openHelp)) {
      event.preventDefault();
      onOpenHelp?.();
      return;
    }

    // Check predefined terminal shortcuts (only when not in input field)
    if (!isInputField && !isXtermTerminal) {
      for (const terminal of predefinedTerminals) {
        if (terminal.keybinding && matchesBinding(event, terminal.keybinding)) {
          event.preventDefault();
          onSpawnPredefinedTerminal?.(terminal);
          return;
        }
      }
    }

  }, [
    enabled,
    isCommandPaletteOpen,
    shortcuts,
    predefinedTerminals,
    onOpenCommandPalette,
    onCloseCommandPalette,
    onNextTerminal,
    onPrevTerminal,
    onRunTerminal,
    onRestartTerminal,
    onKillTerminal,
    onNewTerminal,
    onNewProject,
    onNewWorktree,
    onSwitchProject,
    onSwitchTerminal,
    onClearTerminal,
    onFocusTerminal,
    onOpenHelp,
    onSpawnPredefinedTerminal
  ]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, enabled])
}
