/**
 * Command parser for the keyboard-first UX.
 * Implements the command grammar:
 * [project] [terminal] [command]
 * 
 * Examples:
 * - "saas" -> switch to project "saas"
 * - "saas api" -> switch to project "saas", terminal "api"
 * - "api run" -> switch to terminal "api", run it
 * - "run" -> run current terminal
 * - "new terminal" -> create new terminal
 * - "new project" -> create new project
 */

import type { Project, Terminal } from '@shared/types';

// All available verbs/commands
export type CommandType = 
  | 'switch-project'
  | 'switch-terminal'
  | 'run'
  | 'stop'
  | 'restart'
  | 'logs'
  | 'kill'
  | 'clone'
  | 'cd'
  | 'rename'
  | 'new-terminal'
  | 'new-project'
  | 'new-worktree'
  | 'delete'
  | 'start-all'
  | 'stop-all'
  | 'clear'
  | 'help'
  | 'settings';

export interface ParsedCommand {
  type: CommandType;
  project?: Project;
  terminal?: Terminal;
  projectName?: string;
  terminalName?: string;
  raw: string;
}

// Command aliases and their mappings
const COMMAND_ALIASES: Record<string, CommandType> = {
  // Navigation
  'p': 'switch-project',
  'project': 'switch-project',
  'projects': 'switch-project',
  't': 'switch-terminal',
  'terminal': 'switch-terminal',
  'terminals': 'switch-terminal',
  
  // Actions
  'run': 'run',
  'start': 'run',
  'r': 'run',
  'stop': 'stop',
  's': 'stop',
  'restart': 'restart',
  'rs': 'restart',
  'logs': 'logs',
  'log': 'logs',
  'kill': 'kill',
  'k': 'kill',
  'clone': 'clone',
  'duplicate': 'clone',
  'cd': 'cd',
  'rename': 'rename',
  'rn': 'rename',
  'delete': 'delete',
  'del': 'delete',
  'rm': 'delete',
  'remove': 'delete',
  
  // Creation
  'new': 'new-terminal',
  'new-terminal': 'new-terminal',
  'nt': 'new-terminal',
  'new-project': 'new-project',
  'np': 'new-project',
  'new-worktree': 'new-worktree',
  'nw': 'new-worktree',
  'worktree': 'new-worktree',
  'wt': 'new-worktree',
  
  // Bulk actions
  'start-all': 'start-all',
  'stop-all': 'stop-all',
  
  // Utility
  'clear': 'clear',
  'cls': 'clear',
  'help': 'help',
  '?': 'help',
  'settings': 'settings',
  'config': 'settings',
  'preferences': 'settings',
  'prefs': 'settings',
};

// Keywords that indicate new entity creation
const NEW_KEYWORDS = ['new', 'create', 'add'];

// Entity keywords
const PROJECT_KEYWORDS = ['project', 'p'];
const TERMINAL_KEYWORDS = ['terminal', 'term', 't'];

/**
 * Parse a command string into a structured command object.
 */
export function parseCommand(
  input: string,
  projects: Project[],
  activeProjectId: string | null,
  activeTerminalId: string | null
): ParsedCommand {
  const trimmed = input.trim().toLowerCase();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  
  if (tokens.length === 0) {
    return { type: 'help', raw: input };
  }

  // Get active context
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeTerminal = activeProject?.terminals.find(t => t.id === activeTerminalId);

  // Check for "new" commands first
  if (NEW_KEYWORDS.includes(tokens[0])) {
    return parseNewCommand(tokens, projects, activeProject);
  }

  // Try to match as a single command verb
  if (tokens.length === 1) {
    const cmdType = COMMAND_ALIASES[tokens[0]];
    if (cmdType) {
      return {
        type: cmdType,
        project: activeProject,
        terminal: activeTerminal,
        raw: input
      };
    }
  }

  // Try to parse as: [project] [terminal] [command]
  const result = parseEntityCommand(tokens, projects, activeProject, activeTerminal);
  if (result) {
    return { ...result, raw: input };
  }

  // Fallback: treat as project/terminal name search
  return parseAsSearch(tokens, projects, activeProject);
}

