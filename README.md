# Terminal Orchestrator

A Windows desktop application for managing multiple terminal sessions grouped into projects.

![Terminal Orchestrator](docs/screenshot.png)

## Features

- **Project-based organization**: Group terminals by project
- **Multiple shell support**: CMD and PowerShell
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

### Windows Build Tools (Required for node-pty)

node-pty requires native compilation. You need:

1. **Visual Studio Build Tools 2022** with:
   - MSVC v143 - VS 2022 C++ x64/x86 build tools
   - Windows 10/11 SDK
   - **Spectre-mitigated libraries** (required for node-pty)

   To install Spectre libraries:
   - Open Visual Studio Installer
   - Click "Modify" on Build Tools 2022
   - Go to "Individual Components"
   - Search for "Spectre"
   - Check "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)"
   - Click "Modify" to install

2. **Node.js 18+**

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

## Known Issues

### node-pty Build Failures

If you see errors about "Spectre-mitigated libraries":
```
error MSB8040: Pro tento projekt se požadují knihovny s omezením hrozby Spectre
```

This means you need to install Spectre libraries in Visual Studio Build Tools. See Prerequisites above.

### Alternative: Using Prebuilt Binaries

If you can't install Spectre libraries, you can try using prebuilt binaries:

```bash
# Try using prebuilt binaries
npm install --ignore-scripts
npx @electron/rebuild -v -w node-pty
```

## License

MIT
