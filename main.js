const SUPABASE_URL = 'https://lrogsxmotkupxfgbdogz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2dzeG1vdGt1cHhmZ2Jkb2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NDI2NzMsImV4cCI6MjA5MTIxODY3M30.4eU4XdpXlN_hPifJwYBd0jdFb0gM0PCHT9Sr1hzmOHc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const playlist = [
  {
    id: 'track_1',
    title: 'Slip Thru',
    artist: 'Barren Gates, Taylor Ravenna',
    src: './src/assets/music/Barren Gates, Taylor Ravenna - Slip Thru [NCS Release].mp3',
    img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500&auto=format&fit=crop',
    album: 'NCS Release',
    time: '03:00'
  },
  {
    id: 'track_2',
    title: 'Citadel',
    artist: 'Boom Kitty, Waterflame',
    src: './src/assets/music/Boom Kitty, Waterflame - Citadel [NCS Release].mp3',
    img: 'https://images.unsplash.com/photo-1574169208507-84376144848b?q=80&w=500&auto=format&fit=crop',
    album: 'NCS Release',
    time: '03:32'
  },
  {
    id: 'track_3',
    title: 'colors',
    artist: 'HXPETRAIN',
    src: './src/assets/music/HXPETRAIN - colors [NCS Release].mp3',
    img: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=500&auto=format&fit=crop',
    album: 'NCS Release',
    time: '02:40'
  },
  {
    id: 'track_4',
    title: 'Next Level',
    artist: 'JOXION',
    src: './src/assets/music/JOXION - Next Level [NCS Release].mp3',
    img: 'https://images.unsplash.com/photo-1619983081563-430f63602796?q=80&w=500&auto=format&fit=crop',
    album: 'NCS Release',
    time: '03:15'
  },
  {
    id: 'track_5',
    title: 'Let\'s Go',
    artist: 'Mo Falk, MADZI',
    src: './src/assets/music/Mo Falk, MADZI - Let\'s Go [NCS Release].mp3',
    img: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=500&auto=format&fit=crop',
    album: 'NCS Release',
    time: '02:50'
  }
];

// User Info
function getOrCreateUser() {
  let userId = localStorage.getItem('userId');
  let userName = localStorage.getItem('userName');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).substr(2, 9);
    userName = 'User ' + Math.floor(Math.random() * 1000);
    localStorage.setItem('userId', userId);
    localStorage.setItem('userName', userName);
  }
  return { userId, userName };
}
const { userId, userName } = getOrCreateUser();

// App State
let currentRoomId = null;
let isHost = false;
let roomQueue = [];
let localIsPlaying = false;
let localCurrentTrack = null;
let roomSubscription = null;
let syncInterval = null;

let isPlaying = false;
let currentTrackIndex = 0;
let volume = 0.7;

// DOM Elements
const audioPlayer = document.getElementById('audio-player');
const navRoom = document.getElementById('nav-room');
const homeView = document.getElementById('home-view');
const roomView = document.getElementById('room-view');
const btnCreateRoom = document.getElementById('btn-create-room');