function parseNewCommand(
  tokens: string[],
  _projects: Project[],
  activeProject: Project | undefined
): ParsedCommand {
  const secondToken = tokens[1];
  
  // "new project" or "new p"
  if (PROJECT_KEYWORDS.includes(secondToken) || secondToken === 'project') {
    const nameTokens = tokens.slice(2);
    return {
      type: 'new-project',
      projectName: nameTokens.join(' ') || undefined,
      raw: tokens.join(' ')
    };
  }
  
  // "new terminal" or "new t"
  if (TERMINAL_KEYWORDS.includes(secondToken) || !secondToken || secondToken === 'terminal') {
    const nameTokens = TERMINAL_KEYWORDS.includes(secondToken) ? tokens.slice(2) : tokens.slice(1);
    return {
      type: 'new-terminal',
      project: activeProject,
      terminalName: nameTokens.join(' ') || undefined,
      raw: tokens.join(' ')
    };
  }

  // "new <name>" - assume terminal
  return {
    type: 'new-terminal',
    project: activeProject,
    terminalName: tokens.slice(1).join(' '),
    raw: tokens.join(' ')
  };
}

function parseEntityCommand(
  tokens: string[],
  projects: Project[],
  activeProject: Project | undefined,
  activeTerminal: Terminal | undefined
): ParsedCommand | null {
  // Find project match
  let matchedProject: Project | undefined;
  let projectTokenCount = 0;
  
  // Try multi-word project name first, then single word
  for (let len = Math.min(tokens.length, 3); len >= 1; len--) {
    const projectQuery = tokens.slice(0, len).join(' ');
    const found = findBestMatch(projectQuery, projects, p => p.name);
    if (found && found.score > 10) {
      matchedProject = found.item;
      projectTokenCount = len;
      break;
    }
  }

  const remainingTokens = tokens.slice(projectTokenCount);
  
  if (remainingTokens.length === 0) {
    // Just a project name
    if (matchedProject) {
      return {
        type: 'switch-project',
        project: matchedProject,
        terminal: matchedProject.terminals[0],
        raw: tokens.join(' ')
      };
    }
    return null;
  }

  // Try to find terminal in the matched (or active) project
  const targetProject = matchedProject || activeProject;
  
  if (!targetProject) {
    return null;
  }

  let matchedTerminal: Terminal | undefined;
  let terminalTokenCount = 0;
  
  for (let len = Math.min(remainingTokens.length, 3); len >= 1; len--) {
    const terminalQuery = remainingTokens.slice(0, len).join(' ');
    const found = findBestMatch(terminalQuery, targetProject.terminals, t => t.name);
    if (found && found.score > 10) {
      matchedTerminal = found.item;
      terminalTokenCount = len;
      break;
    }
  }

  const commandTokens = remainingTokens.slice(terminalTokenCount);
  
  if (commandTokens.length === 0) {
    // Project + terminal, no command
    if (matchedTerminal) {
      return {
        type: 'switch-terminal',
        project: targetProject,
        terminal: matchedTerminal,
        raw: tokens.join(' ')
      };
    }
    // Just a command that looks like a terminal name
    const cmdType = COMMAND_ALIASES[remainingTokens[0]];
    if (cmdType) {
      return {
        type: cmdType,
        project: matchedProject || activeProject,
        terminal: activeTerminal,
        raw: tokens.join(' ')
      };
    }
  }

  // Project + terminal + command
  const cmdType = COMMAND_ALIASES[commandTokens[0]];
  if (cmdType && matchedTerminal) {
    return {
      type: cmdType,
      project: targetProject,
      terminal: matchedTerminal,
      raw: tokens.join(' ')
    };
  }

  // Try: terminal + command (no project specified)
  if (!matchedProject && activeProject) {
    for (let len = Math.min(tokens.length, 2); len >= 1; len--) {
      const terminalQuery = tokens.slice(0, len).join(' ');
      const found = findBestMatch(terminalQuery, activeProject.terminals, t => t.name);
      if (found && found.score > 10) {
        const cmd = tokens.slice(len)[0];
        const cmdT = COMMAND_ALIASES[cmd];
        if (cmdT) {
          return {
            type: cmdT,
            project: activeProject,
            terminal: found.item,
            raw: tokens.join(' ')
          };
        }
      }
    }
  }

  return null;
}

