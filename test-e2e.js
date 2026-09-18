// E2E test: two clients, group room + DM + typing + presence
const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
// Unique names so the test is deterministic even if other clients (e.g. a
// browser tab) are connected with common names.
const RUN = Date.now().toString(36);
const ALICE = 'Alice-' + RUN;
const BOB = 'Bob-' + RUN;
let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) failures++;
}

function emit(sock, ev, payload) {
  return new Promise((resolve) => sock.emit(ev, payload, resolve));
}

// Global timeout so the test can never hang indefinitely
const globalTimeout = setTimeout(() => {
  console.error('TIMEOUT - test did not finish in 20s');
  process.exit(1);
}, 20000);

(async () => {
  const alice = io(URL, { transports: ['websocket'] });
  const bob = io(URL, { transports: ['websocket'] });

  await new Promise((r) => alice.on('connect', r));
  await new Promise((r) => bob.on('connect', r));

  // 1. Join
  const ja = await emit(alice, 'join', { name: ALICE });
  const jb = await emit(bob, 'join', { name: BOB });
  check('alice joined', ja.ok === true && ja.name === ALICE);
  check('bob joined', jb.ok === true && jb.name === BOB);

  // 2. Presence
  const listA = await emit(alice, 'list');
  check('presence shows both users', listA.online.includes(ALICE) && listA.online.includes(BOB));

  // 3. Create group room
  const cr = await emit(alice, 'create-room', { name: 'General' });
  check('room created', cr.ok === true && cr.room.name === 'General');
  const roomId = cr.room.id;
  await emit(bob, 'join-room', { roomId });

  // 4. Group message
  const msgPromise = new Promise((r) => bob.once('message', r));
  await emit(alice, 'message', { roomId, text: 'Hello Bob!' });
  const msg = await msgPromise;
  check('group message delivered', msg.text === 'Hello Bob!' && msg.sender === ALICE);

  // 5. Typing indicator
  const typingPromise = new Promise((r) => bob.once('typing', r));
  alice.emit('typing', { roomId, typing: true });
  const t = await typingPromise;
  check('typing indicator delivered', t.name === ALICE && t.typing === true);

  // 6. DM open (bob initiates)
  const dmOpenedAlice = new Promise((r) => alice.once('dm-opened', r));
  const dmRes = await emit(bob, 'dm-open', { to: ALICE });
  check('dm opened', dmRes.ok === true && dmRes.peer === ALICE);
  const dmInfo = await dmOpenedAlice;
  check('dm-opened notified other side', dmInfo.peer === BOB);

  // 7. DM message both directions
  const dmMsgBob = new Promise((r) => bob.once('message', (m) => m.roomId === dmRes.roomId && r(m)));
  await emit(alice, 'message', { roomId: dmRes.roomId, text: 'psst, hi' });
  const dm1 = await dmMsgBob;
  check('dm message alice->bob', dm1.text === 'psst, hi' && dm1.sender === ALICE);

  const dmMsgAlice = new Promise((r) => alice.once('message', (m) => m.roomId === dmRes.roomId && r(m)));
  await emit(bob, 'message', { roomId: dmRes.roomId, text: 'psst, hello' });
  const dm2 = await dmMsgAlice;
  check('dm message bob->alice', dm2.text === 'psst, hello' && dm2.sender === BOB);

  // 8. DM isolation: group room should NOT receive dm messages
  let groupGotDm = false;
  const listener = (m) => { if (m.roomId === roomId && m.text === 'psst, hi') groupGotDm = true; };
  alice.on('message', listener);
  bob.on('message', listener);
  await new Promise((r) => setTimeout(r, 200));
  check('dm not leaked into group room', groupGotDm === false);

  // 9. Room list per-socket shows DM with correct peer
  const listB = await emit(bob, 'list');
  const dmRoomB = listB.rooms.find((r) => r.id === dmRes.roomId);
  check('bob sees dm with peer Alice', dmRoomB && dmRoomB.kind === 'dm' && dmRoomB.peer === ALICE);
  const listA2 = await emit(alice, 'list');
  const dmRoomA = listA2.rooms.find((r) => r.id === dmRes.roomId);
  check('alice sees dm with peer Bob', dmRoomA && dmRoomA.kind === 'dm' && dmRoomA.peer === BOB);

  // 10. Presence on disconnect
  const presenceP = new Promise((r) => alice.once('presence', r));
  bob.disconnect();
  const p = await presenceP;
  check('presence updated after bob left', p.online.includes(ALICE) && !p.online.includes(BOB));

  alice.disconnect();
  clearTimeout(globalTimeout);
  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { clearTimeout(globalTimeout); console.error('ERROR', e); process.exit(1); });
