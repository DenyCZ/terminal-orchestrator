import { useEffect, useRef } from 'react';

interface KeybindGroup {
  title: string;
  bindings: Array<{
    keys: string[];
    description: string;
  }>;
}

const KEYBIND_GROUPS: KeybindGroup[] = [
  {
    title: 'Command Palette',
    bindings: [
      { keys: ['Ctrl', 'Space'], description: 'Open command palette' },
      { keys: ['Esc'], description: 'Close palette/modal' },
      { keys: ['↑', '↓'], description: 'Navigate suggestions' },
      { keys: ['Enter'], description: 'Select suggestion' },
      { keys: ['Tab'], description: 'Autocomplete' },
    ]
  },
  {
    title: 'Terminal Navigation',
    bindings: [
      { keys: ['Ctrl', 'Tab'], description: 'Next terminal' },
      { keys: ['Ctrl', 'Shift', 'Tab'], description: 'Previous terminal' },
      { keys: ['Ctrl', 'T'], description: 'Switch terminal (palette)' },
      { keys: ['Ctrl', 'P'], description: 'Switch project (palette)' },
      { keys: ['F'], description: 'Focus terminal input' },
    ]
  },
  {
    title: 'Terminal Actions',
    bindings: [
      { keys: ['Ctrl', 'R'], description: 'Run terminal' },
      { keys: ['Ctrl', 'Shift', 'R'], description: 'Restart terminal' },
      { keys: ['Ctrl', 'W'], description: 'Stop/Kill terminal' },
      { keys: ['Ctrl', 'L'], description: 'Clear terminal screen' },
    ]
  },
  {
    title: 'Create New',
    bindings: [
      { keys: ['Ctrl', 'N'], description: 'New terminal' },
      { keys: ['Ctrl', 'Shift', 'N'], description: 'New project' },
    ]
  },
  {
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
    ]
  },
  {
    title: 'General',
    bindings: [
      { keys: ['?'], description: 'Show this help' },
    ]
  },
];

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

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
          <button 
            className="help-modal-close" 
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        
        <div className="help-modal-content">
          {KEYBIND_GROUPS.map((group) => (
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
          <span>Press <kbd>Esc</kbd> or click outside to close</span>
        </div>
      </div>
    </div>
  );
}

// Export keybind groups for use in other components
export { KEYBIND_GROUPS };
