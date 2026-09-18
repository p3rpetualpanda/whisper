(() => {
  const socket = io();

  // DOM refs
  const nameOverlay = document.getElementById('name-overlay');
  const nameInput = document.getElementById('name-input');
  const nameSubmit = document.getElementById('name-submit');
  const app = document.getElementById('app');
  const myNameEl = document.getElementById('my-name');
  const roomListEl = document.getElementById('room-list');
  const onlineListEl = document.getElementById('online-list');
  const newRoomBtn = document.getElementById('new-room-btn');
  const chatTitle = document.getElementById('chat-title');
  const chatSubtitle = document.getElementById('chat-subtitle');
  const messagesEl = document.getElementById('messages');
  const typingEl = document.getElementById('typing');
  const composer = document.getElementById('composer');
  const msgInput = document.getElementById('msg-input');
  const roomModal = document.getElementById('room-modal');
  const roomNameInput = document.getElementById('room-name-input');
  const roomCancel = document.getElementById('room-cancel');
  const roomCreate = document.getElementById('room-create');

  // Client state
  let myName = null;
  let currentRoom = { id: 'lobby', name: 'Lobby', kind: 'lobby' };
  const roomMeta = new Map(); // roomId -> { name, kind, peer }
  const typingTimers = new Map(); // roomId -> { name, timer }

  roomMeta.set('lobby', { name: 'Lobby', kind: 'lobby', peer: null });

  // ---------- helpers ----------
  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function addMessage(msg) {
    const div = document.createElement('div');
    const mine = myName && msg.sender === myName;
    div.className = 'msg ' + (mine ? 'me' : 'them');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const sender = document.createElement('span');
    sender.textContent = msg.sender;
    const time = document.createElement('span');
    time.textContent = fmtTime(msg.ts);
    meta.append(sender, time);
    const body = document.createElement('div');
    body.textContent = msg.text;
    div.append(meta, body);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addSystem(text) {
    const div = document.createElement('div');
    div.className = 'msg system';
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderRooms(rooms) {
    roomListEl.innerHTML = '';
    // Lobby first
    const lobbyLi = document.createElement('li');
    lobbyLi.textContent = 'Lobby';
    lobbyLi.dataset.roomId = 'lobby';
    if (currentRoom.id === 'lobby') lobbyLi.classList.add('active');
    lobbyLi.addEventListener('click', () => selectRoom('lobby'));
    roomListEl.appendChild(lobbyLi);

    for (const r of rooms) {
      roomMeta.set(r.id, {
        name: r.kind === 'dm' ? (r.peer || 'DM') : r.name,
        kind: r.kind,
        peer: r.kind === 'dm' ? (r.peer || null) : null,
      });
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = r.kind === 'dm' ? '💬 ' + (r.peer || 'DM') : r.name;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = r.members;
      li.append(label, count);
      li.dataset.roomId = r.id;
      if (currentRoom.id === r.id) li.classList.add('active');
      li.addEventListener('click', () => selectRoom(r.id));
      roomListEl.appendChild(li);
    }
  }

  function renderOnline(online) {
    onlineListEl.innerHTML = '';
    for (const name of online) {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      const label = document.createElement('span');
      label.textContent = name + (name === myName ? ' (you)' : '');
      li.append(dot, label);
      if (name === myName) {
        li.classList.add('me');
      } else {
        li.addEventListener('click', () => openDm(name));
      }
      onlineListEl.appendChild(li);
    }
  }

  function selectRoom(roomId) {
    const meta = roomMeta.get(roomId) || { name: roomId, kind: 'group', peer: null };
    currentRoom = { id: roomId, name: meta.name, kind: meta.kind };
    // Update active state
    for (const li of roomListEl.children) {
      li.classList.toggle('active', li.dataset.roomId === roomId);
    }
    chatTitle.textContent = meta.kind === 'dm' ? 'DM with ' + (meta.peer || '') : meta.name;
    chatSubtitle.textContent = meta.kind === 'dm' ? 'private chat' : 'group room';
    messagesEl.innerHTML = '';
    if (meta.kind === 'dm') addSystem('Start of conversation with ' + (meta.peer || ''));
    if (roomId !== 'lobby') socket.emit('join-room', { roomId });
    msgInput.focus();
  }

  function openDm(peerName) {
    socket.emit('dm-open', { to: peerName }, (res) => {
      if (res && res.ok) {
        selectRoom(res.roomId);
      } else {
        addSystem((res && res.error) || 'Could not open DM');
      }
    });
  }

  function showTyping(name) {
    typingEl.textContent = name + ' is typing…';
  }
  function clearTyping() {
    typingEl.textContent = '';
  }

  // ---------- socket events ----------
  socket.on('connect', () => {
    if (myName) {
      socket.emit('join', { name: myName });
      socket.emit('list', (res) => {
        renderRooms(res.rooms);
        renderOnline(res.online);
      });
    }
  });

  socket.on('message', (msg) => {
    if (msg.roomId === currentRoom.id) addMessage(msg);
  });

  socket.on('system', (msg) => {
    if (currentRoom.id === 'lobby') addSystem(msg.text);
  });

  socket.on('presence', ({ online }) => {
    renderOnline(online);
  });

  socket.on('rooms-updated', ({ rooms }) => {
    renderRooms(rooms);
  });

  socket.on('dm-opened', ({ roomId, peer }) => {
    // The other side opened a DM with us — record it and surface in the room list
    roomMeta.set(roomId, { name: 'DM with ' + peer, kind: 'dm', peer });
    socket.emit('list', (res) => renderRooms(res.rooms));
  });

  socket.on('typing', ({ roomId, name, typing }) => {
    if (roomId !== currentRoom.id) return;
    if (typing) {
      showTyping(name);
      clearTimeout(typingTimers.get(roomId));
      typingTimers.set(roomId, setTimeout(clearTyping, 3000));
    } else {
      clearTyping();
    }
  });

  // ---------- UI wiring ----------
  function doJoin() {
    const name = nameInput.value.trim();
    if (!name) return;
    socket.emit('join', { name }, (res) => {
      if (res && res.ok) {
        myName = res.name;
        myNameEl.textContent = myName;
        nameOverlay.classList.add('hidden');
        app.classList.remove('hidden');
        socket.emit('list', (r) => {
          renderRooms(r.rooms);
          renderOnline(r.online);
        });
        msgInput.focus();
      }
    });
  }

  nameSubmit.addEventListener('click', doJoin);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text) return;
    socket.emit('message', { roomId: currentRoom.id, text });
    msgInput.value = '';
    socket.emit('typing', { roomId: currentRoom.id, typing: false });
  });

  let typingDebounce;
  msgInput.addEventListener('input', () => {
    socket.emit('typing', { roomId: currentRoom.id, typing: true });
    clearTimeout(typingDebounce);
    typingDebounce = setTimeout(() => {
      socket.emit('typing', { roomId: currentRoom.id, typing: false });
    }, 2000);
  });

  // New room modal
  newRoomBtn.addEventListener('click', () => {
    roomNameInput.value = '';
    roomModal.classList.remove('hidden');
    roomNameInput.focus();
  });
  roomCancel.addEventListener('click', () => roomModal.classList.add('hidden'));
  roomCreate.addEventListener('click', () => {
    const name = roomNameInput.value.trim();
    if (!name) return;
    socket.emit('create-room', { name }, (res) => {
      if (res && res.ok) {
        roomModal.classList.add('hidden');
        roomMeta.set(res.room.id, { name: res.room.name, kind: 'group', peer: null });
        selectRoom(res.room.id);
      }
    });
  });
  roomNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') roomCreate.click(); });

  // Focus name input on load
  nameInput.focus();
})();
