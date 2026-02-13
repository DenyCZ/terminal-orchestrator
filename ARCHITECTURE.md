# Terminal Orchestrator - Technical Architecture

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Desktop Framework | Electron 28+ | Mature, great TypeScript support, native module ecosystem |
| Build Tool | Vite + electron-vite | Fast HMR, modern tooling, native module support |
| Frontend | React 18 + TypeScript | Component-based UI, type safety |
| Terminal Emulator | xterm.js | Industry standard (VS Code uses it) |
| PTY Layer | node-pty | Native PTY support, Windows compatible |
| State Management | Zustand | Lightweight, no boilerplate |
| Styling | Tailwind CSS | Rapid UI development |
| Storage | JSON file | Simple, human-readable, portable |

## Project Structure

```
terminal-orchestrator/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts            # Entry point
│   │   ├── ipc/                # IPC handlers
│   │   │   ├── index.ts        # IPC router
│   │   │   ├── projects.ts     # Project CRUD handlers
│   │   │   ├── terminals.ts    # Terminal management handlers
│   │   │   └── config.ts       # Config handlers
│   │   ├── pty/                # PTY management
│   │   │   ├── index.ts        # PTY manager
│   │   │   └── types.ts        # PTY types
│   │   └── store/              # Persistence layer
│   │       ├── index.ts        # Store manager
│   │       └── schema.ts       # Data schema
│   │
│   ├── renderer/               # Electron renderer (React)
│   │   ├── index.html
│   │   ├── main.tsx            # React entry
│   │   ├── App.tsx             # Root component
│   │   ├── components/         # React components
│   │   │   ├── Sidebar/        # Project/terminal list
│   │   │   ├── TerminalView/   # xterm.js wrapper
│   │   │   ├── Toolbar/        # Orchestration controls
│   │   │   └── common/         # Shared UI components
│   │   ├── hooks/              # Custom hooks
│   │   ├── store/              # Zustand stores
│   │   └── styles/             # CSS/Tailwind
│   │
│   ├── shared/                 # Shared between main/renderer
│   │   ├── types/              # TypeScript interfaces
│   │   │   ├── project.ts
│   │   │   ├── terminal.ts
│   │   │   └── ipc.ts
│   │   └── constants.ts        # Shared constants
│   │
│   └── preload/                # Preload scripts (IPC bridge)
│       └── index.ts            # Expose safe APIs to renderer
│
├── electron.vite.config.ts     # Build config
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

## Core Data Models

### Project
```typescript
interface Project {
  id: string;
  name: string;
  rootDirectory?: string;
  terminals: Terminal[];
  createdAt: number;
  updatedAt: number;
}
```

### Terminal
```typescript
interface Terminal {
  id: string;
  projectId: string;
  name: string;
  shellType: 'cmd' | 'powershell';
  workingDirectory: string;
  startupCommand?: string;
  status: 'idle' | 'running' | 'stopped' | 'error';
  pid?: number;
  createdAt: number;
  updatedAt: number;
}
```

### App Configuration
```typescript
interface AppConfig {
  projects: Project[];
  settings: {
    defaultShell: 'cmd' | 'powershell';
    theme: 'dark' | 'light';
  };
}
```

## IPC Architecture

### Channels (Main → Renderer)
- `terminal:data` - Terminal output data
- `terminal:exit` - Terminal process exited
- `terminal:error` - Terminal error

### Channels (Renderer → Main)
- `project:list` - Get all projects
- `project:create` - Create project
- `project:update` - Update project
- `project:delete` - Delete project
- `terminal:create` - Create terminal
- `terminal:update` - Update terminal
- `terminal:delete` - Delete terminal
- `terminal:start` - Start terminal process
- `terminal:stop` - Stop terminal process
- `terminal:restart` - Restart terminal process
- `terminal:write` - Write to terminal stdin
- `terminal:resize` - Resize terminal PTY
- `config:load` - Load configuration
- `config:save` - Save configuration

## PTY Management

### Process Flow
1. User clicks "Start" on terminal
2. Renderer sends `terminal:start` via IPC
3. Main process spawns PTY via node-pty
4. PTY data events → sent to renderer via `terminal:data`
5. User input → sent via `terminal:write` → PTY stdin
6. Terminal exit → `terminal:exit` with exit code

### Shell Detection
```typescript
const SHELLS = {
  cmd: process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe',
  powershell: process.env.ProgramFiles 
    ? `${process.env.ProgramFiles}\\PowerShell\\7\\pwsh.exe`
    : 'powershell.exe'
};
```

## State Persistence

### File Location
```
%APPDATA%/terminal-orchestrator/config.json
```

### Auto-save Strategy
- Debounced saves (500ms after change)
- Atomic writes (write to temp, then rename)
- Backup on corruption

## Drag & Drop Flow

1. User drags folder from Explorer
2. Renderer captures `drop` event
3. Extract folder path from `DataTransfer`
4. Depending on drop target:
   - Project item → update project root
   - Terminal item → update terminal cwd
   - Empty area → create new project with folder name

## Security Considerations

1. **No auto-execution**: Commands only run on explicit user action
2. **Path validation**: Verify folder exists before using as cwd
3. **Input sanitization**: Escape special characters in commands
4. **Process isolation**: Each terminal in separate PTY instance
5. **Preload sandbox**: Only expose safe IPC methods

## Performance Targets

| Metric | Target |
|--------|--------|
| App startup | < 300ms |
| Terminal spawn | < 100ms |
| Output latency | < 16ms (60fps) |
| Max concurrent terminals | 20+ |
| Memory per terminal | < 50MB |

## Build & Distribution

### Development
```bash
npm run dev          # Start dev server with HMR
```

### Production
```bash
npm run build        # Build for production
npm run preview      # Preview production build
```

### Distribution
- NSIS installer for Windows
- Auto-update capability (future)
