const SUPABASE_URL = 'https://lrogsxmotkupxfgbdogz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2dzeG1vdGt1cHhmZ2Jkb2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NDI2NzMsImV4cCI6MjA5MTIxODY3M30.4eU4XdpXlN_hPifJwYBd0jdFb0gM0PCHT9Sr1hzmOHc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let playlist = [];

async function fetchPlaylist() {
  const { data, error } = await supabaseClient.from('tracks').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching playlist:', error);
    return;
  }
  
  if (data && data.length > 0) {
    playlist = data.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      src: t.src_url,
      img: t.img_url,
      album: t.album || 'Unknown',
      mood: t.mood || 'unspecified',
      time: t.time || '0:00'
    }));
  } else {
    playlist = []; // Empty state handled by UI
  }

  // Initialize UI now that data is loaded
  initPlayer();
  renderRecommendations('chill'); 
}

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

// Liked Songs State (persisted in localStorage)
let likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '[]');

// Play History State (persisted in localStorage)
let playHistory = JSON.parse(localStorage.getItem('playHistory') || '[]');

// Custom Queue State
let userQueue = [];
let removedStandardTracks = [];

function savePlayHistory() {
  localStorage.setItem('playHistory', JSON.stringify(playHistory));
}
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
const favoriteBtn = document.getElementById('favorite-btn');
const favoriteIcon = document.getElementById('favorite-icon');

// Queue Elements
const queueBtn = document.getElementById('queue-btn');
const closeQueueBtn = document.getElementById('close-queue-btn');
const queuePanel = document.getElementById('queue-panel');
const queuePanelBackdrop = document.getElementById('queue-panel-backdrop');
const queueNowArt = document.getElementById('queue-now-art');
const queueNowTitle = document.getElementById('queue-now-title');
const queueNowArtist = document.getElementById('queue-now-artist');
const queuePanelList = document.getElementById('queue-panel-list');


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
  if (playlist.length > 0) {
    loadTrack(currentTrackIndex);
  }
  setupEventListeners();
  populateGrids();
}

