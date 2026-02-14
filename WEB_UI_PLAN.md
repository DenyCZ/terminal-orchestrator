# Mobile Web UI Implementation Plan

## Overview
Add a mobile-accessible web UI to the Terminal Orchestrator Electron app. When enabled, users can access the application from mobile browsers via a local network URL. The feature is **only active when the Electron app is running**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ELECTRON MAIN PROCESS                              │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  PtyManager  │  │ ConfigStore  │  │ WebServer    │  │ WebSocketServer  │  │
│  │  (existing)  │  │  (existing)  │  │  (NEW)       │  │     (NEW)        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                 │                   │            │
│         └─────────────────┴─────────────────┴───────────────────┘            │
│                                   │                                          │
│                         ┌─────────▼──────────┐                               │
│                         │   API Bridge Layer  │                              │
│                         │  (routes/ws handlers)│                             │
│                         └─────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
            ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
            │   Desktop    │   │   Mobile     │   │   Mobile     │
            │   (Electron) │   │  (Browser)   │   │  (Browser)   │
            └──────────────┘   └──────────────┘   └──────────────┘
```

## Components Breakdown

### 1. Web Server Module (`src/main/web-server/`)

**Purpose**: HTTP server exposing REST API and serving the mobile UI

**Files**:
- `index.ts` - Main server class, lifecycle management
- `routes.ts` - API route definitions
- `middleware.ts` - CORS, auth, logging
- `types.ts` - Request/response types

**Key Responsibilities**:
- Start/stop server on configurable port (default: 3000)
- Serve static mobile UI files
- Handle REST API requests
- Enable/disable based on settings
- Auto-discover local IP addresses for connection info

**API Endpoints**:
```typescript
// Projects
GET    /api/projects                    // List all projects
POST   /api/projects                    // Create project
PUT    /api/projects/:id                // Update project
DELETE /api/projects/:id                // Delete project

// Terminals
GET    /api/projects/:id/terminals      // List terminals in project
POST   /api/projects/:id/terminals      // Create terminal
PUT    /api/terminals/:id               // Update terminal
DELETE /api/terminals/:id               // Delete terminal
POST   /api/terminals/:id/start         // Start terminal
POST   /api/terminals/:id/stop          // Stop terminal
POST   /api/terminals/:id/restart       // Restart terminal
POST   /api/terminals/:id/resize        // Resize terminal (cols, rows)

// Config
GET    /api/config                      // Get full config
PUT    /api/config/settings             // Update settings

// Web UI Info
GET    /api/status                      // Server status, IP, port
```

### 2. WebSocket Server Module (`src/main/ws-server/`)

**Purpose**: Real-time bidirectional communication for terminal data

**Files**:
- `index.ts` - WebSocket server management
- `terminal-session.ts` - Per-terminal session handling
- `auth.ts` - Connection authentication

**Key Responsibilities**:
- Handle WebSocket connections from mobile clients
- Bridge PTY data between main process and web clients
- Manage terminal sessions (one WS per terminal view)
- Handle input/output streaming

**WebSocket Events**:
```typescript
// Client -> Server
{ type: 'subscribe', terminalId: string }     // Start receiving terminal data
{ type: 'unsubscribe', terminalId: string }   // Stop receiving
{ type: 'input', terminalId: string, data: string }  // User typed input
{ type: 'resize', terminalId: string, cols: number, rows: number }

// Server -> Client
{ type: 'output', terminalId: string, data: string }  // Terminal output
{ type: 'status', terminalId: string, status: TerminalStatus }
{ type: 'error', terminalId: string, message: string }
```

### 3. Mobile Web UI (`src/mobile/`)

**Purpose**: React app optimized for mobile browsers

**Structure**:
```
src/mobile/
├── index.html              # Entry HTML
├── main.tsx               # React entry point
├── App.tsx                # Root component
├── api/                   # API client
│   ├── client.ts          # HTTP client (axios/fetch)
│   └── websocket.ts       # WebSocket client
├── components/            # React components
│   ├── Layout/            # Mobile layout (bottom nav, etc.)
│   ├── ProjectList/       # Project listing
│   ├── TerminalView/      # Mobile terminal (xterm.js)
│   ├── TerminalTabs/      # Swipeable terminal tabs
│   └── ConnectionStatus/  # Connection indicator
├── hooks/                 # Custom hooks
│   ├── useWebSocket.ts    # WebSocket connection hook
│   └── useTerminal.ts     # Terminal session hook
└── store/                 # Zustand store (simplified)
    └── index.ts
