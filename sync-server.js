/**
 * Anaya's Calendar — Sync Server (v2)
 * Multi-key storage: each key gets its own slot in the JSON file.
 * GET /load?key=xxx  returns data for that specific key
 * POST /save         { key, data, savedBy } saves under that key
 * GET /keys          lists all stored keys + metadata (admin debug)
 */
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app     = express();
const PORT    = process.env.PORT || 3000;
const DATA_DIR  = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'anaya-calendar.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Helpers ──────────────────────────────────────────────────────────────────

function readStore() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // Migrate: if old format (has top-level .key and .data), wrap it
    if (parsed.key && parsed.data) {
      console.log(`[migrate] Converting old single-key format (key="${parsed.key}") to multi-key store`);
      return { [parsed.key]: { data: parsed.data, savedBy: parsed.savedBy || 'Unknown', savedAt: parsed.savedAt } };
    }
    return parsed;
  } catch(e) {
    console.error('[readStore] Parse error:', e.message);
    return {};
  }
}

function writeStore(store) {
  // Rolling backups before every write
  try {
    if (fs.existsSync(DATA_FILE + '.bak1')) fs.copyFileSync(DATA_FILE + '.bak1', DATA_FILE + '.bak2');
    if (fs.existsSync(DATA_FILE + '.bak0')) fs.copyFileSync(DATA_FILE + '.bak0', DATA_FILE + '.bak1');
    if (fs.existsSync(DATA_FILE))           fs.copyFileSync(DATA_FILE,           DATA_FILE + '.bak0');
  } catch(e) {}
  fs.writeFileSync(DATA_FILE, JSON.stringify(store));
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const store = readStore();
  const keys  = Object.keys(store);
  const size  = fs.existsSync(DATA_FILE) ? (fs.statSync(DATA_FILE).size / 1024).toFixed(1) + ' KB' : 'empty';
  res.json({
    status: 'online',
    app: "Anaya's Calendar Sync Server v2",
    dataFile: `anaya-calendar.json (${size})`,
    persistent: fs.existsSync('/data'),
    storedKeys: keys.map(k => ({
      key: k,
      savedAt: store[k].savedAt,
      savedBy: store[k].savedBy,
    })),
    endpoints: { save: 'POST /save  {key,data,savedBy}', load: 'GET /load?key=xxx', keys: 'GET /keys' }
  });
});

// List all keys (handy for debugging)
app.get('/keys', (req, res) => {
  const store = readStore();
  res.json(Object.entries(store).map(([k, v]) => ({
    key: k,
    savedAt: v.savedAt,
    savedBy: v.savedBy,
    sizeKB: (JSON.stringify(v.data).length / 1024).toFixed(1),
  })));
});

app.post('/save', (req, res) => {
  try {
    const { key, data, savedBy } = req.body;
    if (!key || !data) return res.status(400).json({ error: 'Missing key or data' });

    const store = readStore();
    store[key] = { data, savedBy: savedBy || 'Unknown', savedAt: new Date().toISOString() };
    writeStore(store);

    const sizeKB = (JSON.stringify(data).length / 1024).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] SAVE key="${key}" by ${savedBy || 'Unknown'} — ${sizeKB} KB`);
    res.json({ ok: true, savedAt: store[key].savedAt, savedBy: store[key].savedBy });
  } catch (err) {
    console.error('[save]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/load', (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Missing ?key= param' });

    const store = readStore();
    if (!store[key]) {
      console.log(`[${new Date().toLocaleTimeString()}] LOAD key="${key}" — NOT FOUND (stored: ${Object.keys(store).join(', ') || 'none'})`);
      return res.json({ ok: false, reason: `No data saved for key "${key}"` });
    }

    const entry = store[key];
    const sizeKB = (JSON.stringify(entry.data).length / 1024).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] LOAD key="${key}" savedAt=${entry.savedAt} — ${sizeKB} KB`);
    res.json({ ok: true, data: entry.data, savedAt: entry.savedAt, savedBy: entry.savedBy || 'Unknown' });
  } catch (err) {
    console.error('[load]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Anaya Sync Server v2 running on port ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
  console.log(`Persistent volume: ${fs.existsSync('/data') ? 'YES (/data)' : 'NO — add a volume on Railway!'}`);
  const store = readStore();
  const keys = Object.keys(store);
  if (keys.length > 0) {
    console.log(`Stored keys: ${keys.map(k => `"${k}" (saved ${store[k].savedAt})`).join(', ')}`);
  } else {
    console.log('No data stored yet.');
  }
});
