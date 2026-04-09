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
      time: t.time || '0:00',
      play_count: t.play_count || 0,
      created_at: new Date(t.created_at)
    }));
  } else {
    playlist = []; // Empty state handled by UI
  }

  // Initialize UI now that data is loaded
  initPlayer();
  renderRecommendations('chill'); 
  initSidebarRecs();
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

// User Playlists State
let userPlaylists = JSON.parse(localStorage.getItem('userPlaylists') || '[]');
let currentPlaylistId = null;

function savePlaylists() {
  localStorage.setItem('userPlaylists', JSON.stringify(userPlaylists));
}

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

// New Artist View Elements
const artistView = document.getElementById('artist-view');
const artistNameDisplay = document.getElementById('artist-name-display');
const artistStatsDisplay = document.getElementById('artist-stats-display');
const artistTracksList = document.getElementById('artist-tracks-list');
const artistNoSongs = document.getElementById('artist-no-songs');
const btnPlayArtistAll = document.getElementById('btn-play-artist-all');

// New Playlist System Elements
const playlistViewTitle = document.getElementById('playlist-view-title');
const playlistViewSubtitle = document.getElementById('playlist-view-subtitle');
const playlistCollectionGrid = document.getElementById('playlist-collection-grid');
const playlistTracksSection = document.getElementById('playlist-tracks-section');
const playlistListSection = document.getElementById('playlist-list-section');
const playlistTrackList = document.getElementById('playlist-track-list');
const playlistDetailActions = document.getElementById('playlist-detail-actions');

const modalCreatePlaylist = document.getElementById('modal-create-playlist');
const modalAddToPlaylist = document.getElementById('modal-add-to-playlist');
const modalGlobalTrackSelector = document.getElementById('modal-global-track-selector');
const inputPlaylistName = document.getElementById('input-playlist-name');
const inputSelectorSearch = document.getElementById('input-selector-search');
const playlistSelectorList = document.getElementById('playlist-selector-list');
const selectorTrackList = document.getElementById('selector-track-list');

const btnNewPlaylistSidebar = document.getElementById('btn-new-playlist-sidebar');
const btnConfirmPlaylist = document.getElementById('btn-confirm-playlist');
const btnCancelPlaylist = document.getElementById('btn-cancel-playlist');
const btnCancelAdd = document.getElementById('btn-cancel-add');
const btnCloseSelector = document.getElementById('btn-close-selector');
const btnBackToPlaylists = document.getElementById('btn-back-to-playlists');
const btnPlayPlaylist = document.getElementById('btn-play-playlist');
const btnPlaylistAddSongs = document.getElementById('btn-playlist-add-songs');
const btnDeleteCurrentPlaylist = document.getElementById('btn-delete-current-playlist');


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
  
  // Update Smart Recs in Sidebar
  renderSmartRecs();

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