const roomNameDisplay = document.getElementById('room-name-display');
const roomStatus = document.getElementById('room-status');
const queueList = document.getElementById('queue-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
const btnAddSong = document.getElementById('btn-add-song');

// Player Elements
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = playPauseBtn.querySelector('.material-symbols-rounded');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

const playerTrackName = document.getElementById('player-track-name');
const playerTrackArtist = document.getElementById('player-track-artist');
const currentTrackArt = document.getElementById('current-track-art');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const progressFill = document.getElementById('progress-fill');
const progressBarContainer = document.getElementById('progress-bar-container');

const volumeSlider = document.querySelector('.volume-slider');
const volumeFill = document.querySelector('.volume-fill');


function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// -------------------------------------------------------------
// Base Player Initialization (Discover Mode)
// -------------------------------------------------------------
function initPlayer() {
  audioPlayer.volume = volume;
  updateVolumeUI();
  loadTrack(currentTrackIndex);
  setupEventListeners();
  populateGrids();
}

function loadTrack(index) {
  if (currentRoomId) return; // Managed by room logic
  currentTrackIndex = index;
  const track = playlist[index];
  
  audioPlayer.src = track.src;
  
  playerTrackName.textContent = track.title;
  playerTrackArtist.textContent = track.artist;
  currentTrackArt.style.backgroundImage = `url(${track.img})`;
  currentTrackArt.style.backgroundSize = 'cover';
  
  if (isPlaying) {
    audioPlayer.play().catch(console.error);
  }
}

function togglePlay() {
  if (currentRoomId) {
    if (!isHost) return alert('Only the host can play/pause in a room!');
    hostSetPlayback(!localIsPlaying);
    return;
  }

  isPlaying = !isPlaying;
  if (isPlaying) {
    audioPlayer.play().catch(console.error);
  } else {
    audioPlayer.pause();
  }
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  const isCurrentlyPlaying = currentRoomId ? localIsPlaying : isPlaying;
  playIcon.textContent = isCurrentlyPlaying ? 'pause' : 'play_arrow';
  if (isCurrentlyPlaying) {
    document.querySelector('.player-bar').classList.add('playing');
  } else {
    document.querySelector('.player-bar').classList.remove('playing');
  }
}

function handleNext() {
  if (currentRoomId) {
    hostPlayNext();
    return;
  }
  currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
  loadTrack(currentTrackIndex);
  if (!isPlaying) togglePlay();
}

function handlePrev() {
  if (currentRoomId) return; // No prev in rooms for MVP
  currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
  loadTrack(currentTrackIndex);
  if (!isPlaying) togglePlay();
}

function setupEventListeners() {
  playPauseBtn.addEventListener('click', togglePlay);
  nextBtn.addEventListener('click', handleNext);
  prevBtn.addEventListener('click', handlePrev);
  
  audioPlayer.addEventListener('timeupdate', () => {
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    const duration = audioPlayer.duration;
    if (duration) {
      totalTimeEl.textContent = formatTime(duration);
      progressFill.style.width = `${(audioPlayer.currentTime / duration) * 100}%`;
    }
  });

  audioPlayer.addEventListener('loadedmetadata', () => {
    totalTimeEl.textContent = formatTime(audioPlayer.duration);
  });

  audioPlayer.addEventListener('ended', handleNext);

  progressBarContainer.addEventListener('click', (e) => {
    if(!audioPlayer.duration || currentRoomId) return; // disable seeking in room MVP
    const rect = progressBarContainer.getBoundingClientRect();
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audioPlayer.currentTime = percent * audioPlayer.duration;
  });

  volumeSlider.addEventListener('click', (e) => {
    const rect = volumeSlider.getBoundingClientRect();
    const newVolume = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    volume = newVolume;
    audioPlayer.volume = volume;
    updateVolumeUI();
  });
}

function updateVolumeUI() {
  volumeFill.style.width = `${volume * 100}%`;
}

function populateGrids() {
  // Populate Popular Albums
  const albumGrid = document.querySelector('.album-grid');
  albumGrid.innerHTML = '';
  
  playlist.forEach((track, index) => {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = `
      <div class="album-art"><img src="${track.img}" alt="${track.title}"></div>
      <p class="album-name">${track.title}</p>
      <p class="album-artist">${track.artist}</p>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelector('.nav-item').classList.add('active'); // active home
      leaveRoom();
      currentTrackIndex = index;
      loadTrack(index);
      if (!isPlaying) togglePlay();
    });
    albumGrid.appendChild(card);
  });

  // Hero section click
  document.getElementById('hero-play').addEventListener('click', () => {
    leaveRoom();
    currentTrackIndex = 0;
    loadTrack(0);
    if (!isPlaying) togglePlay();
  });
}

// -------------------------------------------------------------
// Room UI Handlers
// -------------------------------------------------------------

async function handleStartRoom() {
  const code = prompt('Enter Room ID to join, or leave blank to create a new room:');
  if (code !== null) {
    if (code.trim() === '') {
      await createRoom();
    } else {
      await joinRoom(code.trim());
    }
  }
}

navRoom.addEventListener('click', (e) => {
  e.preventDefault();
  if (!currentRoomId) {
    handleStartRoom();
  } else {
    showRoomView();
  }
});

btnCreateRoom.addEventListener('click', (e) => {
  e.preventDefault();
  handleStartRoom();
});

const views = ['home-view', 'room-view', 'playlist-view', 'last-listening-view', 'recommended-view', 'my-library-view', 'radio-view'];

function switchView(viewId) {
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = (v === viewId) ? (v === 'room-view' ? 'flex' : 'block') : 'none';
  });
  
  if (viewId === 'room-view') {
    btnCreateRoom.style.display = 'block';
  } else {
    btnCreateRoom.style.display = 'none';
  }
}

function showRoomView() {
  switchView('room-view');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  navRoom.classList.add('active');
}

function leaveRoom(targetView = 'home-view') {
  currentRoomId = null;
  if (roomSubscription) supabaseClient.removeChannel(roomSubscription);
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  localIsPlaying = false;
  roomNameDisplay.textContent = 'Listening Room';
  roomStatus.textContent = 'Not connected';
  
  if (targetView) {
    switchView(targetView);
  }
}

// Side navigation home
document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
  if (item.id === 'nav-room') return; // handled separately
  
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
    
    // routing logic
    let targetView = 'home-view';
    if (item.id === 'nav-playlist') targetView = 'playlist-view';
    if (item.id === 'nav-last-listening') targetView = 'last-listening-view';
    if (item.id === 'nav-recommended') targetView = 'recommended-view';
    
    // leave room and switch to target view
    if (currentRoomId) {
      leaveRoom(targetView);
    } else {
      switchView(targetView);
    }
  });
});

// -------------------------------------------------------------
// Supabase Room Logic
// -------------------------------------------------------------

async function createRoom() {
  const roomId = generateUUID();
  const { data, error } = await supabaseClient.from('rooms').insert([{
    id: roomId,
    name: `${userName}'s Room`,
    host_id: userId,
    is_playing: false
  }]).select().single();

  if (error) {
    console.error('Error creating room:', error);
    alert('Failed to create room.');
    return;
  }
  isHost = true;
  await joinRoom(data.id);
}

