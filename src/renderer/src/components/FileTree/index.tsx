import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import type { FileEntry } from '@shared/ipc'

interface FileTreeProps {
  rootPath: string
  onFileClick?: (file: FileEntry) => void
  onFolderClick?: (folder: FileEntry) => void
}

// File icon component
function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.isDirectory) {
    return <span className="text-yellow-400">📁</span>
  }
  
  const ext = entry.extension?.toLowerCase() || ''
  
  // Language icons
  const iconMap: Record<string, string> = {
    '.ts': '📘',
    '.tsx': '📘',
    '.js': '📙',
    '.jsx': '📙',
    '.json': '📋',
    '.md': '📝',
    '.css': '🎨',
    '.scss': '🎨',
    '.html': '🌐',
    '.py': '🐍',
    '.rs': '🦀',
    '.go': '🐹',
    '.java': '☕',
    '.rb': '💎',
    '.php': '🐘',
    '.c': '⚙️',
    '.cpp': '⚙️',
    '.h': '⚙️',
    '.sh': '📜',
    '.yml': '📋',
    '.yaml': '📋',
    '.xml': '📋',
    '.sql': '🗃️',
    '.gitignore': '🔒',
    '.env': '🔒',
    '.png': '🖼️',
    '.jpg': '🖼️',
    '.jpeg': '🖼️',
    '.gif': '🖼️',
    '.svg': '🎨',
    '.pdf': '📄',
    '.zip': '📦',
    '.tar': '📦',
    '.gz': '📦',
  }
  
  return <span>{iconMap[ext] || '📄'}</span>
}

// Tree node component
function TreeNode({
  entry,
  depth = 0,
  onFileClick,
  onFolderClick,
  expandedPaths,
  toggleExpand,
  loadChildren
}: {
  entry: FileEntry
  depth?: number
  onFileClick?: (file: FileEntry) => void
  onFolderClick?: (folder: FileEntry) => void
  expandedPaths: Set<string>
  toggleExpand: (path: string) => void
  loadChildren: (path: string) => Promise<FileEntry[]>
}) {
  const [children, setChildren] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const isExpanded = expandedPaths.has(entry.path)
  
  useEffect(() => {
    if (isExpanded && entry.isDirectory && children.length === 0) {
      setIsLoading(true)
      loadChildren(entry.path).then(entries => {
        setChildren(entries)
        setIsLoading(false)
      })
    }
  }, [isExpanded, entry.path, entry.isDirectory, children.length, loadChildren])
  
  const handleClick = () => {
    if (entry.isDirectory) {
      toggleExpand(entry.path)
      onFolderClick?.(entry)
    } else {
      onFileClick?.(entry)
    }
  }
  
  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#2a2d2e] rounded group`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {entry.isDirectory ? (
          <span className={`text-xs text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        ) : (
          <span className="w-3" />
        )}
        <FileIcon entry={entry} />
        <span className="text-sm truncate flex-1">{entry.name}</span>
      </div>
      
      {isExpanded && entry.isDirectory && (
        <div>
          {isLoading ? (
            <div className="px-2 py-1 text-xs text-gray-500" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
              Loading...
            </div>
          ) : (
            children.map(child => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                onFileClick={onFileClick}
                onFolderClick={onFolderClick}
                expandedPaths={expandedPaths}
                toggleExpand={toggleExpand}
                loadChildren={loadChildren}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function FileTree({ rootPath, onFileClick, onFolderClick }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  
  // Load directory contents
  const loadDirectory = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
    try {
      const entries = await window.electronAPI?.fs.readDir({ path: dirPath })
      return entries || []
    } catch (err) {
      console.error(`Failed to load directory ${dirPath}:`, err)
      return []
    }
  }, [])
  
  // Load root directory on mount
  useEffect(() => {
    if (!rootPath) return
    
    setIsLoading(true)
    setError(null)
    
    loadDirectory(rootPath)
      .then(entries => {
        setRootEntries(entries)
        setIsLoading(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load directory')
        setIsLoading(false)
      })
  }, [rootPath, loadDirectory])
  
  // Toggle expand/collapse
  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])
  
  // Collapse all
  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set())
  }, [])
  
  // Expand all (expand first level folders)
  const expandAll = useCallback(() => {
    const folderPaths = new Set<string>()
    const addFolders = (entries: FileEntry[]) => {
      entries.forEach(entry => {
        if (entry.isDirectory) {
          folderPaths.add(entry.path)
        }
      })
    }
    addFolders(rootEntries)
    setExpandedPaths(folderPaths)
  }, [rootEntries])
  
  // Compute folder name - must be before any conditional returns
  const folderName = useMemo(() => {
    if (!rootPath) return ''
    return rootPath.split(/[\\/]/).pop() || rootPath
  }, [rootPath])
  
  if (!rootPath) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        No folder open
      </div>
    )
  }
  
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        Loading...
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 text-sm">
        {error}
      </div>
    )
  }
  
  return (
    <div className="h-full flex flex-col bg-sidebar-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-color">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={collapseAll}
            className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white"
            title="Collapse All"
          >
            ⊟
          </button>
          <button
            onClick={expandAll}
            className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white"
            title="Expand All"
          >
            ⊞
          </button>
        </div>
      </div>
      
      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Root folder */}
        <div>
          <div
            className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[#2a2d2e] rounded font-medium"
            onClick={() => toggleExpand(rootPath)}
          >
            <span className={`text-xs text-gray-400 transition-transform ${expandedPaths.has(rootPath) ? 'rotate-90' : ''}`}>
              ▶
            </span>
            <span className="text-yellow-400">📁</span>
            <span className="text-sm truncate">{folderName}</span>
          </div>
          
          {expandedPaths.has(rootPath) && (
            <div>
              {rootEntries.map(entry => (
                <TreeNode
                  key={entry.path}
                  entry={entry}
                  depth={0}
                  onFileClick={onFileClick}
                  onFolderClick={onFolderClick}
                  expandedPaths={expandedPaths}
                  toggleExpand={toggleExpand}
                  loadChildren={loadDirectory}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Memoize FileTree to prevent unnecessary re-renders when parent updates
export default memo(FileTree)
