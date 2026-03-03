/**
 * Anaya's Calendar — Sync Server
 *
 * ONLY THING YOU NEED TO DO ON RAILWAY:
 *   1. Go to your service → "Volumes" tab
 *   2. Click "Add Volume", set mount path to: /data
 *   3. Railway will redeploy automatically
 *
 * That's it. This makes data survive restarts/redeploys.
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Use /data (Railway persistent volume) if available, otherwise local
const DATA_DIR  = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'anaya-calendar.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  const exists = fs.existsSync(DATA_FILE);
  const size   = exists ? (fs.statSync(DATA_FILE).size / 1024).toFixed(1) + ' KB' : 'empty';
  res.json({
    status: 'online',
    app: "Anaya's Calendar Sync Server",
    dataFile: exists ? `anaya-calendar.json (${size})` : 'no data saved yet',
    persistent: fs.existsSync('/data'),
    endpoints: { save: 'POST /save', load: 'GET /load' }
  });
});

// Save
app.post('/save', (req, res) => {
  try {
    const { key, data } = req.body;
    if (!key || !data) return res.status(400).json({ error: 'Missing key or data' });
    // Rolling backups
    if (fs.existsSync(DATA_FILE)) {
      try {
        if (fs.existsSync(DATA_FILE + '.bak1')) fs.copyFileSync(DATA_FILE + '.bak1', DATA_FILE + '.bak2');
        if (fs.existsSync(DATA_FILE + '.bak0')) fs.copyFileSync(DATA_FILE + '.bak0', DATA_FILE + '.bak1');
        fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak0');
      } catch(e) {}
    }
    const payload = { key, data, savedAt: new Date().toISOString() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload));
    console.log(`[${new Date().toLocaleTimeString()}] Saved — ${(JSON.stringify(payload).length/1024).toFixed(1)} KB`);
    res.json({ ok: true, savedAt: payload.savedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Load
app.get('/load', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) return res.json({ ok: false, reason: 'No data saved yet' });
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const payload = JSON.parse(raw);
    console.log(`[${new Date().toLocaleTimeString()}] Loaded — ${(raw.length/1024).toFixed(1)} KB`);
    res.json({ ok: true, data: payload.data, savedAt: payload.savedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Anaya Calendar Sync Server running on port ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
  console.log(`Persistent volume: ${fs.existsSync('/data') ? 'YES (/data)' : 'NO - add a volume on Railway!'}`);
});
