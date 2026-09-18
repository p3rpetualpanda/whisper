# Whisper — Roadmap

Ideas for future additions, roughly ordered by priority. Each item notes what it touches (server, client, or both) so it's easy to pick up.

## 1. Persistence

**Why:** State is in-memory — a server restart wipes all rooms, users, and messages.

- [ ] **Message history** — store messages per room (SQLite or a JSON file to start; no new infra needed). Load recent history on `join-room` / `dm-open`.
- [ ] **Room persistence** — group rooms survive restarts; DMs re-derive from known user pairs.
- [ ] **User identity** — stable user IDs (see Accounts) so history can be attributed across sessions.
- [ ] **Pagination** — `history` event with `before` cursor + `limit` instead of dumping everything.

## 2. Accounts & identity

**Why:** DMs are keyed by display name, so two users with the same name collide.

- [ ] **Stable user IDs** — server-issued UUID per user (cookie or token), display name becomes a mutable profile field.
- [ ] **Optional login** — simple username + password (bcrypt + session token) or OAuth (GitHub) for people who want persistent identity.
- [ ] **Profiles** — avatar (emoji or image URL), status text, "away" state.
- [ ] **Block/mute** — per-user block list; muted users' messages hidden client-side.

## 3. UX polish

- [ ] **Unread badges** — per-room unread counts in the sidebar; mark read on focus.
- [ ] **Message timestamps** — show time on hover / day dividers between messages.
- [ ] **Edit & delete** — `message-edit` / `message-delete` events (own messages only); show "edited" marker.
- [ ] **Reactions** — emoji reactions on messages, toggle on hover.
- [ ] **Search** — full-text search across rooms (server-side once history exists).
- [ ] **Notifications** — browser Notification API for DMs when the tab is unfocused; optional sound.
- [ ] **Mobile layout** — responsive single-pane view with room list as a drawer.
- [ ] **Theme toggle** — light/dark, persisted in `localStorage`.
- [ ] **Keyboard shortcuts** — `Ctrl+K` room switcher, `Esc` to close modal, `/` to focus input.

## 4. Richer messaging

- [ ] **Markdown / code blocks** — render a safe subset (bold, italic, inline code, fenced blocks) with a small sanitizer.
- [ ] **File sharing** — upload to server (size-capped), download links in chat; images inline.
- [ ] **Voice notes** — record in browser (MediaRecorder), send as audio blob.
- [ ] **Typing indicator in DMs** — already works in rooms; verify/extend for DM panes.
- [ ] **Message threading** — reply-to with a thread view (bigger lift; needs history first).

## 5. Rooms & channels

- [ ] **Room topics/descriptions** — editable by creator, shown in header.
- [ ] **Roles** — creator/moderator can kick members, rename room, pin messages.
- [ ] **Pinned messages** — pin/unpin, shown in room header.
- [ ] **Invite links** — shareable URL that auto-joins a room.
- [ ] **Public room directory** — browse and join rooms created by others.

## 6. Reliability & scale

- [ ] **Rate limiting** — per-socket message throttle to curb spam.
- [ ] **Heartbeat / stale socket cleanup** — prune sockets that disconnect without a `disconnect` event.
- [ ] **Structured logging** — replace console noise with leveled logs (pino/winston).
- [ ] **Health endpoint** — `GET /healthz` for uptime monitoring.
- [ ] **Horizontal scaling** — Socket.IO Redis adapter if we ever need multiple server instances.
- [ ] **Config via env** — port, max message size, rate limits, storage path.

## 7. Testing & quality

- [ ] **Unit tests** — extract server logic (room model, DM keying) into testable modules; cover edge cases (same-name users, rapid join/leave).
- [ ] **CI** — GitHub Actions: `npm ci && npm test` on push (server must be started in the workflow).
- [ ] **Lint** — ESLint for server + client JS.
- [ ] **Load test** — simulate 50–100 concurrent sockets to find bottlenecks.

## 8. Deployment

- [ ] **Dockerfile** — containerize for one-command deploys.
- [ ] **PaaS deploy** — Render/Railway/Fly.io with a public URL (needs WebSocket support).
- [ ] **HTTPS** — required for browser notifications and MediaRecorder on non-localhost.
- [ ] **Process manager** — PM2 or systemd unit for bare-metal hosting.

## Suggested order

1. **Persistence** (history + rooms) — biggest quality jump, unblocks search/edit/delete
2. **Accounts** (stable IDs) — fixes the same-name DM collision
3. **UX polish** (unread badges, timestamps, edit/delete) — makes it feel like a real chat app
4. **Richer messaging** (markdown, file sharing)
5. **Testing/CI + deployment** — so it can live somewhere public