function loadTrack(index) {
  if (currentRoomId) return; // Managed by room logic
  const track = playlist[index];
  
  if (!track) {
    playerTrackName.textContent = 'Upload Music to Start';
    playerTrackArtist.textContent = 'Global Database';
    currentTrackArt.style.backgroundImage = 'none';
    return;
  }
  
  currentTrackIndex = index;
  audioPlayer.src = track.src;
  
  playerTrackName.textContent = track.title;
  playerTrackArtist.textContent = track.artist;
  currentTrackArt.style.backgroundImage = `url(${track.img})`;
  currentTrackArt.style.backgroundSize = 'cover';
  
  // Update Play History
  if (!playHistory.some(t => t.id === track.id)) {
      playHistory.push(track);
      savePlayHistory();
  }
  
  if (isPlaying) {
    audioPlayer.play().catch(console.error);
  }

  // Update heart button state for new track
  if (typeof updateFavoriteUI === 'function') updateFavoriteUI();
  
  // Update queue if panel is open
  if (queuePanel && queuePanel.getAttribute('aria-hidden') !== 'true') {
    renderQueue();
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
  
  if (userQueue.length > 0) {
    const nextTrack = userQueue.shift();
    const idx = playlist.findIndex(p => p.id === nextTrack.id);
    if(idx !== -1) currentTrackIndex = idx;
  } else {
    let loopCount = 0;
    do {
      currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
      loopCount++;
    } while (
      playlist[currentTrackIndex] && 
      removedStandardTracks.includes(playlist[currentTrackIndex].id) && 
      loopCount < playlist.length
    );
  }
  
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

  // Queue Panel Toggle
  const toggleQueuePanel = () => {
    const isHidden = queuePanel.getAttribute('aria-hidden') === 'true';
    queuePanel.setAttribute('aria-hidden', !isHidden);
    queuePanelBackdrop.style.display = isHidden ? 'block' : 'none';
    if (isHidden) renderQueue();
  };

  if (queueBtn) queueBtn.addEventListener('click', toggleQueuePanel);
  if (closeQueueBtn) closeQueueBtn.addEventListener('click', toggleQueuePanel);
  if (queuePanelBackdrop) queuePanelBackdrop.addEventListener('click', toggleQueuePanel);
}

function renderQueue() {
  if (!queuePanelList) return;
  
  try {
    let safeIndex = typeof currentTrackIndex === 'number' && !isNaN(currentTrackIndex) ? currentTrackIndex : 0;
    const currentTrack = playlist[safeIndex];
    
    if (currentTrack && queueNowTitle && queueNowArtist && queueNowArt) {
        queueNowArt.style.backgroundImage = `url(${currentTrack.img})`;
        queueNowTitle.textContent = currentTrack.title;
        queueNowArtist.textContent = currentTrack.artist;
    }
  } catch (e) {
    console.error("Error setting NOW PLAYING queue UI:", e);
  }
  
  queuePanelList.innerHTML = '';
  
  if (currentRoomId && roomQueue.length > 0) {
    // In a room, show room queue
    roomQueue.forEach((track) => {
        const item = document.createElement('div');
        item.className = 'queue-list-item';
        const playlistTrack = playlist.find(p => p.id === track.track_id) || { img: '', title: track.track_name, artist: track.track_artist };
        item.innerHTML = `
        <div class="queue-list-art" style="background-image:url('${playlistTrack.img}');background-size:cover;background-position:center;"></div>
        <div class="queue-list-info">
            <p class="queue-list-title">${playlistTrack.title}</p>
            <p class="queue-list-artist">${playlistTrack.artist}</p>
        </div>
        `;
        queuePanelList.appendChild(item);
    });
  } else {
    // Standard local queue
    
    // 1. Show userQueue items first
    userQueue.forEach((track, qIndex) => {
      const item = document.createElement('div');
      item.className = 'queue-list-item queue-removable';
      item.style.borderLeft = '3px solid var(--primary)';
      item.innerHTML = `
        <div class="queue-list-art" style="background-image:url('${track.img}');background-size:cover;background-position:center;"></div>
        <div class="queue-list-info">
          <p class="queue-list-title">${track.title}</p>
          <p class="queue-list-artist">${track.artist}</p>
        </div>
        <span class="queue-item-badge" style="font-size:10px; color:var(--primary); font-weight:700; text-transform:uppercase;">Queued</span>
        <button type="button" class="queue-remove-btn" title="Remove from Queue" onclick="removeFromQueue(event, ${qIndex})">
          <span class="material-symbols-rounded">close</span>
        </button>
      `;
      queuePanelList.appendChild(item);
    });

    // 2. Show standard sequential playlist
    let activeStandardTracks = 0;
    for (let i = currentTrackIndex + 1; i < playlist.length; i++) {
      const track = playlist[i];
      if (removedStandardTracks.includes(track.id)) continue;
      
      activeStandardTracks++;
      const item = document.createElement('div');
      item.className = 'queue-list-item queue-removable';
      item.innerHTML = `
        <div class="queue-list-art" style="background-image:url('${track.img}');background-size:cover;background-position:center;"></div>
        <div class="queue-list-info">
          <p class="queue-list-title">${track.title}</p>
          <p class="queue-list-artist">${track.artist}</p>
        </div>
        <button class="icon-btn-small queue-item-badge" onclick="loadTrack(${i}); if(!isPlaying) togglePlay();" title="Play">
          <span class="material-symbols-rounded fill" style="font-size:18px;">play_arrow</span>
        </button>
        <button type="button" class="queue-remove-btn" title="Remove from Queue" onclick="removeStandardTrack(event, '${track.id}')">
          <span class="material-symbols-rounded">close</span>
        </button>
      `;
      queuePanelList.appendChild(item);
    }
    if (activeStandardTracks === 0 && userQueue.length === 0) {
      queuePanelList.innerHTML = `<div class="empty-queue"><p style="color:var(--on-surface-muted);font-size:12px;text-align:center;padding:20px;">No more tracks in queue.</p></div>`;
    }
  }
}

// Global addToQueue function
window.addToQueueId = function(id, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const track = playlist.find(t => t.id === id);
    if(track) {
       userQueue.push(track);
       if (queuePanel && queuePanel.getAttribute('aria-hidden') !== 'true') {
           renderQueue();
       }
    }
};

window.removeFromQueue = function(event, index) {
  if (event) {
      event.preventDefault();
      event.stopPropagation();
  }
  userQueue.splice(index, 1);
  if (queuePanel && queuePanel.getAttribute('aria-hidden') !== 'true') {
      renderQueue();
  }
};

window.removeStandardTrack = function(event, trackId) {
  if (event) {
      event.preventDefault();
      event.stopPropagation();
  }
  removedStandardTracks.push(trackId);
  if (queuePanel && queuePanel.getAttribute('aria-hidden') !== 'true') {
      renderQueue();
  }
};

// -------------------------------------------------------------
// Auto Recommendations Logic
// -------------------------------------------------------------
let currentMood = 'all';

document.querySelectorAll('.mood-pill').forEach(pill => {
   pill.addEventListener('click', (e) => {
      document.querySelectorAll('.mood-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentMood = pill.dataset.mood;
      renderRecommendations();
   });
});

function getRecommendations(mood) {
    let pool = playlist.filter(t => !playHistory.find(h => h.id === t.id));
    if (pool.length === 0) pool = playlist; // fallback if user has listened to everything
    
    // Deterministic pseudo-random generation to simulate mood matching for given mock playlist
    if (mood !== 'all') {
       pool = pool.filter(t => {
           const score = (t.title.charCodeAt(0) + t.artist.charCodeAt(0)) % 6;
           const moodMap = { 'chill': 0, 'upbeat': 1, 'focus': 2, 'sad': 3, 'workout': 4, 'jolly': 5 };
           return score === moodMap[mood];
       });
       if(pool.length === 0) pool = playlist.slice(0, 5); // fallback if empty
    }
    
    // Sort pool by placing tracks with familiar artists slightly higher
    const historyArtists = playHistory.map(t => t.artist);
    pool.sort((a,b) => {
       const aScore = historyArtists.includes(a.artist) ? 1 : 0;
       const bScore = historyArtists.includes(b.artist) ? 1 : 0;
       return bScore - aScore;
    });

    return pool.slice(0, 10);
}

function renderRecommendations() {
    const list = document.getElementById('recommended-track-list');
    if(!list) return;
    list.innerHTML = '';
    
    const recs = getRecommendations(currentMood);
    
    if(recs.length === 0) {
       list.innerHTML = '<p style="padding:40px;text-align:center;color:var(--on-surface-muted);">No recommendations found.</p>';
       return;
    }

    recs.forEach((track, i) => {
        const row = document.createElement('div');
        row.className = 'liked-track-row';
        row.innerHTML = `
          <span class="liked-track-num">${(i + 1).toString().padStart(2, '0')}</span>
          <div class="liked-track-art" style="background-image:url('${track.img}');background-size:cover;background-position:center;"></div>
          <div class="liked-track-info">
            <span class="liked-track-title">${track.title}</span>
            <span class="liked-track-artist">${track.artist}</span>
          </div>
          <span class="liked-track-album">${track.album || 'Unknown'}</span>
          <span class="liked-track-duration">${track.time || '—'}</span>
          <button type="button" class="queue-add-btn" title="Add to Queue" onclick="addToQueueId('${track.id}', event)">
            <span class="material-symbols-rounded">playlist_add</span>
          </button>
        `;
        // double click to play right away
        row.addEventListener('dblclick', () => {
          const idx = playlist.findIndex(p => p.id === track.id);
          if (idx !== -1) {
            leaveRoom('recommended-view');
            currentTrackIndex = idx;
            loadTrack(idx);
            if (!isPlaying) togglePlay();
          }
        });
        list.appendChild(row);
    });
}
window.renderRecommendations = renderRecommendations;

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

const views = ['home-view', 'room-view', 'playlist-view', 'last-listening-view', 'recommended-view', 'my-library-view', 'radio-view', 'liked-songs-view', 'upload-view'];

function switchView(viewId) {
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = (v === viewId) ? ((v === 'room-view' || v === 'upload-view') ? 'flex' : 'block') : 'none';
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

// Side navigation
document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
  if (item.id === 'nav-room') return; // handled separately

  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');

    // Clear top-nav active so they don't conflict
    document.querySelectorAll('.top-nav-item').forEach(el => el.classList.remove('active'));

    // routing logic
    let targetView = 'home-view';
    if (item.id === 'nav-playlist')       targetView = 'playlist-view';
    if (item.id === 'nav-last-listening') targetView = 'last-listening-view';
    if (item.id === 'nav-recommended')    targetView = 'recommended-view';
    if (item.id === 'nav-liked')          targetView = 'liked-songs-view';
    if (item.id === 'nav-upload')         targetView = 'upload-view';

    if (targetView === 'liked-songs-view') renderLikedSongs();

    if (currentRoomId) {
      leaveRoom(targetView);
    } else {
      switchView(targetView);
    }
  });
});

