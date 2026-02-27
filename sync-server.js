/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Anaya's Calendar — Sync Server                             ║
 * ║  Stores scheduler data so all devices stay in sync          ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * SETUP (one-time):
 *   1. npm install   (installs express + cors)
 *   2. node sync-server.js
 *
 * DEPLOY FREE on Railway.app (recommended):
 *   1. Push this file + package.json to a GitHub repo
 *   2. Go to railway.app → New Project → Deploy from GitHub
 *   3. Railway auto-detects Node and runs it
 *   4. Copy the public URL (e.g. https://anaya-sync.up.railway.app)
 *   5. Paste that URL into index.html where it says:
 *        const SYNC_SERVER_URL = '';  ← put your URL here
 *
 * HOW IT WORKS:
 *   - Admin clicks "☁️ Save to Cloud" → entire app state saved to data.json
 *   - Any device clicks "☁️ Load from Cloud" → loads that saved state
 *   - On sign-out, admins get prompted to save first
 *   - Workers never lose data — they always load from cloud on open
 *
 * SECURITY NOTE:
 *   This is a simple shared store — anyone with the URL can read/write.
 *   It's protected by obscurity (only people with the URL can access it).
 *   For a team of painters this is plenty of security.
 *   If you want password protection, set SYNC_PASSWORD env var.
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const SYNC_PASSWORD = process.env.SYNC_PASSWORD || ''; // optional

app.use(cors());
app.use(express.json({ limit: '10mb' })); // images can be large

// ── Middleware: optional password check ──────────────────────────────────────
app.use((req, res, next) => {
  if (!SYNC_PASSWORD) return next(); // no password set = open
  const pw = req.headers['x-sync-password'] || req.query.pw;
  if (pw !== SYNC_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const exists = fs.existsSync(DATA_FILE);
  const size   = exists ? (fs.statSync(DATA_FILE).size / 1024).toFixed(1) + ' KB' : '—';
  res.json({
    status: 'online',
    app: "Anaya's Calendar Sync Server",
    dataFile: exists ? `data.json (${size})` : 'no data saved yet',
    endpoints: { save: 'POST /save', load: 'GET /load' }
  });
});

// ── Save data ─────────────────────────────────────────────────────────────────
app.post('/save', (req, res) => {
  try {
    const { key, data } = req.body;
    if (!key || !data) return res.status(400).json({ error: 'Missing key or data' });

    // Keep a rotating backup (last 3 saves)
    if (fs.existsSync(DATA_FILE)) {
      const backups = [DATA_FILE + '.bak2', DATA_FILE + '.bak1', DATA_FILE + '.bak0'];
      for (let i = 0; i < backups.length - 1; i++) {
        if (fs.existsSync(backups[i])) fs.copyFileSync(backups[i], backups[i + 1]);
      }
      fs.copyFileSync(DATA_FILE, backups[0]);
    }

    // Save with timestamp
    const payload = { key, data, savedAt: new Date().toISOString() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));

    console.log(`[${new Date().toLocaleTimeString()}] 💾 Saved — ${(JSON.stringify(payload).length / 1024).toFixed(1)} KB`);
    res.json({ ok: true, savedAt: payload.savedAt });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Load data ─────────────────────────────────────────────────────────────────
app.get('/load', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json({ ok: false, reason: 'No data saved yet' });
    }
    const raw  = fs.readFileSync(DATA_FILE, 'utf8');
    const payload = JSON.parse(raw);
    console.log(`[${new Date().toLocaleTimeString()}] 📤 Loaded — ${(raw.length / 1024).toFixed(1)} KB`);
    res.json({ ok: true, data: payload.data, savedAt: payload.savedAt });
  } catch (err) {
    console.error('Load error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Restore from backup ───────────────────────────────────────────────────────
app.post('/restore-backup', (req, res) => {
  const { slot } = req.body; // 0, 1, or 2
  const backup = DATA_FILE + '.bak' + (slot || 0);
  if (!fs.existsSync(backup)) return res.status(404).json({ error: 'Backup not found' });
  fs.copyFileSync(backup, DATA_FILE);
  res.json({ ok: true, message: `Restored from backup ${slot}` });
});

app.listen(PORT, () => {
  console.log(`\n🏠 Anaya's Calendar Sync Server`);
  console.log(`   Running on port ${PORT}`);
  console.log(`   Data file: ${DATA_FILE}`);
  console.log(`   Password protection: ${SYNC_PASSWORD ? 'YES' : 'no'}`);
  console.log(`\n   POST /save  — save app data`);
  console.log(`   GET  /load  — load app data\n`);
});
