import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../../store';
import { SHORTCUT_DEFINITIONS, DEFAULT_SHORTCUTS, type KeyBinding, type ShortcutId } from '@shared/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'shortcuts' | 'general';

/**
 * SettingsModal - Modal for configuring application settings including keyboard shortcuts.
 */
export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('shortcuts');
  const [editingShortcut, setEditingShortcut] = useState<ShortcutId | null>(null);
  const [pendingBinding, setPendingBinding] = useState<KeyBinding | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  
  const { 
    settings, 
    updateKeyboardShortcut, 
    resetKeyboardShortcuts 
  } = useAppStore();
  
  // Get current shortcuts from settings or defaults
  const shortcuts = settings.keyboardShortcuts || DEFAULT_SHORTCUTS;
  
  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingShortcut) {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    modalRef.current?.focus();
    
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, editingShortcut]);
  
  // Handle keyboard input when editing a shortcut
  const handleShortcutKeyDown = useCallback((e: React.KeyboardEvent, shortcutId: ShortcutId) => {
    if (!editingShortcut || editingShortcut !== shortcutId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Cancel on Escape
    if (e.key === 'Escape') {
      setEditingShortcut(null);
      setPendingBinding(null);
      return;
    }
    
    // Build key binding
    const binding: KeyBinding = {
      key: e.key,
      ctrl: e.ctrlKey || undefined,
      shift: e.shiftKey || undefined,
      alt: e.altKey || undefined,
      meta: e.metaKey || undefined
    };
    
    // Ignore standalone modifier keys
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }
    
    // Normalize some key names
    if (e.key === ' ') {
      binding.key = ' ';
    } else if (e.key.length === 1) {
      binding.key = e.key;
    }
    
    setPendingBinding(binding);
    
    // Auto-apply on valid key combination
    updateKeyboardShortcut(shortcutId, binding);
    setEditingShortcut(null);
    setPendingBinding(null);
  }, [editingShortcut, updateKeyboardShortcut]);
  
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !editingShortcut) {
      onClose();
    }
  };
  
  const startEditingShortcut = (shortcutId: ShortcutId) => {
    setEditingShortcut(shortcutId);
    setPendingBinding(null);
  };
  
  const cancelEditing = () => {
    setEditingShortcut(null);
    setPendingBinding(null);
  };
  
  const handleResetAll = () => {
    if (confirm('Reset all keyboard shortcuts to their default values?')) {
      resetKeyboardShortcuts();
    }
  };
  
  // Format key binding for display
  const formatBinding = (binding: KeyBinding): string => {
    const parts: string[] = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.shift) parts.push('Shift');
    if (binding.alt) parts.push('Alt');
    if (binding.meta) parts.push('Meta');
    
    // Format the key
    let key = binding.key;
    if (key === ' ') key = 'Space';
    else if (key === 'ArrowUp') key = '↑';
    else if (key === 'ArrowDown') key = '↓';
    else if (key === 'ArrowLeft') key = '←';
    else if (key === 'ArrowRight') key = '→';
    else if (key === 'Escape') key = 'Esc';
    else if (key === 'Tab') key = 'Tab';
    else if (key === 'Enter') key = 'Enter';
    else if (key === 'Backspace') key = '⌫';
    else if (key === 'Delete') key = 'Del';
    else if (key.length === 1) key = key.toUpperCase();
    
    parts.push(key);
    return parts.join(' + ');
  };
  
  // Group shortcuts by category
  const groupedShortcuts = SHORTCUT_DEFINITIONS.reduce((acc, def) => {
    const group = def.group;
    if (!acc[group]) acc[group] = [];
    acc[group].push(def);
    return acc;
  }, {} as Record<string, typeof SHORTCUT_DEFINITIONS>);
  
  if (!isOpen) return null;
  
  return (
    <div className="settings-modal-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal" ref={modalRef} tabIndex={-1}>
        <div className="settings-modal-header">
          <h2>Settings</h2>
          <button 
            className="settings-modal-close" 
            onClick={onClose}
            aria-label="Close"
            disabled={editingShortcut !== null}
          >
            ✕
          </button>
        </div>
        
        <div className="settings-modal-tabs">
          <button
            className={`settings-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            Keyboard Shortcuts
          </button>
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
        </div>
        
        <div className="settings-modal-content">
          {activeTab === 'shortcuts' && (
            <div className="settings-shortcuts">
              <div className="settings-shortcuts-header">
                <p className="settings-shortcuts-info">
                  Click on a shortcut to change it. Press the new key combination to assign.
                </p>
                <button 
                  className="settings-reset-btn"
                  onClick={handleResetAll}
                >
                  Reset All to Default
                </button>
              </div>
              
              <div className="settings-shortcuts-list">
                {Object.entries(groupedShortcuts).map(([group, definitions]) => (
                  <div key={group} className="settings-shortcut-group">
                    <h3 className="settings-shortcut-group-title">{group}</h3>
                    <div className="settings-shortcut-items">
                      {definitions.map((def) => {
                        const currentBinding = shortcuts[def.id as ShortcutId];
                        const isEditing = editingShortcut === def.id;
                        
                        return (
                          <div 
                            key={def.id} 
                            className={`settings-shortcut-item ${isEditing ? 'editing' : ''}`}
                          >
                            <div className="settings-shortcut-info">
                              <span className="settings-shortcut-name">{def.name}</span>
                              <span className="settings-shortcut-desc">{def.description}</span>
                            </div>
                            <div className="settings-shortcut-binding">
                              {isEditing ? (
                                <div 
                                  className="settings-shortcut-input"
                                  onKeyDown={(e) => handleShortcutKeyDown(e, def.id as ShortcutId)}
                                  tabIndex={0}
                                  autoFocus
                                >
                                  {pendingBinding ? formatBinding(pendingBinding) : 'Press new key...'}
                                </div>
                              ) : (
                                <button
                                  className="settings-shortcut-key"
                                  onClick={() => startEditingShortcut(def.id as ShortcutId)}
                                  title="Click to change"
                                >
                                  {formatBinding(currentBinding)}
                                </button>
                              )}
                              {isEditing && (
                                <button 
                                  className="settings-shortcut-cancel"
                                  onClick={cancelEditing}
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === 'general' && (
            <div className="settings-general">
              <div className="settings-group">
                <h3 className="settings-group-title">Appearance</h3>
                <div className="settings-item">
                  <span className="settings-item-label">Theme</span>
                  <select 
                    className="settings-select"
                    value={settings.theme}
                    onChange={(e) => useAppStore.getState().updateSettings({ theme: e.target.value as 'dark' | 'light' })}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
              
              <div className="settings-group">
                <h3 className="settings-group-title">Terminal</h3>
                <div className="settings-item">
                  <span className="settings-item-label">Default Shell</span>
                  <select 
                    className="settings-select"
                    value={settings.defaultShell}
                    onChange={(e) => useAppStore.getState().updateSettings({ defaultShell: e.target.value as 'cmd' | 'powershell' })}
                  >
                    <option value="powershell">PowerShell</option>
                    <option value="cmd">Command Prompt</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="settings-modal-footer">
          <span>Press <kbd>Esc</kbd> or click outside to close</span>
        </div>
      </div>
    </div>
  );
}
