import { firebaseConfig } from './firebase-config.js';
import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, doc, addDoc,
         updateDoc, arrayUnion, arrayRemove,
         onSnapshot, query, orderBy, getDocs, getDoc,
         serverTimestamp, increment }             from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Firebase init ─────────────────────────────────────────────────────────────
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

// Upload server URL — same origin (Flask server serves this page and handles uploads)
const UPLOAD_URL = window.location.origin;

// ── Session ID (one per browser — used for like de-duplication) ───────────────
let SESSION_ID = localStorage.getItem('rpca56_session');
if (!SESSION_ID) {
  SESSION_ID = 'sess_' + Math.random().toString(36).slice(2) + Date.now();
  localStorage.setItem('rpca56_session', SESSION_ID);
}

// ── Countdown Timer ───────────────────────────────────────────────────────────
function updateCountdown() {
  const target = new Date('2026-07-11T18:00:00+07:00').getTime();
  const diff   = target - Date.now();
  if (diff <= 0) {
    document.getElementById('countdown').innerHTML =
      '<span style="color:var(--gold-lt);font-size:18px;font-weight:700">🎉 The party has started!</span>';
    return;
  }
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000)  / 60000);
  const secs  = Math.floor((diff % 60000)    / 1000);
  document.getElementById('cd-days').textContent  = String(days).padStart(2,'0');
  document.getElementById('cd-hours').textContent = String(hours).padStart(2,'0');
  document.getElementById('cd-mins').textContent  = String(mins).padStart(2,'0');
  document.getElementById('cd-secs').textContent  = String(secs).padStart(2,'0');
}
updateCountdown();
setInterval(updateCountdown, 1000);

// ── Tab Navigation ────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(s =>
    s.classList.toggle('active', s.id === `tab-${name}`));
  if (name === 'leaderboard') loadLeaderboard();
}
window.switchTab = switchTab;

document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// ── Utilities ─────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - (ts?.toDate?.() ?? new Date(ts)).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} day${d > 1 ? 's' : ''} ago`;
  if (h > 0) return `${h} hour${h > 1 ? 's' : ''} ago`;
  if (m > 0) return `${m} minute${m > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarLetter(name) { return (name || '?')[0].toUpperCase(); }

// ── Real-time Feed ────────────────────────────────────────────────────────────
const postsRef = collection(db, 'posts');
let cachedPosts = {};   // id → post data (for lightbox / comments)
let unsubFeed   = null;

function startFeed() {
  const container = document.getElementById('feed-container');
  container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Loading...</p></div>`;

  const q = query(postsRef, orderBy('timestamp', 'desc'));
  unsubFeed = onSnapshot(q, snapshot => {
    snapshot.docChanges().forEach(change => {
      const post = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'removed') {
        delete cachedPosts[post.id];
        document.getElementById(`post-${post.id}`)?.remove();
      } else {
        cachedPosts[post.id] = post;
      }
    });

    // Full re-render on first load; incremental on updates
    if (snapshot.metadata.hasPendingWrites === false) {
      renderFeed(Object.values(cachedPosts)
        .sort((a,b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0)));
    }
  }, err => {
    console.error(err);
    container.innerHTML = `<div class="empty-state"><p>Unable to load posts. Check your Firebase config.</p></div>`;
  });
}

