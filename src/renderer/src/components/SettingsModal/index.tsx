import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../../store';
import { SHORTCUT_DEFINITIONS, DEFAULT_SHORTCUTS, DEFAULT_SETTINGS, type KeyBinding, type ShortcutId, type DetectedShell, type ShellType } from '@shared/types';
import type { WebUIStatus } from '@shared/ipc';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'shortcuts' | 'general' | 'webui' | 'predefined';

/**
 * SettingsModal - Modal for configuring application settings including keyboard shortcuts.
 */
export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('shortcuts');
  const [editingShortcut, setEditingShortcut] = useState<ShortcutId | null>(null);
  const [pendingBinding, setPendingBinding] = useState<KeyBinding | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [webUIStatus, setWebUIStatus] = useState<WebUIStatus | null>(null);
  const [availableShells, setAvailableShells] = useState<DetectedShell[]>([]);
  
  // Predefined terminals state
  const [editingPredefinedId, setEditingPredefinedId] = useState<string | null>(null);
  const [editingPredefinedBinding, setEditingPredefinedBinding] = useState<string | null>(null);
  const [newPredefinedName, setNewPredefinedName] = useState('');
  const [newPredefinedCommand, setNewPredefinedCommand] = useState('');
  const [newPredefinedShell, setNewPredefinedShell] = useState<ShellType>('powershell');
  const [newPredefinedBinding, setNewPredefinedBinding] = useState<KeyBinding | null>(null);
  
  const { 
    settings, 
    updateKeyboardShortcut, 
    resetKeyboardShortcuts,
    updateSettings,
    createPredefinedTerminal,
    updatePredefinedTerminal,
    deletePredefinedTerminal
  } = useAppStore();
  
  // Get current shortcuts from settings or defaults
  const shortcuts = settings.keyboardShortcuts || DEFAULT_SHORTCUTS;
  
  // Load available shells
  useEffect(() => {
    if (isOpen) {
      loadAvailableShells();
    }
  }, [isOpen]);
  
  const loadAvailableShells = async () => {
    try {
      const shells = await window.electronAPI.shell.listAvailable();
      setAvailableShells(shells);
    } catch (error) {
      console.error('Failed to load available shells:', error);
    }
  };
  
  // Load Web UI status
  useEffect(() => {
    if (isOpen && activeTab === 'webui') {
      loadWebUIStatus();
    }
  }, [isOpen, activeTab]);
  
  const loadWebUIStatus = async () => {
    try {
      const status = await window.electronAPI.webui.getStatus();
      setWebUIStatus(status);
    } catch (error) {
      console.error('Failed to load Web UI status:', error);
    }
  };
  
  const handleWebUIToggle = async (enabled: boolean) => {
    updateSettings({ webUI: { ...DEFAULT_SETTINGS.webUI!, ...settings.webUI, enabled } });
    if (enabled) {
      await window.electronAPI.webui.start();
    } else {
      await window.electronAPI.webui.stop();
    }
    loadWebUIStatus();
  };
  
  const handlePortChange = (port: number) => {
    updateSettings({ webUI: { ...DEFAULT_SETTINGS.webUI!, ...settings.webUI, port } });
  };
  
  const handleAllowRemoteChange = async (allowRemote: boolean) => {
    updateSettings({ webUI: { ...DEFAULT_SETTINGS.webUI!, ...settings.webUI, allowRemote } });
    if (webUIStatus?.running) {
      await window.electronAPI.webui.stop();
      await window.electronAPI.webui.start();
      loadWebUIStatus();
    }
  };
  
  const handleRegeneratePIN = async () => {
    const result = await window.electronAPI.webui.regeneratePin();
    loadWebUIStatus();
    return result.pin;
  };
  
  const handleCopyURL = () => {
    if (webUIStatus?.url) {
      navigator.clipboard.writeText(webUIStatus.url);
    }
  };
  
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
          <button
            className={`settings-tab ${activeTab === 'webui' ? 'active' : ''}`}
            onClick={() => setActiveTab('webui')}
          >
            Mobile Web UI
          </button>
          <button
            className={`settings-tab ${activeTab === 'predefined' ? 'active' : ''}`}
            onClick={() => setActiveTab('predefined')}
          >
            Predefined Terminals
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
                    onChange={(e) => useAppStore.getState().updateSettings({ defaultShell: e.target.value as ShellType })}
                  >
                    {availableShells.map(shell => (
                      <option key={shell.id} value={shell.id}>
                        {shell.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'webui' && (
            <div className="settings-webui">
              <div className="settings-group">
                <h3 className="settings-group-title">Mobile Access</h3>
                <p className="settings-group-description">
                  Enable mobile browser access to this application from your local network.
                  The feature is only active when this desktop app is running.
                </p>
                
                <div className="settings-item">
                  <span className="settings-item-label">Enable Mobile Web UI</span>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.webUI?.enabled || false}
                      onChange={(e) => handleWebUIToggle(e.target.checked)}
                    />
                    <span className="settings-toggle-slider"></span>
                  </label>
                </div>
              </div>
              
              {settings.webUI?.enabled && (
                <>
                  <div className="settings-group">
                    <div className="settings-item">
                      <span className="settings-item-label">Port</span>
                      <input
                        type="number"
                        className="settings-input"
                        value={settings.webUI?.port || 3000}
                        onChange={(e) => handlePortChange(parseInt(e.target.value) || 3000)}
                        min={1024}
                        max={65535}
                      />
                    </div>
                    
                    <div className="settings-item">
                      <span className="settings-item-label">Access PIN</span>
                      <div className="settings-pin-display">
                        <code>{webUIStatus?.pin || settings.webUI?.pin || 'Not set'}</code>
                        <button 
                          className="settings-btn-secondary"
                          onClick={handleRegeneratePIN}
                        >
                          Regenerate
                        </button>
                      </div>
                      <span className="settings-item-hint">
                        Enter this PIN on your mobile device to connect
                      </span>
                    </div>
                    
                    <div className="settings-item">
                      <span className="settings-item-label">Allow Remote Connections</span>
                      <label className="settings-toggle">
                        <input
                          type="checkbox"
                          checked={settings.webUI?.allowRemote || false}
                          onChange={(e) => handleAllowRemoteChange(e.target.checked)}
                        />
                        <span className="settings-toggle-slider"></span>
                      </label>
                      <span className="settings-item-hint">
                        Allow connections from any network (not just localhost)
                      </span>
                    </div>
                  </div>
                  
                  {webUIStatus?.running && (
                    <div className="settings-group settings-connection-info">
                      <h3 className="settings-group-title">Connection Info</h3>
                      
                      <div className="settings-item">
                        <span className="settings-item-label">Mobile URL</span>
                        <div className="settings-url-display">
                          <code>{webUIStatus.url}</code>
                          <button 
                            className="settings-btn-secondary"
                            onClick={handleCopyURL}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      
                      {settings.webUI?.showQRCode && webUIStatus.qrCode && (
                        <div className="settings-item">
                          <span className="settings-item-label">QR Code</span>
                          <img 
                            src={webUIStatus.qrCode} 
                            alt="QR Code for mobile connection" 
                            className="settings-qr-code"
                          />
                        </div>
                      )}
                      
                      <div className="settings-item">
                        <span className="settings-item-label">Status</span>
                        <span className={`settings-status-badge ${webUIStatus.running ? 'running' : 'stopped'}`}>
                          {webUIStatus.running ? 'Running' : 'Stopped'}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          
          {activeTab === 'predefined' && (
            <div className="settings-predefined">
              <div className="settings-group">
                <h3 className="settings-group-title">Predefined Terminals</h3>
                <p className="settings-group-description">
                  Define terminals that can be quickly spawned with keyboard shortcuts. 
                  These will use the current project's root directory.
                </p>
                
                {/* Add new predefined terminal */}
                <div className="settings-predefined-add">
                  <h4>Add New Predefined Terminal</h4>
                  <div className="settings-predefined-form">
                    <div className="settings-predefined-field">
                      <label>Name</label>
                      <input
                        type="text"
                        placeholder="e.g., OpenCode"
                        value={newPredefinedName}
                        onChange={(e) => setNewPredefinedName(e.target.value)}
                      />
                    </div>
                    <div className="settings-predefined-field">
                      <label>Command</label>
                      <input
                        type="text"
                        placeholder="e.g., opencode"
                        value={newPredefinedCommand}
                        onChange={(e) => setNewPredefinedCommand(e.target.value)}
                      />
                    </div>
                    <div className="settings-predefined-field">
                      <label>Shell (optional)</label>
                      <select
                        value={newPredefinedShell}
                        onChange={(e) => setNewPredefinedShell(e.target.value as ShellType)}
                      >
                        {availableShells.map(shell => (
                          <option key={shell.id} value={shell.id}>
                            {shell.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="settings-predefined-field">
                      <label>Keybinding (optional)</label>
                      {editingPredefinedBinding === 'new' ? (
                        <div 
                          className="settings-shortcut-input"
                          onKeyDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            if (e.key === 'Escape') {
                              setEditingPredefinedBinding(null);
                              setNewPredefinedBinding(null);
                              return;
                            }
                            
                            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                              return;
                            }
                            
                            const binding: KeyBinding = {
                              key: e.key === ' ' ? ' ' : e.key,
                              ctrl: e.ctrlKey || undefined,
                              shift: e.shiftKey || undefined,
                              alt: e.altKey || undefined,
                              meta: e.metaKey || undefined
                            };
                            
                            setNewPredefinedBinding(binding);
                            setEditingPredefinedBinding(null);
                          }}
                          tabIndex={0}
                          autoFocus
                        >
                          Press key combination...
                        </div>
                      ) : (
                        <button
                          className="settings-shortcut-key"
                          onClick={() => setEditingPredefinedBinding('new')}
                        >
                          {newPredefinedBinding ? formatBinding(newPredefinedBinding) : 'Click to set'}
                        </button>
                      )}
                    </div>
                    <button
                      className="settings-btn-primary"
                      onClick={() => {
                        if (newPredefinedName.trim() && newPredefinedCommand.trim()) {
                          createPredefinedTerminal({
                            name: newPredefinedName.trim(),
                            command: newPredefinedCommand.trim(),
                            shellType: newPredefinedShell,
                            keybinding: newPredefinedBinding || undefined
                          });
                          setNewPredefinedName('');
                          setNewPredefinedCommand('');
                          setNewPredefinedBinding(null);
                        }
                      }}
                      disabled={!newPredefinedName.trim() || !newPredefinedCommand.trim()}
                    >
                      Add Terminal
                    </button>
                  </div>
                </div>
                
                {/* List existing predefined terminals */}
                <div className="settings-predefined-list">
                  <h4>Existing Predefined Terminals</h4>
                  {(settings.predefinedTerminals || []).length === 0 ? (
                    <p className="settings-predefined-empty">No predefined terminals yet.</p>
                  ) : (
                    (settings.predefinedTerminals || []).map((terminal) => (
                      <div key={terminal.id} className="settings-predefined-item">
                        {editingPredefinedId === terminal.id ? (
                          <div className="settings-predefined-edit">
                            <input
                              type="text"
                              defaultValue={terminal.name}
                              onBlur={(e) => {
                                updatePredefinedTerminal(terminal.id, { name: (e.target as HTMLInputElement).value });
                                setEditingPredefinedId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  updatePredefinedTerminal(terminal.id, { name: (e.target as HTMLInputElement).value });
                                  setEditingPredefinedId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingPredefinedId(null);
                                }
                              }}
                              autoFocus
                            />
                          </div>
                        ) : (
                          <div className="settings-predefined-info">
                            <span 
                              className="settings-predefined-name"
                              onClick={() => setEditingPredefinedId(terminal.id)}
                              title="Click to edit name"
                            >
                              {terminal.name}
                            </span>
                            <code className="settings-predefined-command">{terminal.command}</code>
                            {terminal.shellType && (
                              <span className="settings-predefined-shell">({terminal.shellType})</span>
                            )}
                          </div>
                        )}
                        <div className="settings-predefined-binding">
                          {editingPredefinedBinding === terminal.id ? (
                            <div 
                              className="settings-shortcut-input"
                              onKeyDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                if (e.key === 'Escape') {
                                  setEditingPredefinedBinding(null);
                                  return;
                                }
                                
                                if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                                  return;
                                }
                                
                                const binding: KeyBinding = {
                                  key: e.key === ' ' ? ' ' : e.key,
                                  ctrl: e.ctrlKey || undefined,
                                  shift: e.shiftKey || undefined,
                                  alt: e.altKey || undefined,
                                  meta: e.metaKey || undefined
                                };
                                
                                updatePredefinedTerminal(terminal.id, { keybinding: binding });
                                setEditingPredefinedBinding(null);
                              }}
                              tabIndex={0}
                              autoFocus
                            >
                              Press key combination...
                            </div>
                          ) : (
                            <button
                              className="settings-shortcut-key"
                              onClick={() => setEditingPredefinedBinding(terminal.id)}
                              title="Click to change keybinding"
                            >
                              {terminal.keybinding ? formatBinding(terminal.keybinding) : 'No keybinding'}
                            </button>
                          )}
                          <button
                            className="settings-predefined-delete"
                            onClick={() => deletePredefinedTerminal(terminal.id)}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
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