// Queue Panel Toggle
function toggleQueuePanel() {
  const isHidden = queuePanel.getAttribute('aria-hidden') === 'true';
  queuePanel.setAttribute('aria-hidden', !isHidden);
  queuePanelBackdrop.style.display = isHidden ? 'block' : 'none';
  if (isHidden) renderQueue();
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
       
       // UI Feedback: Open the queue panel if it's not already open
       if (!queuePanel || queuePanel.getAttribute('aria-hidden') === 'true') {
           if (typeof toggleQueuePanel === 'function') {
               toggleQueuePanel();
           }
       } else {
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

// Global Delete Function (Permanent removal)
window.deleteTrack = async function(id, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  const { error } = await supabaseClient.from('tracks').delete().eq('id', id);
  if (!error) {
    // Optimistic UI Update: Remove from local array immediately
    playlist = playlist.filter(t => t.id !== id);
    
    // Refresh UI based on current view
    if (document.getElementById('home-view').style.display !== 'none' || 
        document.getElementById('recommended-view').style.display !== 'none') {
        renderRecommendations();
        initHeroCarousel();
    } else if (document.getElementById('artist-view').style.display !== 'none') {
        const artistName = document.getElementById('artist-name-display').textContent;
        showArtistView(artistName);
    }
  } else {
    console.error('Error deleting track:', error);
    alert('Failed to remove track.');
  }
};

function getRecommendations() {
    let pool = [...playlist];
    
    // Sort by play count first (most popular), then by newest added
    pool.sort((a,b) => {
       if (b.play_count !== a.play_count) {
           return b.play_count - a.play_count;
       }
       return b.created_at - a.created_at;
    });

    return pool.slice(0, 15);
}

function renderRecommendations() {
    const list = document.getElementById('recommended-track-list');
    if(!list) return;
    list.innerHTML = '';
    
    const recs = getRecommendations();
    
    if(recs.length === 0) {
       list.innerHTML = '<p style="padding:40px;text-align:center;color:var(--on-surface-muted);">No tracks available.</p>';
       return;
    }

    recs.forEach((track, i) => {
        const isNew = (new Date() - track.created_at) < (7 * 24 * 60 * 60 * 1000); // within 7 days
        const newBadge = isNew ? '<span class="badge-new">NEWLY ADDED</span>' : '';
        const playCountLabel = `<span style="font-size:10px; color:var(--on-surface-muted); margin-left:8px;">${track.play_count} plays</span>`;
        
        const row = document.createElement('div');
        row.className = 'liked-track-row';
        row.innerHTML = `
          <span class="liked-track-num">${(i + 1).toString().padStart(2, '0')}</span>
          <div class="liked-track-art" style="background-image:url('${track.img}');background-size:cover;background-position:center;"></div>
          <div class="liked-track-info">
            <span class="liked-track-title">${track.title} ${newBadge}</span>
            <span class="liked-track-artist">${track.artist} ${playCountLabel}</span>
          </div>
          <span class="liked-track-album">${track.album || 'Unknown'}</span>
          <span class="liked-track-duration">${track.time || '—'}</span>
          <button type="button" class="queue-add-btn" title="Add to Queue" onclick="addToQueueId('${track.id}', event)">
            <span class="material-symbols-rounded">playlist_add</span>
          </button>
          <button type="button" class="delete-track-btn" title="Permanently Remove" onclick="deleteTrack('${track.id}', event)">
            <span class="material-symbols-rounded" style="color:var(--primary); font-size:20px;">delete_forever</span>
          </button>
          <button type="button" class="add-to-playlist-btn" title="Add to Playlist" onclick="openAddTrackToPlaylistModal('${track.id}', event)">
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

// -------------------------------------------------------------
// Smart Recommendations Engine
// -------------------------------------------------------------

const MOOD_ICONS = { chill:'❄️', upbeat:'⚡', focus:'🎯', sad:'🌧️', workout:'💪', jolly:'🎉' };
const MOOD_LABELS = { chill:'Chill vibes today', upbeat:'You\'re feeling energetic!', focus:'In the zone — deep focus', sad:'Melancholy mood', workout:'Ready to grind!', jolly:'Party mode activated!' };

function inferMoodFromHistory() {
  if (playHistory.length === 0) return null;
  // Score moods from the last 20 plays, weight recency
  const recent = playHistory.slice(-20);
  const scores = {};
  recent.forEach((t, i) => {
    if (!t.mood || t.mood === 'unspecified') return;
    const weight = (i + 1) / recent.length; // newer = higher weight
    scores[t.mood] = (scores[t.mood] || 0) + weight;
  });
  if (Object.keys(scores).length === 0) return null;
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

// Toggle Smart Recs in Sidebar (No toggle needed anymore as it is persistent)
// But we still need to initialize it and update it
function initSidebarRecs() {
  renderSmartRecs();
}

function renderSmartRecs() {
  const moodEl = document.getElementById('sidebar-mood-text');
  const listEl = document.getElementById('sidebar-smart-recs-list');
  if (!listEl) return;

  const inferredMood = inferMoodFromHistory();

  if (!inferredMood) {
    if(moodEl) moodEl.textContent = 'Play more to get picks';
    listEl.innerHTML = '<p style="padding:12px;font-size:11px;color:var(--on-surface-muted);">Your history is empty.</p>';
    return;
  }

  if(moodEl) moodEl.textContent = MOOD_LABELS[inferredMood] || inferredMood;

  // Pick tracks matching the mood that are NOT already in queue
  const queuedIds = new Set(userQueue.map(t => t.id));
  let candidates = playlist.filter(t => t.mood === inferredMood && !queuedIds.has(t.id));
  if (candidates.length === 0) candidates = playlist.filter(t => !queuedIds.has(t.id));
  
  // Sort by play_count desc, take top 4 for sidebar
  candidates.sort((a, b) => b.play_count - a.play_count);
  const picks = candidates.slice(0, 4);

  listEl.innerHTML = '';
  if (picks.length === 0) {
    listEl.innerHTML = '<p style="padding:12px;font-size:11px;color:var(--on-surface-muted);">All picks in queue!</p>';
    return;
  }

  picks.forEach(track => {
    const item = document.createElement('div');
    item.className = 'smart-sidebar-item';
    item.innerHTML = `
      <div class="smart-sidebar-art" style="background-image:url('${track.img}')"></div>
      <div class="smart-sidebar-info">
        <p class="smart-sidebar-title">${track.title}</p>
        <p class="smart-sidebar-artist">${track.artist}</p>
      </div>
      <span class="material-symbols-rounded smart-sidebar-add">add_circle</span>
    `;
    item.addEventListener('click', (e) => {
      addToQueueId(track.id, e);
      item.querySelector('.smart-sidebar-add').textContent = 'check_circle';
      item.querySelector('.smart-sidebar-add').style.color = 'var(--primary)';
    });
    listEl.appendChild(item);
  });
}

function updateVolumeUI() {
  volumeFill.style.width = `${volume * 100}%`;
}

function populateGrids() {
  const albumGrid = document.getElementById('album-grid');
  if (albumGrid) {
    albumGrid.innerHTML = '';
    playlist.forEach((track, i) => {
      const card = document.createElement('div');
      card.className = 'album-card';
      card.innerHTML = `
        <div class="album-art" style="background-image:url('${track.img}');background-size:cover;background-position:center;">
          <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
        </div>
        <p class="album-name">${track.title}</p>
        <p class="artist-name">${track.artist}</p>
      `;
      card.addEventListener('click', () => {
        currentTrackIndex = i;
        loadTrack(i);
        if (!isPlaying) togglePlay();
      });
      albumGrid.appendChild(card);
    });
  }

  // ── Hero Carousel ──
  initHeroCarousel();
}

// ── Artist Detail View Logic ──
function showArtistView(artistName) {
  // Switch view
  document.querySelectorAll('.view-container').forEach(v => v.style.display = 'none');
  artistView.style.display = 'block';
  window.scrollTo(0,0);
  
  artistNameDisplay.textContent = artistName;
  
  // Filter tracks
  const tracks = playlist.filter(t => t.artist.toLowerCase().trim() === artistName.toLowerCase().trim());
  artistStatsDisplay.textContent = `${tracks.length} Songs • ${Math.floor(Math.random() * 500) + 100}k Monthly Listeners`;
  
  artistTracksList.innerHTML = '';
  if (tracks.length === 0) {
    artistNoSongs.style.display = 'block';
    artistTracksList.style.display = 'none';
    btnPlayArtistAll.style.display = 'none';
  } else {
    artistNoSongs.style.display = 'none';
    artistTracksList.style.display = 'flex';
    btnPlayArtistAll.style.display = 'flex';
    
    tracks.forEach((track, i) => {
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
         <button type="button" class="delete-track-btn" title="Permanently Remove" onclick="deleteTrack('${track.id}', event)">
           <span class="material-symbols-rounded" style="color:var(--primary); font-size:20px;">delete_forever</span>
         </button>
         <button type="button" class="add-to-playlist-btn" title="Add to Playlist" onclick="openAddTrackToPlaylistModal('${track.id}', event)">
           <span class="material-symbols-rounded">playlist_add</span>
         </button>
       `;
       row.addEventListener('dblclick', () => {
         const idx = playlist.findIndex(p => p.id === track.id);
         if(idx !== -1) {
           currentTrackIndex = idx;
           loadTrack(idx);
           if(!isPlaying) togglePlay();
         }
       });
       artistTracksList.appendChild(row);
    });

    btnPlayArtistAll.onclick = () => {
       const firstTrack = tracks[0];
       const idx = playlist.findIndex(p => p.id === firstTrack.id);
       if(idx !== -1) {
          currentTrackIndex = idx;
          loadTrack(idx);
          if(!isPlaying) togglePlay();
          userQueue = [...tracks.slice(1)];
          renderQueue();
       }
    };
  }
}

// ── Hero Carousel: dynamic slides from newest tracks ──
let heroSlideIndex = 0;
let heroSlideTimer = null;

function initHeroCarousel() {
  if (playlist.length === 0) return;
  // Sort newest first
  const sorted = [...playlist].sort((a, b) => b.created_at - a.created_at).slice(0, 6);
  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  // Build slides
  heroCard.innerHTML = '';

  let slidesHTML = sorted.map((track, i) => {
    const moodIcon = { chill:'spa', upbeat:'bolt', focus:'self_improvement', sad:'rainy_snow', workout:'fitness_center', jolly:'celebration' }[track.mood] || 'music_note';
    return `
    <div class="hero-slide ${i === 0 ? 'active' : ''}" data-index="${i}" data-track-id="${track.id}">
      <div class="hero-content">
        <span class="badge"><span class="material-symbols-rounded" style="font-size:13px;vertical-align:middle;margin-right:4px;">${moodIcon}</span>NEWLY ADDED</span>
        <h1 class="hero-title">${track.title}</h1>
        <p class="hero-desc" style="margin-bottom:8px;">by <strong>${track.artist}</strong>${track.album && track.album !== 'Unknown' ? ` — ${track.album}` : ''}</p>
        <div class="hero-actions">
          <button class="btn-primary hero-play-btn" data-track-id="${track.id}">
            <span class="material-symbols-rounded fill" style="font-size:18px;margin-right:6px;">play_arrow</span>PLAY
          </button>
          <button class="btn-follow hero-queue-btn" data-track-id="${track.id}">
            <span class="material-symbols-rounded" style="font-size:18px;margin-right:6px;">playlist_add</span>ADD TO QUEUE
          </button>
        </div>
      </div>
      <div class="hero-image">
        <img src="${track.img}" alt="${track.title}" style="border-radius:12px;object-fit:cover;width:220px;height:220px;box-shadow:0 8px 32px rgba(0,0,0,0.4);" />
      </div>
    </div>`;
  }).join('');

  // Add dot indicators
  const dotsHTML = `<div class="hero-dots">${sorted.map((_, i) => `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`).join('')}</div>`;

  heroCard.innerHTML = slidesHTML + dotsHTML;
  heroCard.style.position = 'relative';
  heroCard.style.overflow = 'hidden';

  // Ensure heroSlideIndex starts at 0 for fresh renders
  heroSlideIndex = 0;

  // Wire play buttons
  heroCard.querySelectorAll('.hero-play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.trackId;
      const idx = playlist.findIndex(p => p.id === tid);
      if (idx !== -1) { leaveRoom(); currentTrackIndex = idx; loadTrack(idx); if (!isPlaying) togglePlay(); }
    });
  });

  // Wire queue buttons
  heroCard.querySelectorAll('.hero-queue-btn').forEach(btn => {
    btn.addEventListener('click', () => addToQueueId(btn.dataset.trackId, null));
  });

  // Wire dots
  heroCard.querySelectorAll('.hero-dot').forEach(dot => {
    dot.addEventListener('click', () => goToHeroSlide(parseInt(dot.dataset.index), sorted));
  });

  // Auto-advance
  if (heroSlideTimer) clearInterval(heroSlideTimer);
  heroSlideTimer = setInterval(() => {
    const currentSlides = document.querySelectorAll('.hero-slide');
    if (currentSlides.length > 1) {
      heroSlideIndex = (heroSlideIndex + 1) % currentSlides.length;
      goToHeroSlide(heroSlideIndex);
    }
  }, 5000);
}

