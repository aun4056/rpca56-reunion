require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1rKBETjUB8N__6kTBKZa-cwOCVDcBKmYP';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database helpers ──────────────────────────────────────────────────────────

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { posts: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Google Drive ──────────────────────────────────────────────────────────────

function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !key) return null;

  const auth = new google.auth.JWT(email, null, key, [
    'https://www.googleapis.com/auth/drive.file',
  ]);
  return google.drive({ version: 'v3', auth });
}

async function uploadToDrive(drive, filePath, fileName, mimeType) {
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
    fields: 'id',
  });

  const fileId = res.data.id;

  // Make publicly viewable
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return fileId;
}

// ── Multer (temp upload storage) ──────────────────────────────────────────────

const upload = multer({
  dest: path.join(__dirname, 'tmp'),
  limits: { files: 10, fileSize: 20 * 1024 * 1024 }, // 10 files, 20MB each
  fileFilter(_, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ── API Routes ────────────────────────────────────────────────────────────────

// GET /api/posts  — all posts newest first
app.get('/api/posts', (req, res) => {
  const db = readDB();
  const sorted = [...db.posts].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  res.json(sorted);
});

// POST /api/posts  — upload photos and create post
app.post('/api/posts', upload.array('photos', 10), async (req, res) => {
  const { senderName } = req.body;
  if (!senderName || !senderName.trim()) {
    return res.status(400).json({ error: 'Sender name is required' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'At least one photo is required' });
  }

  const drive = getDriveClient();
  const photoIds = [];

  try {
    for (const file of req.files) {
      if (drive) {
        const driveId = await uploadToDrive(
          drive,
          file.path,
          `${Date.now()}_${file.originalname}`,
          file.mimetype
        );
        photoIds.push({ type: 'drive', id: driveId });
      } else {
        // Fallback: keep file locally (for testing without Drive credentials)
        const localName = `${uuidv4()}${path.extname(file.originalname)}`;
        const destDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(file.path, path.join(destDir, localName));
        photoIds.push({ type: 'local', id: localName });
        continue;
      }
      fs.unlinkSync(file.path);
    }
  } catch (err) {
    // Clean up tmp files on error
    req.files.forEach((f) => { try { fs.unlinkSync(f.path); } catch {} });
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Failed to upload photos' });
  }

  const post = {
    id: uuidv4(),
    senderName: senderName.trim(),
    photos: photoIds,
    timestamp: new Date().toISOString(),
    likes: [],
    comments: [],
  };

  const db = readDB();
  db.posts.push(post);
  writeDB(db);

  res.json(post);
});

// POST /api/posts/:id/like  — toggle like
app.post('/api/posts/:id/like', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const db = readDB();
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const idx = post.likes.indexOf(sessionId);
  if (idx === -1) post.likes.push(sessionId);
  else post.likes.splice(idx, 1);

  writeDB(db);
  res.json({ likes: post.likes.length, liked: idx === -1 });
});

// POST /api/posts/:id/comment  — add comment
app.post('/api/posts/:id/comment', (req, res) => {
  const { author, text } = req.body;
  if (!author || !text)
    return res.status(400).json({ error: 'author and text are required' });

  const db = readDB();
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const comment = {
    id: uuidv4(),
    author: author.trim(),
    text: text.trim(),
    timestamp: new Date().toISOString(),
  };
  post.comments.push(comment);
  writeDB(db);
  res.json(comment);
});

// GET /api/leaderboard  — top 10 posts and top senders
app.get('/api/leaderboard', (req, res) => {
  const db = readDB();

  const topPosts = [...db.posts]
    .sort((a, b) => b.likes.length - a.likes.length)
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      senderName: p.senderName,
      photo: p.photos[0],
      likes: p.likes.length,
      timestamp: p.timestamp,
    }));

  const senderMap = {};
  for (const post of db.posts) {
    const name = post.senderName;
    if (!senderMap[name]) senderMap[name] = 0;
    senderMap[name] += post.likes.length;
  }
  const topSenders = Object.entries(senderMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, likes]) => ({ name, likes }));

  res.json({ topPosts, topSenders });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`RPCA56 Reunion App running at http://localhost:${PORT}`);
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.warn('⚠  No Google credentials found — photos will be stored locally. See SETUP.md.');
  }
});