function parseAsSearch(
  tokens: string[],
  projects: Project[],
  activeProject: Project | undefined
): ParsedCommand {
  const query = tokens.join(' ');
  
  // Try to match as project
  const projectMatch = findBestMatch(query, projects, p => p.name);
  if (projectMatch && projectMatch.score > 10) {
    return {
      type: 'switch-project',
      project: projectMatch.item,
      terminal: projectMatch.item.terminals[0],
      projectName: projectMatch.item.name,
      raw: query
    };
  }
  
  // Try to match as terminal in active project
  if (activeProject) {
    const terminalMatch = findBestMatch(query, activeProject.terminals, t => t.name);
    if (terminalMatch && terminalMatch.score > 10) {
      return {
        type: 'switch-terminal',
        project: activeProject,
        terminal: terminalMatch.item,
        terminalName: terminalMatch.item.name,
        raw: query
      };
    }
  }
  
  // Unknown command - treat as potential name
  return {
    type: 'switch-project',
    projectName: query,
    raw: query
  };
}

// Simple fuzzy match helper
function findBestMatch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string
): { item: T; score: number } | null {
  const queryLower = query.toLowerCase();
  let best: { item: T; score: number } | null = null;
  
  for (const item of items) {
    const text = getText(item).toLowerCase();
    
    // Exact match
    if (text === queryLower) {
      return { item, score: 1000 };
    }
    
    // Starts with
    if (text.startsWith(queryLower)) {
      const score = 500 + query.length;
      if (!best || score > best.score) best = { item, score };
      continue;
    }
    
    // Contains
    if (text.includes(queryLower)) {
      const score = 100 + query.length;
      if (!best || score > best.score) best = { item, score };
      continue;
    }
    
    // Fuzzy match - simple character sequence
    let queryIdx = 0;
    let score = 0;
    for (let i = 0; i < text.length && queryIdx < queryLower.length; i++) {
      if (text[i] === queryLower[queryIdx]) {
        score += 10 - i; // Earlier matches score higher
        queryIdx++;
      }
    }
    if (queryIdx === queryLower.length && score > 0) {
      if (!best || score > best.score) best = { item, score };
    }
  }
  
  return best;
}

/**
 * Get all available commands for display/suggestion.
 */
export function getAvailableCommands(): Array<{ command: string; description: string; aliases: string[] }> {
  return [
    { command: 'run', description: 'Start the current terminal', aliases: ['start', 'r'] },
    { command: 'stop', description: 'Stop the current terminal', aliases: ['s'] },
    { command: 'restart', description: 'Restart the current terminal', aliases: ['rs'] },
    { command: 'new-terminal', description: 'Create a new terminal', aliases: ['new', 'nt'] },
    { command: 'new-project', description: 'Create a new project', aliases: ['np'] },
    { command: 'new-worktree', description: 'Create a new git worktree with terminal', aliases: ['nw', 'wt', 'worktree'] },
    { command: 'delete', description: 'Delete the current item', aliases: ['del', 'rm'] },
    { command: 'rename', description: 'Rename current item', aliases: ['rn'] },
    { command: 'clone', description: 'Duplicate current terminal', aliases: ['duplicate'] },
    { command: 'start-all', description: 'Start all terminals in project', aliases: [] },
    { command: 'stop-all', description: 'Stop all terminals in project', aliases: [] },
    { command: 'clear', description: 'Clear terminal screen', aliases: ['cls'] },
    { command: 'help', description: 'Show this help', aliases: ['?'] },
    { command: 'settings', description: 'Open settings to customize shortcuts', aliases: ['config', 'prefs', 'preferences'] },
  ];
}
