import { useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../../store';
import { DEFAULT_SHORTCUTS, type KeyBinding } from '@shared/types';

interface KeybindGroup {
  title: string;
  bindings: Array<{
    keys: string[];
    description: string;
  }>;
}

// Static command palette commands (these don't change)
const COMMAND_PALETTE_COMMANDS: KeybindGroup = {
  title: 'Command Palette Commands',
  bindings: [
    { keys: ['run', 'r'], description: 'Run current terminal' },
    { keys: ['stop', 's'], description: 'Stop current terminal' },
    { keys: ['restart'], description: 'Restart terminal' },
    { keys: ['new'], description: 'Create new terminal' },
    { keys: ['new project'], description: 'Create new project' },
    { keys: ['delete', 'rm'], description: 'Delete terminal/project' },
    { keys: ['start-all'], description: 'Start all terminals' },
    { keys: ['stop-all'], description: 'Stop all terminals' },
    { keys: ['settings'], description: 'Open settings' },
  ]
};

// Helper to format a binding for display
const formatBinding = (binding: KeyBinding): string[] => {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push('Alt');
  if (binding.meta) parts.push('Meta');
  
  let key = binding.key;
  if (key === ' ') key = 'Space';
  else if (key === 'Escape') key = 'Esc';
  else if (key === 'ArrowUp') key = '↑';
  else if (key === 'ArrowDown') key = '↓';
  else if (key.length === 1) key = key.toUpperCase();
  
  parts.push(key);
  return parts;
};

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export default function HelpModal({ isOpen, onClose, onOpenSettings }: HelpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Get shortcuts from store
  const settings = useAppStore(state => state.settings);
  const shortcuts = settings.keyboardShortcuts || DEFAULT_SHORTCUTS;
  
  // Build keybind groups dynamically from configured shortcuts
  const keybindGroups = useMemo((): KeybindGroup[] => {
    return [
      {
        title: 'Command Palette',
        bindings: [
          { keys: formatBinding(shortcuts.openCommandPalette), description: 'Open command palette' },
          { keys: formatBinding(shortcuts.closeCommandPalette), description: 'Close palette/modal' },
          { keys: ['↑', '↓'], description: 'Navigate suggestions' },
          { keys: ['Enter'], description: 'Select suggestion' },
          { keys: ['Tab'], description: 'Autocomplete' },
        ]
      },
      {
        title: 'Terminal Navigation',
        bindings: [
          { keys: formatBinding(shortcuts.nextTerminal), description: 'Next terminal' },
          { keys: formatBinding(shortcuts.prevTerminal), description: 'Previous terminal' },
          { keys: formatBinding(shortcuts.switchTerminal), description: 'Switch terminal (palette)' },
          { keys: formatBinding(shortcuts.switchProject), description: 'Switch project (palette)' },
          { keys: formatBinding(shortcuts.focusTerminal), description: 'Focus terminal input' },
        ]
      },
      {
        title: 'Terminal Actions',
        bindings: [
          { keys: formatBinding(shortcuts.runTerminal), description: 'Run terminal' },
          { keys: formatBinding(shortcuts.restartTerminal), description: 'Restart terminal' },
          { keys: formatBinding(shortcuts.killTerminal), description: 'Stop/Kill terminal' },
          { keys: formatBinding(shortcuts.clearTerminal), description: 'Clear terminal screen' },
        ]
      },
      {
        title: 'Create New',
        bindings: [
          { keys: formatBinding(shortcuts.newTerminal), description: 'New terminal' },
          { keys: formatBinding(shortcuts.newProject), description: 'New project' },
          { keys: formatBinding(shortcuts.newWorktree), description: 'New git worktree' },
        ]
      },
      COMMAND_PALETTE_COMMANDS,
      {
        title: 'General',
        bindings: [
          { keys: formatBinding(shortcuts.openHelp), description: 'Show this help' },
        ]
      },
    ];
  }, [shortcuts]);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="help-modal-backdrop" onClick={handleBackdropClick}>
      <div className="help-modal" ref={modalRef} tabIndex={-1}>
        <div className="help-modal-header">
          <h2>Keyboard Shortcuts</h2>
          <div className="help-modal-header-actions">
            {onOpenSettings && (
              <button 
                className="help-modal-settings-btn" 
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                title="Customize shortcuts"
              >
                ⚙️ Settings
              </button>
            )}
            <button 
              className="help-modal-close" 
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="help-modal-content">
          {keybindGroups.map((group) => (
            <div key={group.title} className="help-group">
              <h3 className="help-group-title">{group.title}</h3>
              <div className="help-bindings">
                {group.bindings.map((binding, index) => (
                  <div key={index} className="help-binding">
                    <div className="help-keys">
                      {binding.keys.map((key, keyIndex) => (
                        <span key={keyIndex}>
                          <kbd>{key}</kbd>
                          {keyIndex < binding.keys.length - 1 && (
                            <span className="help-key-separator">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="help-description">{binding.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="help-modal-footer">
          <span>Press <kbd>Esc</kbd> or click outside to close • Click <b>⚙️ Settings</b> to customize</span>
        </div>
      </div>
    </div>
  );
}

// Helper function for formatting (exported for potential reuse)
export { formatBinding };