```

**UI Design Principles**:
- Bottom navigation bar for project switching
- Swipeable terminal tabs within projects
- Touch-friendly controls (large buttons)
- Virtual keyboard handling (auto-scroll on input)
- Dark theme optimized for OLED
- QR code scanner for easy connection

### 4. Security Layer

**Authentication**:
- Simple PIN-based auth (4-8 digits)
- PIN displayed in desktop app settings
- JWT token stored in mobile browser localStorage
- Token required for all API/WebSocket calls

**Network Security**:
- Only bind to local network interfaces (0.0.0.0)
- CORS configured for local network only
- Rate limiting on API endpoints
- WebSocket connection limit per IP

### 5. Settings Integration

**New Settings (in `AppSettings`)**:
```typescript
interface WebUISettings {
  enabled: boolean;           // Master toggle
  port: number;               // Server port (default: 3000)
  pin: string;                // Access PIN (auto-generated)
  allowRemote: boolean;       // Allow connections from any IP (vs localhost only)
  showQRCode: boolean;        // Show QR code in desktop app
}
```

**UI Changes**:
- Add "Mobile Web UI" section in SettingsModal
- Toggle switch to enable/disable
- Port input field
- PIN display (regenerate button)
- QR code display for easy mobile connection
- Status indicator (running/stopped)

## Implementation Phases

### Phase 1: Core Infrastructure (Priority: High)
1. Install dependencies (express, ws, cors, qrcode, ip)
2. Create WebServer class with start/stop lifecycle
3. Create basic REST API routes (projects, terminals)
4. Integrate with main process (start/stop with app)
5. Add settings UI for enable/disable

### Phase 2: Terminal Streaming (Priority: High)
1. Create WebSocket server
2. Implement PTY data bridging
3. Create mobile TerminalView with xterm.js
4. Handle input/output streaming
5. Test terminal functionality on mobile

### Phase 3: Mobile UI Polish (Priority: Medium)
1. Create mobile-optimized layout
2. Implement project/terminal navigation
3. Add touch gestures (swipe between terminals)
4. Virtual keyboard handling
5. Responsive design testing

### Phase 4: Security & UX (Priority: Medium)
1. Implement PIN authentication
2. Add JWT token handling
3. Create QR code display in desktop app
4. Add connection status indicators
5. Rate limiting and security hardening

### Phase 5: Advanced Features (Priority: Low)
1. Offline mode (queue commands when disconnected)
2. Mobile-specific features (shake to refresh, etc.)
3. Biometric auth (Face ID/Touch ID) for mobile
4. Push notifications for terminal completion

## Dependencies to Add

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.16.0",
    "cors": "^2.8.5",
    "qrcode": "^1.5.3",
    "ip": "^2.0.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10",
    "@types/qrcode": "^1.5.5",
    "@types/ip": "^2.0.3"
  }
}
```

## File Changes Required

### New Files
```
src/main/web-server/
├── index.ts
├── routes.ts
├── middleware.ts
└── types.ts

src/main/ws-server/
├── index.ts
├── terminal-session.ts
└── auth.ts

src/mobile/
├── index.html
├── main.tsx
├── App.tsx
├── api/
│   ├── client.ts
│   └── websocket.ts
├── components/
│   ├── Layout/
│   ├── ProjectList/
│   ├── TerminalView/
│   ├── TerminalTabs/
│   └── ConnectionStatus/
├── hooks/
│   ├── useWebSocket.ts
│   └── useTerminal.ts
└── store/
    └── index.ts
```

### Modified Files
- `src/main/index.ts` - Add web server initialization
- `src/shared/types.ts` - Add WebUI settings
- `src/renderer/src/components/SettingsModal/index.tsx` - Add web UI settings UI
- `electron.vite.config.ts` - Add mobile build target
- `package.json` - Add new dependencies

## Technical Considerations

### PTY Data Flow
```
Mobile Browser -> WebSocket -> WS Server -> PtyManager -> node-pty
                                    ^
                                    |
Mobile Browser <- WebSocket <- WS Server <- PtyManager <- node-pty
```

### State Synchronization
- Desktop app remains source of truth
- Mobile UI polls for project/terminal list changes
- WebSocket provides real-time terminal data
- Config changes trigger mobile UI refresh

### Mobile Terminal Experience
- Use xterm.js (same as desktop) for consistency
- Fixed height with scrollback support
- Custom mobile keyboard handling
- Touch gestures for copy/paste

### Network Discovery
- Auto-detect local IP addresses
- Display all available URLs (WiFi, Ethernet)
- QR code generation for easy mobile connection
- mDNS/Bonjour for hostname-based connection (optional)

## Testing Strategy

1. **Unit Tests**: API endpoints, WebSocket handlers
2. **Integration Tests**: Full mobile-to-desktop flow
3. **Device Testing**: iOS Safari, Android Chrome
4. **Network Testing**: Different network configurations
5. **Security Testing**: Auth, CORS, rate limiting

## Success Criteria

- [ ] Mobile browser can connect to desktop app via local network
- [ ] View and switch between projects
- [ ] View and switch between terminals
- [ ] Interactive terminal input/output works
- [ ] Terminal start/stop controls work
- [ ] PIN authentication secures access
- [] QR code enables easy connection
- [ ] Settings allow enable/disable and configuration
- [ ] Feature is completely disabled when turned off
- [ ] No performance impact on desktop app when disabled