// -------------------------------------------------------------
// Liked Songs
// -------------------------------------------------------------

function saveLikedSongs() {
  localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
}

function getCurrentTrack() {
  if (currentRoomId && localCurrentTrack) return localCurrentTrack;
  return playlist[currentTrackIndex] || null;
}

function isTrackLiked(trackId) {
  return likedSongs.some(t => t.id === trackId);
}

function updateFavoriteUI() {
  const track = getCurrentTrack();
  if (!track) return;
  const liked = isTrackLiked(track.id);
  favoriteIcon.textContent = 'favorite';
  favoriteIcon.style.color = liked ? '#ff4d6d' : '';
  favoriteBtn.classList.toggle('liked', liked);
}

function toggleLike() {
  const track = getCurrentTrack();
  if (!track) return;

  if (isTrackLiked(track.id)) {
    likedSongs = likedSongs.filter(t => t.id !== track.id);
  } else {
    likedSongs.push({ ...track });
  }
  saveLikedSongs();
  updateFavoriteUI();

  // If liked songs view is open, re-render
  const likedView = document.getElementById('liked-songs-view');
  if (likedView && likedView.style.display !== 'none') {
    renderLikedSongs();
  }
}

function renderLikedSongs() {
  const list = document.getElementById('liked-track-list');
  const empty = document.getElementById('liked-empty-state');
  const countEl = document.getElementById('liked-count');

  countEl.textContent = likedSongs.length === 1 ? '1 song' : `${likedSongs.length} songs`;

  if (likedSongs.length === 0) {
    list.innerHTML = '';
    list.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  list.style.display = 'flex';
  list.innerHTML = '';

  likedSongs.forEach((track, i) => {
    const row = document.createElement('div');
    row.className = 'liked-track-row';
    row.innerHTML = `
      <span class="liked-track-num">${(i + 1).toString().padStart(2, '0')}</span>
      <div class="liked-track-art" style="background-image:url('${track.img}');background-size:cover;background-position:center;"></div>
      <div class="liked-track-info">
        <span class="liked-track-title">${track.title}</span>
        <span class="liked-track-artist">${track.artist}</span>
      </div>
      <span class="liked-track-album">${track.album || 'Unknown'}</span>
      <span class="liked-track-duration">${track.time || '—'}</span>
      <button class="liked-track-remove" title="Unlike" onclick="unlikeTrack('${track.id}')">
        <span class="material-symbols-rounded fill" style="color:#ff4d6d;font-size:18px;">favorite</span>
      </button>
    `;
    row.addEventListener('dblclick', () => {
      const idx = playlist.findIndex(p => p.id === track.id);
      if (idx !== -1) {
        leaveRoom();
        currentTrackIndex = idx;
        loadTrack(idx);
        if (!isPlaying) togglePlay();
      }
    });
    list.appendChild(row);
  });
}

window.unlikeTrack = function(trackId) {
  likedSongs = likedSongs.filter(t => t.id !== trackId);
  saveLikedSongs();
  updateFavoriteUI();
  renderLikedSongs();
};

// Wire favorite button
if (favoriteBtn) {
  favoriteBtn.addEventListener('click', toggleLike);
}

// Wire Play All liked
document.getElementById('btn-play-liked')?.addEventListener('click', () => {
  if (likedSongs.length === 0) return;
  const firstTrack = likedSongs[0];
  const idx = playlist.findIndex(p => p.id === firstTrack.id);
  if (idx !== -1) {
    switchView('home-view');
    leaveRoom();
    currentTrackIndex = idx;
    loadTrack(idx);
    if (!isPlaying) togglePlay();
  }
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
    renderRoomQueue();
    if (queuePanel && queuePanel.getAttribute('aria-hidden') !== 'true') renderQueue();
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

function renderRoomQueue() {
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
  // Start the dynamically loading track timeline
  fetchPlaylist();

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

  // ── Hook up Upload Logic ──
  const uploadForm = document.getElementById('upload-form');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const audioFile = document.getElementById('upload-audio').files[0];
      const imageFile = document.getElementById('upload-image').files[0];
      const title = document.getElementById('upload-title').value;
      const artist = document.getElementById('upload-artist').value;
      const album = document.getElementById('upload-album').value || '';
      const mood = document.getElementById('upload-mood').value;
      
      if (!audioFile || !imageFile || !title || !artist) return alert('Please fill required fields.');

      const submitBtn = document.getElementById('upload-submit-btn');
      const progressContainer = document.getElementById('upload-progress-container');
      const progressBar = document.getElementById('upload-progress-bar');
      const statusText = document.getElementById('upload-status');
      
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      progressContainer.style.display = 'block';
      progressBar.style.width = '10%';
      statusText.textContent = 'Uploading Cover Art...';

      try {
        const imgExt = imageFile.name.split('.').pop();
        const imgName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${imgExt}`;
        const { error: imgErr, data: imgData } = await supabaseClient.storage.from('covers').upload(imgName, imageFile);
        if (imgErr) throw imgErr;
        const imgUrl = supabaseClient.storage.from('covers').getPublicUrl(imgName).data.publicUrl;

        progressBar.style.width = '40%';
        statusText.textContent = 'Uploading Audio Track...';

        const audioExt = audioFile.name.split('.').pop();
        const audioName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${audioExt}`;
        const { error: audioErr, data: audioData } = await supabaseClient.storage.from('music').upload(audioName, audioFile);
        if (audioErr) throw audioErr;
        const audioUrl = supabaseClient.storage.from('music').getPublicUrl(audioName).data.publicUrl;

        // Try to estimate duration from file if possible, or just default to 3:00 for MVP
        let parsedDuration = '03:00';
        progressBar.style.width = '80%';
        statusText.textContent = 'Saving Metadata...';

        const { error: dbErr } = await supabaseClient.from('tracks').insert([{
           title, artist, album, mood, time: parsedDuration, src_url: audioUrl, img_url: imgUrl 
        }]);
        if (dbErr) throw dbErr;

        progressBar.style.width = '100%';
        statusText.textContent = 'Success!';
        
        // Refresh playlist
        await fetchPlaylist();
        
        setTimeout(() => {
          uploadForm.reset();
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          progressContainer.style.display = 'none';
          document.getElementById('nav-recommended').click(); // Switch to recommended to see the new track natively
        }, 1500);

      } catch (err) {
        console.error('Upload error', err);
        statusText.textContent = 'Upload failed: ' + err.message;
        statusText.style.color = '#ff4d6d';
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }
    });
  }
});