function renderFeed(posts) {
  const container = document.getElementById('feed-container');
  if (!posts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <h3>No photos yet</h3>
        <p>Be the first to share a memory!</p>
      </div>`;
    return;
  }
  container.innerHTML = posts.map(p => buildPostHTML(p)).join('');
}

function buildPostHTML(post) {
  const liked      = (post.likes || []).includes(SESSION_ID);
  const likeCount  = post.likeCount ?? 0;
  const comments   = post.recentComments ?? [];
  const commentCount = post.commentCount ?? 0;
  const photos     = post.photos ?? [];

  let photosHTML = '';
  if (photos.length === 1) {
    photosHTML = `
      <div class="photos-single" onclick="openLightbox('${post.id}',0)">
        <img src="${escHtml(photos[0])}" alt="photo" loading="lazy"/>
      </div>`;
  } else {
    const show      = Math.min(photos.length, 9);
    const gridClass = photos.length === 2 ? 'count-2' : photos.length === 3 ? 'count-3' :
                      photos.length === 4 ? 'count-4' : 'count-many';
    const items = photos.slice(0, show).map((url, i) => {
      const isLast = i === show - 1 && photos.length > show;
      return isLast
        ? `<div class="photo-more" onclick="openLightbox('${post.id}',${i})">
             <img src="${escHtml(url)}" loading="lazy"/>
             <div class="photo-more-label">+${photos.length - show + 1}</div>
           </div>`
        : `<img src="${escHtml(url)}" loading="lazy" onclick="openLightbox('${post.id}',${i})"/>`;
    }).join('');
    photosHTML = `<div class="photos-grid ${gridClass}">${items}</div>`;
  }

  const recentHTML = comments.slice(-2).map(c =>
    `<div class="comment-preview"><strong>${escHtml(c.author)}</strong> ${escHtml(c.text)}</div>`
  ).join('');

  const viewAll = commentCount > 2
    ? `<div class="view-all-comments" onclick="openComments('${post.id}')">View all ${commentCount} comments</div>`
    : '';

  return `
    <article class="post-card" id="post-${post.id}">
      <div class="post-header">
        <div class="post-avatar">${avatarLetter(post.senderName)}</div>
        <div class="post-meta">
          <div class="post-sender">${escHtml(post.senderName)}</div>
          <div class="post-time">${timeAgo(post.timestamp)}</div>
        </div>
      </div>
      <div class="post-photos">${photosHTML}</div>
      <div class="post-actions">
        <button class="action-btn${liked ? ' liked' : ''}" onclick="toggleLike('${post.id}',this)">
          <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="${liked ? 'currentColor' : 'none'}">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span class="like-count">${likeCount}</span>
        </button>
        <button class="action-btn" onclick="openComments('${post.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>${commentCount}</span>
        </button>
      </div>
      <div class="post-comments">
        ${recentHTML}
        ${viewAll}
        ${!commentCount ? `<div class="view-all-comments" onclick="openComments('${post.id}')">Add a comment...</div>` : ''}
      </div>
    </article>`;
}

// ── Like ──────────────────────────────────────────────────────────────────────
async function toggleLike(postId, btn) {
  const post    = cachedPosts[postId];
  const liked   = (post?.likes ?? []).includes(SESSION_ID);
  const postDoc = doc(db, 'posts', postId);
  try {
    await updateDoc(postDoc, {
      likes:     liked ? arrayRemove(SESSION_ID) : arrayUnion(SESSION_ID),
      likeCount: increment(liked ? -1 : 1),
    });
    // Optimistic UI update
    const newLiked = !liked;
    btn.classList.toggle('liked', newLiked);
    btn.querySelector('svg').setAttribute('fill', newLiked ? 'currentColor' : 'none');
    const countEl = btn.querySelector('.like-count');
    countEl.textContent = parseInt(countEl.textContent) + (newLiked ? 1 : -1);
  } catch(e) { console.error(e); }
}
window.toggleLike = toggleLike;

// ── Comments ──────────────────────────────────────────────────────────────────
let activePostId = null;

async function openComments(postId) {
  activePostId = postId;
  document.getElementById('comment-post-id').value = postId;

  const list    = document.getElementById('comment-list');
  list.innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;
  document.getElementById('comment-modal').style.display  = 'flex';
  document.getElementById('comment-overlay').style.display = 'block';

  const commentsRef = collection(db, 'posts', postId, 'comments');
  const snap        = await getDocs(query(commentsRef, orderBy('timestamp', 'asc')));

  const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.innerHTML = comments.length
    ? comments.map(c => `
        <div class="comment-item">
          <div class="comment-avatar">${avatarLetter(c.author)}</div>
          <div class="comment-body">
            <div class="comment-author">${escHtml(c.author)}</div>
            <div class="comment-text">${escHtml(c.text)}</div>
            <div class="comment-ts">${timeAgo(c.timestamp)}</div>
          </div>
        </div>`).join('')
    : '<p style="color:#aaa;text-align:center;padding:20px">No comments yet</p>';
}
window.openComments = openComments;

function closeCommentModal() {
  document.getElementById('comment-modal').style.display  = 'none';
  document.getElementById('comment-overlay').style.display = 'none';
  activePostId = null;
}
window.closeCommentModal = closeCommentModal;

async function submitComment(e) {
  e.preventDefault();
  const postId = document.getElementById('comment-post-id').value;
  const author = document.getElementById('comment-author').value.trim();
  const text   = document.getElementById('comment-text').value.trim();
  if (!author || !text) return;

  const commentsRef = collection(db, 'posts', postId, 'comments');
  const comment = { author, text, timestamp: serverTimestamp() };
  await addDoc(commentsRef, comment);

  // Store last 2 comments on the post doc for feed preview + increment count
  const postDoc    = doc(db, 'posts', postId);
  const newPreview = { author, text };
  const freshSnap  = await getDoc(postDoc);
  const existing   = freshSnap.data()?.recentComments ?? [];
  const updated    = [...existing, newPreview].slice(-2);
  await updateDoc(postDoc, { recentComments: updated, commentCount: increment(1) });

  document.getElementById('comment-text').value = '';
  await openComments(postId); // refresh modal list
}
window.submitComment = submitComment;

document.getElementById('comment-form').addEventListener('submit', submitComment);

// ── Lightbox ──────────────────────────────────────────────────────────────────
let lbPostId = null, lbIndex = 0, lbPhotos = [];

function openLightbox(postId, idx) {
  const post = cachedPosts[postId];
  if (!post) return;
  lbPostId = postId; lbPhotos = post.photos ?? []; lbIndex = idx;
  showLightboxImage();
  document.getElementById('lightbox').style.display         = 'flex';
  document.getElementById('lightbox-overlay').style.display = 'block';
}
window.openLightbox = openLightbox;

function showLightboxImage() {
  document.getElementById('lightbox-img').src         = lbPhotos[lbIndex];
  document.getElementById('lb-prev').style.visibility = lbIndex > 0 ? 'visible' : 'hidden';
  document.getElementById('lb-next').style.visibility = lbIndex < lbPhotos.length - 1 ? 'visible' : 'hidden';
}

function shiftLightbox(dir) {
  lbIndex = Math.max(0, Math.min(lbPhotos.length - 1, lbIndex + dir));
  showLightboxImage();
}
window.shiftLightbox = shiftLightbox;

function closeLightbox() {
  document.getElementById('lightbox').style.display         = 'none';
  document.getElementById('lightbox-overlay').style.display = 'none';
}
window.closeLightbox = closeLightbox;

document.addEventListener('keydown', e => {
  if (document.getElementById('lightbox').style.display !== 'none') {
    if (e.key === 'ArrowLeft')  shiftLightbox(-1);
    if (e.key === 'ArrowRight') shiftLightbox(1);
    if (e.key === 'Escape')     closeLightbox();
  }
  if (document.getElementById('comment-modal').style.display !== 'none') {
    if (e.key === 'Escape') closeCommentModal();
  }
});

// ── Upload ────────────────────────────────────────────────────────────────────
let selectedFiles = [];

const photoInput  = document.getElementById('photo-input');
const previewGrid = document.getElementById('preview-grid');
const dropZone    = document.getElementById('drop-zone');

photoInput.addEventListener('change', () => {
  addFiles(Array.from(photoInput.files));
  photoInput.value = '';
});

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragging');
  addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
});

function addFiles(files) {
  const toAdd = files.slice(0, 10 - selectedFiles.length);
  selectedFiles = [...selectedFiles, ...toAdd];
  renderPreviews();
}

function renderPreviews() {
  previewGrid.innerHTML = selectedFiles.map((file, i) => {
    const url = URL.createObjectURL(file);
    return `<div class="preview-item">
      <img src="${url}" alt="preview"/>
      <button class="remove-btn" onclick="removeFile(${i})">✕</button>
    </div>`;
  }).join('');
}
window.removeFile = function(idx) { selectedFiles.splice(idx, 1); renderPreviews(); };

// Progress bar UI
function setProgress(label) {
  let bar = document.getElementById('upload-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'upload-progress';
    bar.className = 'upload-progress-wrap';
    bar.innerHTML = `<div class="upload-progress-track"><div class="upload-progress-fill" id="upload-fill"></div></div>
                     <div class="upload-progress-label" id="upload-label"></div>`;
    document.getElementById('submit-btn').insertAdjacentElement('beforebegin', bar);
  }
  bar.style.display = 'block';
  document.getElementById('upload-fill').style.width  = typeof label === 'number' ? label + '%' : '80%';
  document.getElementById('upload-label').textContent = typeof label === 'number' ? `Uploading ${label}%` : label;
}

function hideProgress() {
  const bar = document.getElementById('upload-progress');
  if (bar) bar.style.display = 'none';
}

document.getElementById('upload-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('sender-name').value.trim();
  if (!name)                 { alert('Please enter your name.');           return; }
  if (!selectedFiles.length) { alert('Please select at least one photo.'); return; }

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Uploading to Google Drive...';
  setProgress('Uploading photos to Google Drive...');

  try {
    // Send all files to Flask server → Google Drive
    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('photos', f));

    const res = await fetch(`${UPLOAD_URL}/api/upload`, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Upload failed');
    }
    const { urls } = await res.json();

    setProgress('Saving to database...');

    // Save post metadata to Firestore (data lives in the cloud, photos in Drive)
    await addDoc(postsRef, {
      senderName:     name,
      photos:         urls,
      timestamp:      serverTimestamp(),
      likeCount:      0,
      likes:          [],
      commentCount:   0,
      recentComments: [],
    });

    hideProgress();
    document.getElementById('upload-form').style.display    = 'none';
    document.getElementById('upload-success').style.display = 'block';

  } catch (err) {
    console.error(err);
    hideProgress();
    alert('Upload failed: ' + err.message);
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Upload';
  }
});

function resetUpload() {
  selectedFiles = [];
  renderPreviews();
  document.getElementById('upload-form').reset();
  document.getElementById('upload-form').style.display    = 'block';
  document.getElementById('upload-success').style.display = 'none';
  document.getElementById('submit-btn').disabled          = false;
  document.getElementById('submit-btn').textContent       = 'Upload';
}
window.resetUpload = resetUpload;

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  document.getElementById('top-photos').innerHTML  = `<div class="loading-spinner"><div class="spinner"></div></div>`;
  document.getElementById('top-senders').innerHTML = '';

  try {
    const snap  = await getDocs(postsRef);
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const topPosts = [...posts]
      .sort((a,b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
      .slice(0, 10);

    const senderMap = {};
    for (const p of posts) {
      senderMap[p.senderName] = (senderMap[p.senderName] ?? 0) + (p.likeCount ?? 0);
    }
    const topSenders = Object.entries(senderMap)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, likes]) => ({ name, likes }));

    renderLeaderboard({ topPosts, topSenders });
  } catch(e) {
    document.getElementById('top-photos').innerHTML = '<p style="color:#aaa">Unable to load data.</p>';
  }
}

function renderLeaderboard({ topPosts, topSenders }) {
  const photosEl  = document.getElementById('top-photos');
  const sendersEl = document.getElementById('top-senders');

  photosEl.innerHTML = topPosts.length
    ? topPosts.map((p, i) => `
        <div class="lb-photo-item" onclick="openPostInFeed('${p.id}')">
          <img src="${escHtml(p.photos?.[0] ?? '')}" loading="lazy"/>
          <div class="lb-photo-rank">#${i+1}</div>
          <div class="lb-photo-info">
            <div class="lb-photo-name">${escHtml(p.senderName)}</div>
            <div class="lb-photo-likes">❤️ ${p.likeCount ?? 0}</div>
          </div>
        </div>`).join('')
    : '<p style="color:#aaa;padding:20px;text-align:center">No photos yet</p>';

  sendersEl.innerHTML = topSenders.length
    ? topSenders.map((s, i) => `
        <div class="lb-sender-item">
          <div class="lb-rank-badge rank-${i+1}">${i+1}</div>
          <div class="lb-sender-name">${escHtml(s.name)}</div>
          <div class="lb-sender-likes">❤️ <span>${s.likes}</span> likes</div>
        </div>`).join('')
    : '<p style="color:#aaa;padding:20px;text-align:center">No data yet</p>';
}

function openPostInFeed(postId) {
  switchTab('feed');
  setTimeout(() => {
    document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior:'smooth', block:'center' });
  }, 300);
}
window.openPostInFeed = openPostInFeed;

// ── Start ─────────────────────────────────────────────────────────────────────
startFeed();
