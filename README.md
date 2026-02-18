# Terminal Orchestrator

A cross-platform desktop application for managing multiple terminal sessions grouped into projects.

![Terminal Orchestrator](docs/screenshot.png)

## Features

- **Project-based organization**: Group terminals by project
- **Multiple shell support**: CMD, PowerShell, bash, zsh (platform-dependent)
- **Real PTY terminals**: Full interactive terminal support with xterm.js
- **Drag & drop**: Drop folders to create projects
- **Orchestration controls**: Start/stop all terminals at once
- **State persistence**: Projects and terminals are saved automatically

## Tech Stack

- **Electron 31** - Desktop framework
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool (electron-vite)
- **xterm.js** - Terminal emulator
- **node-pty** - PTY (pseudo terminal) support
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **electron-store** - Persistence

## Prerequisites

- **Node.js 18+**

That's it! `npm install` will automatically download prebuilt binaries for native modules. You only need additional build tools if you encounter compilation errors (see Known Issues).

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd terminal-orchestrator

# Install dependencies
npm install

# Rebuild native modules for Electron
npm run rebuild

# Start development server
npm run dev
```

## Development

```bash
# Start development server with hot reload
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
terminal-orchestrator/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Entry point
│   │   ├── ipc/           # IPC handlers
│   │   ├── pty/           # PTY manager (node-pty)
│   │   └── store/         # Config persistence
│   │
│   ├── preload/           # Preload scripts (IPC bridge)
│   │   └── index.ts
│   │
│   ├── renderer/          # React app
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── store/
│   │   │   └── App.tsx
│   │   └── index.html
│   │
│   └── shared/            # Shared types and IPC definitions
│       ├── types.ts
│       └── ipc.ts
│
├── electron.vite.config.ts
├── package.json
└── tailwind.config.js
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation.

## Platform Support

- **Windows** - Full support with CMD and PowerShell
- **macOS** - Full support with Terminal (bash/zsh)

## Troubleshooting

### Windows: Build errors during `npm install`

If you encounter errors about missing build tools or "Spectre-mitigated libraries", install **Visual Studio Build Tools 2022** with:
- MSVC v143 - VS 2022 C++ x64/x86 build tools
- Windows 10/11 SDK
- **Spectre-mitigated libraries**

To install Spectre libraries: Visual Studio Installer → Modify Build Tools 2022 → Individual Components → Search "Spectre" → Check "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)" → Modify

## License

MIT
