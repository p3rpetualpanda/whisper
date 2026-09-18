# Whisper

A real-time instant messaging web app. Browser-based, no build step — just `npm install` and `npm start`.

## Features

- **Join with a display name** — no accounts, no passwords
- **Group rooms** — create named rooms and chat with everyone inside
- **1-on-1 DMs** — click any online user in the sidebar to open a private chat
- **Typing indicators** — see when someone is typing in the current room
- **Online presence** — live list of who's online, with join/leave notices in the lobby
- **Reconnection** — Socket.IO auto-reconnects and re-joins your rooms

## Run

```bash
npm install
npm start
```

Then open http://localhost:3000 in a browser. Open a second tab (or another browser) and join with a different name to test DMs and group chat.

Set a custom port with `PORT=8080 npm start`.

### Tests

An end-to-end test (two simulated clients over the real Socket.IO protocol) covers join, presence, group rooms, DMs, typing, and disconnect. Start the server in one terminal, then:

```bash
npm test
```

## Architecture

```
whisper/
├── server.js            # Express + Socket.IO server (in-memory state)
├── public/
│   ├── index.html       # App shell (name prompt, sidebar, chat pane, room modal)
│   ├── style.css        # Dark two-pane chat UI
│   └── app.js           # Client: socket events, room switching, DMs, typing
└── package.json
```

### Server model

- **Users** — `socketId → { name }` map. Identity is the display name chosen at join.
- **Rooms** — three kinds:
  - `lobby` — everyone is in it by default; shows join/leave system messages
  - `group` — created via `create-room`; anyone can join from the sidebar
  - `dm` — auto-created per user pair (keyed by sorted socket IDs); both parties are added when either opens it
- **Events** (client → server): `join`, `list`, `create-room`, `join-room`, `leave-room`, `dm-open`, `message`, `typing`
- **Events** (server → client): `message`, `system`, `presence`, `rooms-updated`, `dm-opened`, `typing`

Room lists are emitted **per socket** so each client sees the correct DM peer name.

### Security notes

- Message text is rendered with `textContent` (no `innerHTML`), so user input is XSS-safe.
- Names and messages are length-capped server-side (30 / 2000 chars).
- State is in-memory: a server restart clears all rooms and users.

## Scope & limitations

- No authentication or persistence (by design — this is the "core" scope).
- DMs are identified by display name; two users with the same name will collide.
- No message history is kept after a room is closed or the server restarts.
