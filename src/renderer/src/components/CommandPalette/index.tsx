import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppStore } from '../../store';
import { fuzzySearch, highlightMatches } from '../../utils/fuzzy';
import { getAvailableCommands, type CommandType } from '../../utils/commandParser';
import type { Project, Terminal } from '@shared/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  onNewTerminal?: () => void;
  onNewProject?: () => void;
  onNewWorktree?: () => void;
  onOpenSettings?: () => void;
}

interface SuggestionItem {
  id: string;
  type: 'command' | 'project' | 'terminal';
  label: string;
  subtitle?: string;
  data?: Project | Terminal | { command: CommandType; description: string };
  matches?: number[];
}

export default function CommandPalette({ 
  isOpen, 
  onClose, 
  initialQuery = '',
  onNewTerminal,
  onNewProject,
  onNewWorktree,
  onOpenSettings
}: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  
  const {
    projects,
    activeProjectId,
    activeTerminalId,
    setActiveProject,
    setActiveTerminal,
    startTerminal,
    stopTerminal,
    restartTerminal,
    deleteTerminal
  } = useAppStore();

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      // Focus input after DOM paint using double rAF for reliability
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      });
    }
  }, [isOpen, initialQuery]);

  // Generate suggestions based on query
  const suggestions = useMemo((): SuggestionItem[] => {
    const items: SuggestionItem[] = [];
    const lowerQuery = query.toLowerCase().trim();

    // If query is empty, show common commands and recent items
    if (!lowerQuery) {
      // Show top commands (includes new worktree, excludes new-project)
      const commands = getAvailableCommands().filter(c => c.command !== 'new-project').slice(0, 6);
      commands.forEach(cmd => {
        items.push({
          id: `cmd-${cmd.command}`,
          type: 'command',
          label: cmd.command,
          subtitle: cmd.description,
          data: { command: cmd.command as CommandType, description: cmd.description }
        });
      });

      // Show current context
      const activeProject = projects.find(p => p.id === activeProjectId);
      if (activeProject) {
        items.push({
          id: `project-${activeProject.id}`,
          type: 'project',
          label: activeProject.name,
          subtitle: 'Current project',
          data: activeProject
        });
        
        activeProject.terminals.slice(0, 3).forEach(t => {
          items.push({
            id: `terminal-${t.id}`,
            type: 'terminal',
            label: t.name,
            subtitle: `${t.status} • ${activeProject.name}`,
            data: t
          });
        });
      }

      return items;
    }

    // If it starts with "new", show creation options
    if (lowerQuery.startsWith('new')) {
      if (lowerQuery.includes('project') || lowerQuery === 'new p' || lowerQuery === 'np') {
        items.push({
          id: 'create-project',
          type: 'command',
          label: 'Create new project',
          subtitle: 'Add a new project to the workspace',
          data: { command: 'new-project', description: 'Create new project' }
        });
      } else if (lowerQuery.includes('worktree') || lowerQuery === 'new w' || lowerQuery === 'nw' || lowerQuery === 'wt') {
        items.push({
          id: 'create-worktree',
          type: 'command',
          label: 'Create new git worktree',
          subtitle: 'Create a new worktree with terminal',
          data: { command: 'new-worktree', description: 'Create new git worktree' }
        });
      } else {
        items.push({
          id: 'create-terminal',
          type: 'command',
          label: 'Create new terminal',
          subtitle: 'Add a new terminal to current project',
          data: { command: 'new-terminal', description: 'Create new terminal' }
        });
        items.push({
          id: 'create-worktree',
          type: 'command',
          label: 'Create new git worktree',
          subtitle: 'Create a new worktree with terminal',
          data: { command: 'new-worktree', description: 'Create new git worktree' }
        });
      }
    }

    // Search commands
    const commandResults = fuzzySearch(
      getAvailableCommands(),
      lowerQuery,
      (cmd) => [cmd.command, ...cmd.aliases, cmd.description]
    );
    
    commandResults.slice(0, 3).forEach(result => {
      items.push({
        id: `cmd-${result.item.command}`,
        type: 'command',
        label: result.item.command,
        subtitle: result.item.description,
        data: { command: result.item.command as CommandType, description: result.item.description },
        matches: result.matches
      });
    });

    // Search projects
    const projectResults = fuzzySearch(
      projects,
      lowerQuery,
      (p) => [p.name, p.rootDirectory || '']
    );

    projectResults.slice(0, 5).forEach(result => {
      const isActive = result.item.id === activeProjectId;
      items.push({
        id: `project-${result.item.id}`,
        type: 'project',
        label: result.item.name,
        subtitle: isActive ? 'Active project' : `${result.item.terminals.length} terminals`,
        data: result.item,
        matches: result.matches
      });
    });

    // Search terminals in active project
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (activeProject) {
      const terminalResults = fuzzySearch(
        activeProject.terminals,
        lowerQuery,
        (t) => [t.name, t.shellType, t.workingDirectory]
      );

      terminalResults.slice(0, 5).forEach(result => {
        const isActive = result.item.id === activeTerminalId;
        items.push({
          id: `terminal-${result.item.id}`,
          type: 'terminal',
          label: result.item.name,
          subtitle: `${result.item.status} • ${isActive ? 'Active' : result.item.shellType}`,
          data: result.item,
          matches: result.matches
        });
      });
    }

    // Also search terminals in other projects if query is specific enough
    if (lowerQuery.length >= 2) {
      projects.forEach(project => {
        if (project.id === activeProjectId) return;
        
        const terminalResults = fuzzySearch(
          project.terminals,
          lowerQuery,
          (t) => [t.name, `${project.name}/${t.name}`]
        );

        terminalResults.slice(0, 2).forEach(result => {
          items.push({
            id: `terminal-${result.item.id}`,
            type: 'terminal',
            label: result.item.name,
            subtitle: `${project.name} • ${result.item.status}`,
            data: { ...result.item, projectId: project.id }
          });
        });
      });
    }

    // Deduplicate by id
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

  }, [query, projects, activeProjectId, activeTerminalId]);

  // Ensure selected index is valid
  useEffect(() => {
    if (selectedIndex >= suggestions.length) {
      setSelectedIndex(Math.max(0, suggestions.length - 1));
    }
  }, [suggestions.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && suggestions.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, suggestions.length]);

  // Execute selected action
  const executeAction = useCallback(async (item: SuggestionItem) => {
    if (!item.data) return;

    switch (item.type) {
      case 'project': {
        const project = item.data as Project;
        setActiveProject(project.id);
        break;
      }
      case 'terminal': {
        const terminal = item.data as Terminal & { projectId?: string };
        const projectId = terminal.projectId || activeProjectId;
        if (projectId && terminal.id !== activeTerminalId) {
          // First switch project if needed
          const parentProject = projects.find(p => 
            p.terminals.some(t => t.id === terminal.id)
          );
          if (parentProject && parentProject.id !== activeProjectId) {
            setActiveProject(parentProject.id);
          }
          setTimeout(() => setActiveTerminal(terminal.id), 0);
        }
        break;
      }
      case 'command': {
        const cmd = item.data as { command: CommandType; description: string };
        const activeProject = projects.find(p => p.id === activeProjectId);
        const activeTerminal = activeProject?.terminals.find(t => t.id === activeTerminalId);

        switch (cmd.command) {
          case 'run':
            if (activeProject && activeTerminal) {
              await startTerminal(activeProject.id, activeTerminal.id);
            }
            break;
          case 'stop':
            if (activeTerminal) {
              await stopTerminal(activeTerminal.id);
            }
            break;
          case 'restart':
            if (activeProject && activeTerminal) {
              await restartTerminal(activeProject.id, activeTerminal.id);
            }
            break;
          case 'delete':
            if (activeTerminal && activeProject) {
              if (confirm(`Delete terminal "${activeTerminal.name}"?`)) {
                await deleteTerminal(activeProject.id, activeTerminal.id);
              }
            }
            break;
          case 'new-terminal':
            onClose();
            onNewTerminal?.();
            return; // Don't close palette - let parent handle it
          case 'new-project':
            onClose();
            onNewProject?.();
            return; // Don't close palette - let parent handle it
          case 'new-worktree':
            onClose();
            onNewWorktree?.();
            return; // Don't close palette - let parent handle it
          case 'start-all':
            if (activeProject) {
              for (const t of activeProject.terminals) {
                if (t.status !== 'running') {
                  await startTerminal(activeProject.id, t.id);
                }
              }
            }
            break;
          case 'stop-all':
            if (activeProject) {
              for (const t of activeProject.terminals) {
                if (t.status === 'running') {
                  await stopTerminal(t.id);
                }
              }
            }
            break;
          case 'clear':
            // This is handled by the terminal view
            break;
          case 'help':
            // Already showing suggestions
            break;
          case 'settings':
            onClose();
            onOpenSettings?.();
            return; // Don't close palette - let parent handle it
        }
        break;
      }
    }

    onClose();
  }, [
    activeProjectId, 
    activeTerminalId, 
    projects, 
    setActiveProject, 
    setActiveTerminal, 
    startTerminal, 
    stopTerminal, 
    restartTerminal, 
    deleteTerminal,
    onClose,
    onNewTerminal,
    onNewProject,
    onNewWorktree
  ]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          executeAction(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        // Tab completes with the first suggestion
        if (suggestions[0] && query.length > 0) {
          setQuery(suggestions[0].label);
        }
        break;
    }
  }, [suggestions, selectedIndex, executeAction, onClose, query]);

  // Handle click outside
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="command-palette-backdrop"
      onClick={handleBackdropClick}
    >
      <div className="command-palette">
        {/* Input */}
        <div className="command-palette-input-wrapper">
          <span className="command-palette-prefix">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, project, or terminal name..."
            className="command-palette-input"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Suggestions */}
        <div className="command-palette-suggestions" ref={listRef}>
          {suggestions.length === 0 ? (
            <div className="command-palette-empty">
              <p>No results found</p>
              <p className="text-xs text-gray-500 mt-1">
                Try: "new terminal", "run", a project name, or "help"
              </p>
            </div>
          ) : (
            suggestions.map((item, index) => (
              <div
                key={item.id}
                className={`command-palette-item ${
                  index === selectedIndex ? 'selected' : ''
                }`}
                onClick={() => executeAction(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="command-palette-item-icon">
                  {item.type === 'command' && '⚡'}
                  {item.type === 'project' && '📁'}
                  {item.type === 'terminal' && '⬡'}
                </div>
                <div className="command-palette-item-content">
                  <div className="command-palette-item-label">
                    {item.matches ? (
                      highlightMatches(item.label, item.matches).map((seg, i) => (
                        <span 
                          key={i} 
                          className={seg.isMatch ? 'match-highlight' : ''}
                        >
                          {seg.text}
                        </span>
                      ))
                    ) : (
                      item.label
                    )}
                  </div>
                  {item.subtitle && (
                    <div className="command-palette-item-subtitle">
                      {item.subtitle}
                    </div>
                  )}
                </div>
                <div className="command-palette-item-type">
                  {item.type}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="command-palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>Tab</kbd> complete</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
