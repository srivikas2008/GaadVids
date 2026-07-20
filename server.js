const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const THUMBS_DIR = path.join(__dirname, 'thumbnails');
const DATA_FILE = path.join(__dirname, 'data', 'db.json');

for (const dir of [UPLOADS_DIR, THUMBS_DIR, path.join(__dirname, 'data')]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = { videos: [], nextId: 1 };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.webm', '.mov', '.mkv', '.avi'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Landing video — served from public/landing/
app.use('/landing', express.static(path.join(__dirname, 'public', 'landing')));

// ── API Routes ──

app.get('/api/videos', (req, res) => {
  res.json(readDB().videos);
});

app.get('/api/videos/:id', (req, res) => {
  const video = readDB().videos.find(v => v.id === parseInt(req.params.id));
  if (!video) return res.status(404).json({ error: 'Not found' });
  res.json(video);
});

app.post('/api/videos/:id/view', (req, res) => {
  const db = readDB();
  const video = db.videos.find(v => v.id === parseInt(req.params.id));
  if (!video) return res.status(404).json({ error: 'Not found' });
  video.views = (video.views || 0) + 1;
  writeDB(db);
  res.json({ views: video.views });
});

app.post('/api/videos/:id/rate', (req, res) => {
  const { rating, userId } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
  const db = readDB();
  const video = db.videos.find(v => v.id === parseInt(req.params.id));
  if (!video) return res.status(404).json({ error: 'Not found' });
  if (!video.ratings) video.ratings = {};
  if (!video.userRatings) video.userRatings = {};
  const prev = video.userRatings[userId];
  if (prev) video.ratings[prev] = Math.max(0, (video.ratings[prev] || 0) - 1);
  video.ratings[rating] = (video.ratings[rating] || 0) + 1;
  video.userRatings[userId] = rating;
  writeDB(db);
  res.json({ ratings: video.ratings });
});

app.post('/api/upload', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file' });
  const { title, creator, description, genre, genre2, tags } = req.body;
  if (!title || !creator) return res.status(400).json({ error: 'Title and creator required' });

  const videoFilename = req.file.filename;
  const thumbFilename = videoFilename.replace(/\.[^.]+$/, '.jpg');
  const thumbPath = path.join(THUMBS_DIR, thumbFilename);

  try {
    await sharp({
      create: { width: 640, height: 360, channels: 3, background: { r: 20, g: 20, b: 26 } }
    })
    .composite([{
      input: Buffer.from(
        `<svg width="640" height="360"><rect width="640" height="360" fill="#14141a"/>` +
        `<text x="320" y="170" font-family="sans-serif" font-size="24" fill="#e5383b" text-anchor="middle" font-weight="bold">GaadVids</text>` +
        `<text x="320" y="205" font-family="sans-serif" font-size="16" fill="#8a8690" text-anchor="middle">${title.substring(0, 35)}</text></svg>`
      ),
      top: 0, left: 0
    }])
    .jpeg({ quality: 80 })
    .toFile(thumbPath);
  } catch (e) { console.log('Thumb gen skipped:', e.message); }

  const db = readDB();
  const genres = [genre || 'Other'];
  if (genre2) genres.push(genre2);

  const newVideo = {
    id: db.nextId++,
    title,
    creator,
    description: description || 'No description provided.',
    genres,
    tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    year: new Date().getFullYear(),
    duration: '—',
    type: 'Movies',
    badge: 'NEW',
    match: 85 + Math.floor(Math.random() * 15),
    videoUrl: `/uploads/${videoFilename}`,
    thumbUrl: `/thumbnails/${thumbFilename}`,
    views: 0,
    ratings: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    userRatings: {},
    isUpload: true,
    createdAt: new Date().toISOString()
  };

  db.videos.unshift(newVideo);
  writeDB(db);
  res.json(newVideo);
});

app.post('/api/upload/thumb', upload.single('thumbnail'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ thumbUrl: `/thumbnails/${req.file.filename}` });
});

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/thumbnails', express.static(THUMBS_DIR));

app.listen(PORT, () => {
  console.log(`\n  GaadVids running at http://localhost:${PORT}\n`);
});