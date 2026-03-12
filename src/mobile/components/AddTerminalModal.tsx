import { useState, useEffect } from 'react'
import type { ShellType, DetectedShell } from '@shared/types'
import { useApi } from '../hooks/useApi'

interface AddTerminalModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (name: string, shellType: ShellType, workingDirectory: string, startupCommand?: string) => Promise<void>
  projectRootDirectory?: string
  prefilledName?: string
}

export function AddTerminalModal({ isOpen, onClose, onAdd, projectRootDirectory, prefilledName }: AddTerminalModalProps) {
  const [name, setName] = useState('')
  const [shellType, setShellType] = useState<ShellType>('powershell')
  const [workingDirectory, setWorkingDirectory] = useState(projectRootDirectory || '')
  const [startupCommand, setStartupCommand] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableShells, setAvailableShells] = useState<DetectedShell[]>([])
  const api = useApi()
  
  // Load available shells when modal opens
  useEffect(() => {
    if (isOpen) {
      loadShells()
      // Prefill name if provided
      if (prefilledName) {
        setName(prefilledName)
      }
    }
  }, [isOpen, prefilledName])
  
  const loadShells = async () => {
    try {
      const shells = await api.getAvailableShells()
      setAvailableShells(shells)
      // Set default shell to first available if current selection not in list
      if (shells.length > 0 && !shells.find(s => s.id === shellType)) {
        setShellType(shells[0].id as ShellType)
      }
    } catch (err) {
      console.error('Failed to load available shells:', err)
    }
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Terminal name is required')
      return
    }
    if (!workingDirectory.trim()) {
      setError('Working directory is required')
      return
    }
    
    setIsCreating(true)
    setError(null)
    
    try {
      await onAdd(
        name.trim(),
        shellType,
        workingDirectory.trim(),
        startupCommand.trim() || undefined
      )
      // Reset form
      setName('')
      setShellType('powershell')
      setWorkingDirectory(projectRootDirectory || '')
      setStartupCommand('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create terminal')
    } finally {
      setIsCreating(false)
    }
  }
  
  const handleClose = () => {
    if (!isCreating) {
      setError(null)
      onClose()
    }
  }
  
  if (!isOpen) return null
  
  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Terminal</h3>
          <button 
            className="modal-close" 
            onClick={handleClose}
            disabled={isCreating}
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          {error && (
            <div className="modal-error">{error}</div>
          )}
          
          <div className="modal-field">
            <label htmlFor="terminal-name">Name</label>
            <input
              id="terminal-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., npm run dev"
              disabled={isCreating}
              autoFocus
            />
          </div>
          
          <div className="modal-field">
            <label htmlFor="shell-type">Shell</label>
            <select
              id="shell-type"
              value={shellType}
              onChange={e => setShellType(e.target.value as ShellType)}
              disabled={isCreating}
            >
              {availableShells.map(shell => (
                <option key={shell.id} value={shell.id}>
                  {shell.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="modal-field">
            <label htmlFor="working-dir">Working Directory</label>
            <input
              id="working-dir"
              type="text"
              value={workingDirectory}
              onChange={e => setWorkingDirectory(e.target.value)}
              placeholder="e.g., C:\Projects\my-app"
              disabled={isCreating}
            />
          </div>
          
          <div className="modal-field">
            <label htmlFor="startup-cmd">Startup Command (optional)</label>
            <input
              id="startup-cmd"
              type="text"
              value={startupCommand}
              onChange={e => setStartupCommand(e.target.value)}
              placeholder="e.g., npm run dev"
              disabled={isCreating}
            />
          </div>
          
          <div className="modal-actions">
            <button
              type="button"
              className="modal-button cancel"
              onClick={handleClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-button submit"
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
