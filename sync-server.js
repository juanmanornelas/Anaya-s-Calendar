/**
 * Anaya's Calendar — Sync Server v2
 * 
 * IMPORTANT: In Railway, add a Volume mounted at /app/data
 * This ensures your data survives server restarts and redeploys.
 * 
 * Setup:
 *   1. Deploy this to Railway (already done!)
 *   2. In Railway: your service → + Add Volume → mount path: /app/data
 *   3. Copy your public URL into index.html: const SYNC_SERVER_URL = 'https://...'
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Use /app/data if it exists (Railway Volume), otherwise local folder
const DATA_DIR  = fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BAK0      = DATA_FILE + '.bak0';
const BAK1      = DATA_FILE + '.bak1';
const BAK2      = DATA_FILE + '.bak2';

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const exists = fs.existsSync(DATA_FILE);
  let info = { status: 'online', dataFile: 'no data yet', savedAt: null };
  if (exists) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const p   = JSON.parse(raw);
      const kb  = (raw.length / 1024).toFixed(1);
      info.dataFile = `data.json (${kb} KB)`;
      info.savedAt  = p.savedAt || null;
    } catch(e) { info.dataFile = 'exists but unreadable'; }
  }
  res.json(info);
});

// ── Save ──────────────────────────────────────────────────────────────────────
app.post('/save', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });

    // Rolling backups: bak1→bak2, bak0→bak1, current→bak0
    if (fs.existsSync(BAK1)) fs.copyFileSync(BAK1, BAK2);
    if (fs.existsSync(BAK0)) fs.copyFileSync(BAK0, BAK1);
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BAK0);

    const payload = { data, savedAt: new Date().toISOString() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload));

    const kb = (JSON.stringify(payload).length / 1024).toFixed(1);
    console.log(`[SAVE] ${payload.savedAt} — ${kb} KB`);
    res.json({ ok: true, savedAt: payload.savedAt });
  } catch(err) {
    console.error('Save error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Load ──────────────────────────────────────────────────────────────────────
app.get('/load', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json({ ok: false, reason: 'No data saved yet' });
    }
    const raw     = fs.readFileSync(DATA_FILE, 'utf8');
    const payload = JSON.parse(raw);
    const kb      = (raw.length / 1024).toFixed(1);
    console.log(`[LOAD] ${new Date().toISOString()} — ${kb} KB`);
    res.json({ ok: true, data: payload.data, savedAt: payload.savedAt });
  } catch(err) {
    console.error('Load error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🏠  Anaya's Calendar Sync Server`);
  console.log(`    Port     : ${PORT}`);
  console.log(`    Data dir : ${DATA_DIR}`);
  console.log(`    Data file: ${DATA_FILE}\n`);
});