function goToHeroSlide(index, sorted) {
  heroSlideIndex = index;
  document.querySelectorAll('.hero-slide').forEach((s, i) => s.classList.toggle('active', i === index));
  document.querySelectorAll('.hero-dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

// Legacy Room logic removed in favor of the new Room Entry Dashboard at the bottom of main.js

const views = ['home-view', 'room-view', 'playlist-view', 'last-listening-view', 'recommended-view', 'my-library-view', 'radio-view', 'liked-songs-view', 'upload-view', 'artist-view'];

function switchView(viewId) {
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) {
      if (v === viewId) {
        el.style.display = (v === 'room-view' || v === 'upload-view' || v === 'artist-view') ? 'flex' : 'block';
      } else {
        el.style.display = 'none';
      }
    }
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
    if (item.id === 'nav-my-playlist')     targetView = 'playlist-view';
    if (item.id === 'nav-last-listening') targetView = 'last-listening-view';
    if (item.id === 'nav-recommended')    targetView = 'recommended-view';
    if (item.id === 'nav-liked')          targetView = 'liked-songs-view';
    if (item.id === 'nav-upload')         targetView = 'upload-view';

    if (targetView === 'liked-songs-view') renderLikedSongs();
    if (targetView === 'playlist-view') showPlaylists();
    if (targetView === 'last-listening-view') renderLastListening();

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
      <button type="button" class="add-to-playlist-btn" title="Add to Playlist" onclick="openAddTrackToPlaylistModal('${track.id}', event)">
        <span class="material-symbols-rounded">playlist_add</span>
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
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabaseClient.from('rooms').insert([{
    id: roomId,
    name: `${userName}'s Room`,
    host_id: userId,
    room_code: roomCode,
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

async function joinRoomByCode(code) {
  const { data, error } = await supabaseClient.from('rooms')
    .select('*')
    .eq('room_code', code.toUpperCase())
    .single();
    
  if (error || !data) {
    alert('Invalid room code!');
    return;
  }
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
  roomStatus.textContent = `Connected`;
  document.getElementById('room-code-badge').textContent = `CODE: ${data.room_code || '------'}`;
  
  // View states
  document.getElementById('room-setup-view').style.display = 'none';
  document.getElementById('room-active-view').style.display = 'block';
  
  // Pause any local track playing
  isPlaying = false;
  audioPlayer.pause();
  
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
  if (!currentRoomId) return;
  const { data, error } = await supabaseClient.from('queue')
    .select('*')
    .eq('room_id', currentRoomId);
    
  if (error) return console.error('Error fetching queue:', error);
  
  // Sort by vote count (length of voter_ids)
  roomQueue = data.sort((a, b) => {
    const votesA = (a.voter_ids || []).length;
    const votesB = (b.voter_ids || []).length;
    if (votesB !== votesA) return votesB - votesA;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
  
  renderRoomQueue();
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
  const upcomingList = document.getElementById('upcoming-list');
  queueList.innerHTML = '';
  if (upcomingList) upcomingList.innerHTML = '';

  if (roomQueue.length === 0) {
    queueList.innerHTML = '<p class="empty-msg">The queue is empty. Use the + button to vote for a song!</p>';
    return;
  }
  
  // 1. Render Top Voted Track (Up Next)
  const topTrack = roomQueue[0];
  const topVotes = (topTrack.voter_ids || []).length;
  const topHasVoted = (topTrack.voter_ids || []).includes(userId);
  
  const upNextDiv = document.createElement('div');
  upNextDiv.className = `queue-item top-voted`;
  upNextDiv.innerHTML = `
    <div class="vote-control">
      <button class="btn-vote ${topHasVoted ? 'voted' : ''}" onclick="window.voteForTrack('${topTrack.id}')">
        <span class="material-symbols-rounded">expand_less</span>
      </button>
      <span class="vote-count">${topVotes}</span>
    </div>
    <div class="queue-track-info">
      <p class="q-title">${topTrack.track_name}</p>
      <p class="q-artist">${topTrack.track_artist}</p>
    </div>
    ${isHost ? `
      <div class="host-controls">
        <button class="icon-btn" onclick="window.playNextFromQueue('${topTrack.id}')" title="Play Now">
          <span class="material-symbols-rounded">play_arrow</span>
        </button>
        <button class="icon-btn btn-remove-room" data-id="${topTrack.id}" title="Remove">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
    ` : ''}
  `;
  queueList.appendChild(upNextDiv);

  // 2. Render Remaining Tracks (Upcoming)
  if (upcomingList) {
    const upcomingTracks = roomQueue.slice(1);
    if (upcomingTracks.length === 0) {
      upcomingList.innerHTML = '<p style="color:var(--on-surface-muted); font-size:12px; padding:10px;">No more upcoming tracks.</p>';
    } else {
      upcomingTracks.forEach((item) => {
        const votes = (item.voter_ids || []).length;
        const hasVoted = (item.voter_ids || []).includes(userId);
        const div = document.createElement('div');
        div.className = 'upcoming-item';
        div.innerHTML = `
          <div class="upcoming-track-info">
            <p class="upcoming-title">${item.track_name}</p>
            <p class="upcoming-artist">${item.track_artist}</p>
          </div>
          <div class="upcoming-vote">
            <span class="material-symbols-rounded ${hasVoted ? 'fill' : ''}" style="${hasVoted ? 'color:var(--primary)' : ''}" onclick="window.voteForTrack('${item.id}')">thumb_up</span>
            <span>${votes}</span>
          </div>
          ${isHost ? `
            <button class="icon-btn btn-remove-room" data-id="${item.id}" title="Remove">
              <span class="material-symbols-rounded" style="font-size:18px;">close</span>
            </button>
          ` : ''}
        `;
        upcomingList.appendChild(div);
      });
    }
  }
}

// Event Delegation for Room Queue
const roomQueueEventHandler = async (e) => {
  const removeBtn = e.target.closest('.btn-remove-room');
  if (removeBtn) {
    e.stopPropagation();
    const qid = removeBtn.getAttribute('data-id');
    console.log('[DEBUG: ROOM] REMOVE click detected for ID:', qid);
    await window.removeFromRoomQueue(qid);
    return;
  }
};

if (queueList) {
  queueList.addEventListener('click', roomQueueEventHandler);
}

// Target the upcoming list as well
document.addEventListener('DOMContentLoaded', () => {
  const upcomingList = document.getElementById('upcoming-list');
  if (upcomingList) {
    upcomingList.addEventListener('click', roomQueueEventHandler);
  }
});

window.voteForTrack = async function(queueItemId) {
  const item = roomQueue.find(q => q.id === queueItemId);
  if (!item) return;
  
  let voters = Array.isArray(item.voter_ids) ? [...item.voter_ids] : [];
  if (voters.includes(userId)) {
    voters = voters.filter(id => id !== userId);
  } else {
    voters.push(userId);
  }
  
  await supabaseClient.from('queue')
    .update({ voter_ids: voters })
    .eq('id', queueItemId);
};

window.playNextFromQueue = async function(queueItemId) {
  if (!isHost) return;
  const item = roomQueue.find(q => q.id === queueItemId);
  if (!item) return;
  
  // Set as current track
  await supabaseClient.from('rooms').update({
    current_track_id: item.track_id,
    is_playing: true,
    started_at: new Date().toISOString()
  }).eq('id', currentRoomId);
  
  // Remove from queue
  await window.removeFromRoomQueue(queueItemId);
};

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

async function addTrackToRoomQueue(track) {
  if (!currentRoomId) return;
  await supabaseClient.from('queue').insert([{
    room_id: currentRoomId,
    track_id: track.id,
    track_name: track.title,
    track_artist: track.artist,
    submitted_by: userId,
    voter_ids: [userId] // Initial vote from submitter
  }]);
}

window.removeFromRoomQueue = async function(queueItemId) {
  console.log('[DEBUG: ROOM] Attempting removal:', {
    targetId: queueItemId,
    isHost: isHost,
    userId: userId,
    roomId: currentRoomId
  });

  if (!queueItemId) {
    console.error('[DEBUG: ROOM] No queueItemId provided!');
    return;
  }

  // Optimistic UI Update: Remove from local array immediately
  roomQueue = roomQueue.filter(item => item.id !== queueItemId);
  renderRoomQueue();

  const { error } = await supabaseClient
    .from('queue')
    .delete()
    .eq('id', queueItemId);

  if (error) {
    console.error('[DEBUG: ROOM] Removal failed:', error);
    alert('Failed to remove song. Check console for details.');
    // Rollback optimistic update if failed
    fetchQueue();
  } else {
    console.log('[DEBUG: ROOM] Removal successful');
    // Ensure state is perfectly synced
    fetchQueue();
  }
};

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

  // If host, observe track end to play next top voted
  if (isHost && audioPlayer.ended && roomQueue.length > 0) {
    playNextFromQueue(roomQueue[0].id);
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
  fetchPlaylist();
  setupEventListeners();

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
        else {
          switchView(targetView);
          if (targetView === 'last-listening-view') renderLastListening();
          if (targetView === 'radio-view') renderRadioView();
        }

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

  // ── Hook up New Playlist Events ──
  if (btnNewPlaylistSidebar) btnNewPlaylistSidebar.addEventListener('click', openCreatePlaylistModal);
  if (btnCancelPlaylist) btnCancelPlaylist.addEventListener('click', closeCreatePlaylistModal);
  if (btnCancelAdd) btnCancelAdd.addEventListener('click', () => modalAddToPlaylist.classList.remove('active'));
  if (btnCloseSelector) btnCloseSelector.addEventListener('click', () => modalGlobalTrackSelector.classList.remove('active'));
  if (btnPlaylistAddSongs) btnPlaylistAddSongs.addEventListener('click', openGlobalTrackSelector);

  if (inputSelectorSearch) {
    inputSelectorSearch.addEventListener('input', () => renderGlobalTrackSelector(inputSelectorSearch.value));
  }

  if (btnConfirmPlaylist) {
    btnConfirmPlaylist.addEventListener('click', () => {
      const name = inputPlaylistName.value.trim();
      if (name) {
        const newPl = {
          id: 'pl_' + Date.now(),
          name: name,
          tracks: []
        };
        userPlaylists.push(newPl);
        savePlaylists();
        closeCreatePlaylistModal();
        if (document.getElementById('playlist-view').style.display !== 'none') {
            renderPlaylistCollection();
        }
      }
    });
  }

  if (btnBackToPlaylists) btnBackToPlaylists.addEventListener('click', showPlaylists);

  // ── Listening Room Setup ──
  const btnCreateRoomNew = document.querySelector('#card-create-room button');
  const btnJoinRoomNew = document.getElementById('btn-join-room');
  const inputRoomCode = document.getElementById('input-room-code');
  const btnLeaveRoom = document.getElementById('btn-leave-room');
  const btnAddSongRoom = document.getElementById('btn-add-song-room');

  if (btnAddSongRoom) {
    btnAddSongRoom.addEventListener('click', () => openGlobalTrackSelector('room'));
  }

  if (btnCreateRoomNew) btnCreateRoomNew.addEventListener('click', createRoom);
  if (btnJoinRoomNew) {
    btnJoinRoomNew.addEventListener('click', () => {
      const code = inputRoomCode.value.trim();
      if (code) joinRoomByCode(code);
    });
  }
  if (btnLeaveRoom) {
    btnLeaveRoom.addEventListener('click', () => {
       leaveRoom('home-view');
    });
  }

  // Override sidebar room button
  const btnRooms = document.getElementById('nav-room');
  if (btnRooms) {
    btnRooms.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('room-view');
      if (!currentRoomId) {
        document.getElementById('room-setup-view').style.display = 'block';
        document.getElementById('room-active-view').style.display = 'none';
      } else {
        document.getElementById('room-setup-view').style.display = 'none';
        document.getElementById('room-active-view').style.display = 'block';
      }
    });
  }

  if (btnPlayPlaylist) {
    btnPlayPlaylist.addEventListener('click', () => {
      const pl = userPlaylists.find(p => p.id === currentPlaylistId);
      if (pl && pl.tracks.length > 0) {
        const firstTrack = pl.tracks[0];
        const idx = playlist.findIndex(p => p.id === firstTrack.id);
        if(idx !== -1) {
           currentTrackIndex = idx;
           loadTrack(idx);
           if(!isPlaying) togglePlay();
           // Queue the rest
           userQueue = [...pl.tracks.slice(1)];
           renderQueue();
        }
      }
    });
  }

  // ── Artist Card Event Delegation ──
  document.addEventListener('click', (e) => {
    const artistCard = e.target.closest('.artist-card');
    if (artistCard) {
      const name = artistCard.querySelector('.artist-name').textContent;
      showArtistView(name);
    }
  });

  // ── Search & Filter Logic ──
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
// -------------------------------------------------------------
// Multi-Playlist Logic
// -------------------------------------------------------------

function showPlaylists() {
  currentPlaylistId = null;
  playlistViewTitle.textContent = "My Library Playlists";
  playlistViewSubtitle.textContent = "Your curated collections.";
  
  playlistListSection.style.display = 'block';
  playlistTracksSection.style.display = 'none';
  playlistDetailActions.style.display = 'none';
  
  renderPlaylistCollection();
}

function renderPlaylistCollection() {
  playlistCollectionGrid.innerHTML = '';
  
  if (userPlaylists.length === 0) {
    playlistCollectionGrid.innerHTML = `
      <div style="grid-column: 1/-1; padding: 60px 20px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px dashed var(--border);">
         <span class="material-symbols-rounded" style="font-size: 48px; color: var(--on-surface-muted); margin-bottom: 16px;">library_music</span>
         <h3 style="margin-bottom: 8px;">No playlists yet</h3>
         <p style="color: var(--on-surface-muted); margin-bottom: 24px;">Create your first playlist to start organizing your music!</p>
         <button class="btn-primary" onclick="openCreatePlaylistModal()">CREATE PLAYLIST</button>
      </div>
    `;
    return;
  }
  
  userPlaylists.forEach(pl => {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.innerHTML = `
      <div class="playlist-art-stack">
        <span class="material-symbols-rounded">queue_music</span>
      </div>
      <div class="playlist-card-name">${pl.name}</div>
      <div class="playlist-card-count">${pl.tracks.length} tracks</div>
    `;
    card.addEventListener('click', () => showPlaylistDetail(pl.id));
    playlistCollectionGrid.appendChild(card);
  });
}

function showPlaylistDetail(playlistId) {
  const pl = userPlaylists.find(p => p.id === playlistId);
  if (!pl) return;
  
  currentPlaylistId = playlistId;
  playlistViewTitle.textContent = pl.name;
  playlistViewSubtitle.textContent = `${pl.tracks.length} tracks • Created by you`;
  
  playlistListSection.style.display = 'none';
  playlistTracksSection.style.display = 'block';
  playlistDetailActions.style.display = 'flex';
  
  renderPlaylistTracksListing(pl);
}

function renderPlaylistTracksListing(playlistObj) {
  playlistTrackList.innerHTML = '';
  
  if (playlistObj.tracks.length === 0) {
     playlistTrackList.innerHTML = '<p style="padding:40px;text-align:center;color:var(--on-surface-muted);">No songs in this playlist yet.</p>';
     return;
  }
  
  playlistObj.tracks.forEach((track, i) => {
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
      <button type="button" class="liked-track-remove" title="Remove from Playlist" onclick="event.stopPropagation(); removeTrackFromCurrentPlaylist('${track.id}')">
        <span class="material-symbols-rounded" style="font-size:18px;">close</span>
      </button>
    `;
    row.addEventListener('dblclick', () => {
      const idx = playlist.findIndex(p => p.id === track.id);
      if (idx !== -1) {
        currentTrackIndex = idx;
        loadTrack(idx);
        if (!isPlaying) togglePlay();
      }
    });
    playlistTrackList.appendChild(row);
  });
}

window.removeTrackFromCurrentPlaylist = function(trackId) {
  const pl = userPlaylists.find(p => p.id === currentPlaylistId);
  if (!pl) return;
  pl.tracks = pl.tracks.filter(t => t.id !== trackId);
  savePlaylists();
  showPlaylistDetail(currentPlaylistId);
};

// Modal Handlers
function openCreatePlaylistModal() {
  modalCreatePlaylist.classList.add('active');
  inputPlaylistName.focus();
}

function closeCreatePlaylistModal() {
  modalCreatePlaylist.classList.remove('active');
  inputPlaylistName.value = '';
}

function openAddTrackToPlaylistModal(trackId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  const track = playlist.find(t => t.id === trackId);
  if (!track) return;
  
  modalAddToPlaylist.classList.add('active');
  playlistSelectorList.innerHTML = '';
  
  if (userPlaylists.length === 0) {
    playlistSelectorList.innerHTML = '<p style="padding:20px;text-align:center;color:var(--on-surface-muted);font-size:13px;">No playlists found. Create one first!</p>';
  } else {
    userPlaylists.forEach(pl => {
      const item = document.createElement('div');
      item.className = 'playlist-selector-item';
      item.innerHTML = `
        <span class="material-symbols-rounded">playlist_add</span>
        <div class="playlist-selector-info">
          <span class="playlist-selector-name">${pl.name}</span>
          <span class="playlist-selector-count">${pl.tracks.length} tracks</span>
        </div>
      `;
      item.onclick = () => {
        addTrackToPlaylist(pl.id, track);
        modalAddToPlaylist.classList.remove('active');
      };
      playlistSelectorList.appendChild(item);
    });
  }
}

function addTrackToPlaylist(playlistId, track) {
  const pl = userPlaylists.find(p => p.id === playlistId);
  if (!pl) return;
  
  if (pl.tracks.some(t => t.id === track.id)) {
    // Already exists
    return;
  }
  
  pl.tracks.push({ ...track });
  savePlaylists();
}

// Event Listeners for new UI (Moved to DOMContentLoaded)


window.openAddTrackToPlaylistModal = openAddTrackToPlaylistModal;

// -------------------------------------------------------------
// Last Listening (Fix)
// -------------------------------------------------------------

function renderLastListening() {
  const grid = document.getElementById('last-listening-grid');
  if (!grid) return;
  
  if (playHistory.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; padding: 60px; text-align: center; color: var(--on-surface-muted);">No play history yet.</p>';
    return;
  }
  
  grid.innerHTML = '';
  // Show most recent first
  const latest = [...playHistory].reverse();
  
  latest.forEach((track) => {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = `
      <div class="album-art" style="background-image:url('${track.img}');background-size:cover;background-position:center;">
        <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
      </div>
      <p class="album-name">${track.title}</p>
      <p class="artist-name">${track.artist}</p>
    `;
    card.addEventListener('click', () => {
      const idx = playlist.findIndex(p => p.id === track.id);
      if (idx !== -1) {
        currentTrackIndex = idx;
        loadTrack(idx);
        if (!isPlaying) togglePlay();
      }
    });
    grid.appendChild(card);
  });
}

// -------------------------------------------------------------
// Multi-Playlist Logic (Step 2)
// -------------------------------------------------------------

let selectorMode = 'playlist'; // 'playlist' or 'room'

function openGlobalTrackSelector(mode = 'playlist') {
  selectorMode = mode;
  modalGlobalTrackSelector.classList.add('active');
  inputSelectorSearch.value = '';
  renderGlobalTrackSelector();
}

function renderGlobalTrackSelector(query = '') {
  selectorTrackList.innerHTML = '';
  let existingIds = new Set();
  
  if (selectorMode === 'playlist') {
    const currentPL = userPlaylists.find(p => p.id === currentPlaylistId);
    existingIds = new Set(currentPL ? currentPL.tracks.map(t => t.id) : []);
  } else if (selectorMode === 'room') {
    existingIds = new Set(roomQueue.map(t => t.track_id));
  }
  
  const filtered = playlist.filter(t => {
     if (!query) return true;
     const q = query.toLowerCase();
     return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
  });
  
  if (filtered.length === 0) {
    selectorTrackList.innerHTML = '<p style="padding:40px;text-align:center;color:var(--on-surface-muted);">No tracks found.</p>';
    return;
  }
  
  filtered.forEach(track => {
    const isAdded = existingIds.has(track.id);
    const row = document.createElement('div');
    row.className = 'selector-track-row';
    row.innerHTML = `
      <div class="selector-track-art" style="background-image:url('${track.img}')"></div>
      <div class="selector-track-info">
        <span class="selector-track-title">${track.title}</span>
        <span class="selector-track-artist">${track.artist}</span>
      </div>
      <button class="btn-add-selector ${isAdded ? 'added' : ''}">${isAdded ? 'ADDED' : 'ADD'}</button>
    `;
    if (!isAdded) {
      row.querySelector('.btn-add-selector').onclick = () => {
        if (selectorMode === 'playlist') {
          addTrackToPlaylist(currentPlaylistId, track);
          showPlaylistDetail(currentPlaylistId);
        } else {
          addTrackToRoomQueue(track);
        }
        renderGlobalTrackSelector(inputSelectorSearch.value);
      };
    }
    selectorTrackList.appendChild(row);
  });
}

// -------------------------------------------------------------
// Sonic Radio Logic
// -------------------------------------------------------------

const radioContent = {
  stations: [
    { id: 'rad_1', title: 'Lo-Fi Beats 24/7', artist: 'Chill Station', img: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?q=80&w=500&auto=format&fit=crop', badge: 'LIVE' },
    { id: 'rad_2', title: 'Modern Jazz Hour', artist: 'Smooth Station', img: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=500&auto=format&fit=crop', badge: 'LIVE' },
    { id: 'rad_3', title: 'Synthwave Drift', artist: 'Neon Station', img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500&auto=format&fit=crop', badge: 'LIVE' }
  ],
  podcasts: [
    { id: 'pod_1', title: 'Deep Tech Daily', artist: 'The Tech Crew', img: './brain/bba90702-76d9-4e1e-8270-db4f918a9a04/podcast_tech_cover_1775752966816.png', badge: 'NEW EPISODE' },
    { id: 'pod_2', title: 'Acoustic Journeys', artist: 'Travel Pod', img: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=500&auto=format&fit=crop', badge: 'PODCAST' }
  ],
  stories: [
    { id: 'stor_1', title: 'Midnight Mysteries', artist: 'Narrator X', img: './brain/bba90702-76d9-4e1e-8270-db4f918a9a04/story_mystery_cover_1775752990565.png', badge: 'STORY' },
    { id: 'stor_2', title: 'Urban Legends', artist: 'Myth Archive', img: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?q=80&w=500&auto=format&fit=crop', badge: 'STORY' }
  ]
};

function renderRadioView() {
  const stationsGrid = document.getElementById('radio-stations-grid');
  const podcastsGrid = document.getElementById('radio-podcasts-grid');
  const storiesGrid = document.getElementById('radio-stories-grid');
  
  if (stationsGrid) renderRadioGrid(stationsGrid, radioContent.stations);
  if (podcastsGrid) renderRadioGrid(podcastsGrid, radioContent.podcasts);
  if (storiesGrid) renderRadioGrid(storiesGrid, radioContent.stories);
}

function renderRadioGrid(container, items) {
  container.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = `
      <div class="album-art" style="background-image:url('${item.img}');background-size:cover;background-position:center;">
        <div class="radio-card-badge">${item.badge}</div>
        <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
      </div>
      <p class="album-name">${item.title}</p>
      <p class="artist-name">${item.artist}</p>
    `;
    card.addEventListener('click', () => {
       // Logic to play a random or specific track for that station
       const randomIdx = Math.floor(Math.random() * playlist.length);
       currentTrackIndex = randomIdx;
       loadTrack(randomIdx);
       if (!isPlaying) togglePlay();
    });
    container.appendChild(card);
  });
}