async function joinRoom(roomId) {
  const { data, error } = await supabaseClient.from('rooms').select('*').eq('id', roomId).single();
  if (error || !data) {
    alert('Room not found!');
    return;
  }
  
  currentRoomId = roomId;
  isHost = data.host_id === userId;
  roomNameDisplay.textContent = data.name + (isHost ? ' (Host)' : '');
  roomStatus.textContent = `Room ID: ${roomId}`;
  
  // Pause any local track playing
  isPlaying = false;
  audioPlayer.pause();
  
  showRoomView();
  setupRealtime();
  fetchInitialData();
  
  // Update player based on room state
  syncPlaybackFromState(data);
}

async function setupRealtime() {
  if (roomSubscription) supabaseClient.removeChannel(roomSubscription);
  
  roomSubscription = supabaseClient.channel(`room:${currentRoomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'queue', filter: `room_id=eq.${currentRoomId}` }, payload => {
      fetchQueue();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoomId}` }, payload => {
      if (payload.eventType === 'INSERT') {
        appendMessage(payload.new);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${currentRoomId}` }, payload => {
      if (payload.eventType === 'UPDATE') {
        syncPlaybackFromState(payload.new);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, payload => {
       fetchQueue();
    })
    .subscribe();
}

async function fetchInitialData() {
  fetchQueue();
  fetchMessages();
}

async function fetchQueue() {
  const { data, error } = await supabaseClient.from('queue')
    .select('id, track_id, track_name, track_artist, votes, submitted_by')
    .eq('room_id', currentRoomId)
    .order('votes', { ascending: false })
    .order('created_at', { ascending: true });
    
  if (!error && data) {
    roomQueue = data;
    renderQueue();
  }
}

async function fetchMessages() {
  const { data, error } = await supabaseClient.from('messages')
    .select('*')
    .eq('room_id', currentRoomId)
    .order('created_at', { ascending: true });
    
  if (!error && data) {
    chatMessages.innerHTML = '';
    data.forEach(appendMessage);
  }
}

function renderQueue() {
  queueList.innerHTML = '';
  roomQueue.forEach(item => {
    const el = document.createElement('div');
    el.className = 'queue-item';
    el.innerHTML = `
      <div class="queue-item-info">
        <span class="queue-item-name">${item.track_name}</span>
        <span class="queue-item-artist">${item.track_artist}</span>
      </div>
      <div class="queue-item-votes">
        <div class="vote-controls">
          <button class="vote-btn" onclick="voteQueue('${item.id}', 1)"><span class="material-symbols-rounded">stat_3</span></button>
        </div>
        <span class="vote-count">${item.votes}</span>
        <div class="vote-controls">
          <button class="vote-btn" onclick="voteQueue('${item.id}', -1)"><span class="material-symbols-rounded">stat_minus_3</span></button>
        </div>
      </div>
    `;
    queueList.appendChild(el);
  });
}

function appendMessage(msg) {
  const el = document.createElement('div');
  el.className = 'chat-message';
  el.innerHTML = `
    <div>
      <span class="chat-author">${msg.user_name}</span>
      <span class="chat-timestamp" onclick="audioPlayer.currentTime = ${msg.timestamp_in_song}">${formatTime(msg.timestamp_in_song)}</span>
    </div>
    <div class="chat-content">${msg.content}</div>
  `;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.voteQueue = async function(queueId, value) {
  const { error } = await supabaseClient.from('votes').upsert(
    { user_id: userId, queue_id: queueId, value: value },
    { onConflict: 'user_id,queue_id' }
  );
  if (!error) {
    const { data: allVotes } = await supabaseClient.from('votes').select('value').eq('queue_id', queueId);
    const total = allVotes ? allVotes.reduce((acc, v) => acc + v.value, 0) : 0;
    await supabaseClient.from('queue').update({ votes: total }).eq('id', queueId);
  }
}

btnAddSong.addEventListener('click', async () => {
  const pListStr = playlist.map((p, i) => `${i}: ${p.title}`).join('\n');
  const index = prompt(`Enter song number to add:\n${pListStr}`);
  if (index !== null && playlist[index]) {
    const track = playlist[index];
    await supabaseClient.from('queue').insert([{
      room_id: currentRoomId,
      track_id: track.id,
      track_name: track.title,
      track_artist: track.artist,
      submitted_by: userId
    }]);
  }
});

btnSendChat.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  
  const currentTs = Math.floor(audioPlayer.currentTime) || 0;
  await supabaseClient.from('messages').insert([{
    room_id: currentRoomId,
    user_id: userId,
    user_name: userName,
    content: text,
    timestamp_in_song: currentTs
  }]);
}

// -------------------------------------------------------------
// Playback Engine Sync
// -------------------------------------------------------------

function getTrackById(tid) {
  return playlist.find(t => t.id === tid);
}

function loadTrackUI(track) {
  if (!track) return;
  localCurrentTrack = track;
  audioPlayer.src = track.src;
  playerTrackName.textContent = track.title;
  playerTrackArtist.textContent = track.artist;
  currentTrackArt.style.backgroundImage = `url(${track.img})`;
  currentTrackArt.style.backgroundSize = 'cover';
}

function syncPlaybackFromState(room) {
  if (!room.current_track_id) {
    // No track playing yet
    return;
  }
  
  const track = getTrackById(room.current_track_id);
  if (!localCurrentTrack || localCurrentTrack.id !== track.id) {
    loadTrackUI(track);
  }
  
  localIsPlaying = room.is_playing;
  
  if (localIsPlaying && room.started_at) {
    const serverStart = new Date(room.started_at).getTime();
    const now = new Date().getTime();
    const elapsed = Math.max(0, (now - serverStart) / 1000);
    
    if (audioPlayer.paused) {
      audioPlayer.currentTime = elapsed;
      audioPlayer.play().catch(e => console.warn('Autoplay blocked:', e));
    } else if (Math.abs(audioPlayer.currentTime - elapsed) > 2) {
      audioPlayer.currentTime = elapsed;
    }
    updatePlayPauseUI();
    
    if (!syncInterval) {
      syncInterval = setInterval(() => {
        const _now = new Date().getTime();
        const _elapsed = Math.max(0, (_now - serverStart) / 1000);
        if (Math.abs(audioPlayer.currentTime - _elapsed) > 3) {
           audioPlayer.currentTime = _elapsed;
        }
      }, 5000);
    }
  } else {
    audioPlayer.pause();
    updatePlayPauseUI();
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }
}

async function hostSetPlayback(playing) {
  if (!isHost || !currentRoomId) return;
  
  let startedAt = null;
  if (playing) {
    const now = new Date().getTime();
    startedAt = new Date(now - (audioPlayer.currentTime * 1000)).toISOString();
  }
  
  await supabaseClient.from('rooms').update({
    is_playing: playing,
    started_at: startedAt
  }).eq('id', currentRoomId);
}

async function hostPlayNext() {
  if (!isHost || !currentRoomId) return;
  if (roomQueue.length === 0) return alert('Queue is empty!');
  
  const nextItem = roomQueue[0];
  const now = new Date().toISOString();
  
  await supabaseClient.from('queue').delete().eq('id', nextItem.id);
  await supabaseClient.from('rooms').update({
    current_track_id: nextItem.track_id,
    current_track_name: nextItem.track_name,
    current_track_artist: nextItem.track_artist,
    is_playing: true,
    started_at: now
  }).eq('id', currentRoomId);
}

document.addEventListener('DOMContentLoaded', () => {
  initPlayer();

  // ── Top Nav Routing ──
  const topNavMap = {
    'top-nav-discover': 'home-view',
    'top-nav-library':  'my-library-view',
    'top-nav-radio':    'radio-view',
  };

  document.querySelectorAll('.top-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.top-nav-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');

      const targetView = topNavMap[item.id];
      if (targetView) {
        if (currentRoomId) leaveRoom(targetView);
        else switchView(targetView);

        // Clear sidebar active when switching to top-nav views
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      }
    });
  });

  // ── Follow Button Toggle ──
  const btnFollow = document.getElementById('btn-follow');
  const followIcon = document.getElementById('follow-icon');
  const followLabel = document.getElementById('follow-label');
  let followed = false;

  if (btnFollow) {
    btnFollow.addEventListener('click', () => {
      followed = !followed;
      if (followed) {
        btnFollow.classList.add('following');
        followIcon.textContent = 'check';
        followLabel.textContent = 'FOLLOWING';
      } else {
        btnFollow.classList.remove('following');
        followIcon.textContent = 'add';
        followLabel.textContent = 'FOLLOW';
      }
    });
  }

  // Catch remaining mock links
  document.querySelectorAll('a[href="#"]').forEach(a => {
    if (!a.classList.contains('nav-item') && !a.classList.contains('top-nav-item')) {
      a.addEventListener('click', e => e.preventDefault());
    }
  });
});
