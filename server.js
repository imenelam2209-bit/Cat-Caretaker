const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'replace-this-secret-in-production';
const PORT = process.env.PORT || 3000;

// ── Database (PostgreSQL) ─────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT   UNIQUE NOT NULL,
      password_hash TEXT   NOT NULL,
      created_at    BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );

    CREATE TABLE IF NOT EXISTS settings (
      id          SERIAL  PRIMARY KEY,
      user_id     INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cat_name    TEXT    DEFAULT 'My Cat',
      litter_type TEXT    DEFAULT 'clumping',
      num_cats    INTEGER DEFAULT 1,
      litter_on   BOOLEAN DEFAULT TRUE,
      food_on     BOOLEAN DEFAULT TRUE,
      water_on    BOOLEAN DEFAULT TRUE,
      food_h      INTEGER DEFAULT 8,
      water_h     INTEGER DEFAULT 12
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         SERIAL  PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tracker_id TEXT    NOT NULL,
      logged_at  BIGINT  NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id, tracker_id);
  `);
  console.log('Database ready');
}
initDB().catch(e => { console.error('DB init failed:', e.message); process.exit(1); });

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase().trim(), hash]
    );
    const userId = result.rows[0].id;
    await pool.query('INSERT INTO settings (user_id) VALUES ($1)', [userId]);

    const token = jwt.sign({ id: userId, email: email.toLowerCase().trim() }, JWT_SECRET, { expiresIn: '90d' });
    res.status(201).json({ token });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '90d' });
  res.json({ token });
});

// ── State ─────────────────────────────────────────────────────────────────────
app.get('/api/state', auth, async (req, res) => {
  const sResult = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.id]);
  const s = sResult.rows[0];
  const logsResult = await pool.query(
    'SELECT tracker_id, logged_at FROM logs WHERE user_id = $1 ORDER BY logged_at ASC',
    [req.user.id]
  );

  const grouped = { litter: [], food: [], water: [] };
  logsResult.rows.forEach(r => {
    if (grouped[r.tracker_id]) grouped[r.tracker_id].push({ ts: Number(r.logged_at) });
  });

  res.json({
    name: s.cat_name,
    trackers: {
      litter: { on: s.litter_on, litterType: s.litter_type, numCats: s.num_cats, logs: grouped.litter },
      food:   { on: s.food_on,   h: s.food_h,   logs: grouped.food },
      water:  { on: s.water_on,  h: s.water_h,  logs: grouped.water }
    }
  });
});

// ── Log a tracker event ───────────────────────────────────────────────────────
app.post('/api/log/:tracker', auth, async (req, res) => {
  const { tracker } = req.params;
  if (!['litter', 'food', 'water'].includes(tracker))
    return res.status(400).json({ error: 'Invalid tracker id' });

  const count = await pool.query(
    'SELECT COUNT(*) FROM logs WHERE user_id = $1 AND tracker_id = $2',
    [req.user.id, tracker]
  );
  if (parseInt(count.rows[0].count) >= 200) {
    await pool.query(
      'DELETE FROM logs WHERE id = (SELECT id FROM logs WHERE user_id = $1 AND tracker_id = $2 ORDER BY logged_at ASC LIMIT 1)',
      [req.user.id, tracker]
    );
  }

  await pool.query(
    'INSERT INTO logs (user_id, tracker_id, logged_at) VALUES ($1, $2, $3)',
    [req.user.id, tracker, Date.now()]
  );
  res.json({ ok: true, ts: Date.now() });
});

// ── Update settings ───────────────────────────────────────────────────────────
app.put('/api/settings', auth, async (req, res) => {
  const { catName, litterType, numCats, litterOn, foodOn, waterOn, foodH, waterH } = req.body || {};
  await pool.query(`
    UPDATE settings SET
      cat_name    = COALESCE($1, cat_name),
      litter_type = COALESCE($2, litter_type),
      num_cats    = COALESCE($3, num_cats),
      litter_on   = COALESCE($4, litter_on),
      food_on     = COALESCE($5, food_on),
      water_on    = COALESCE($6, water_on),
      food_h      = COALESCE($7, food_h),
      water_h     = COALESCE($8, water_h)
    WHERE user_id = $9`,
    [catName ?? null, litterType ?? null, numCats ?? null,
     litterOn != null ? litterOn : null,
     foodOn   != null ? foodOn   : null,
     waterOn  != null ? waterOn  : null,
     foodH ?? null, waterH ?? null, req.user.id]
  );
  res.json({ ok: true });
});

// ── Clear logs ────────────────────────────────────────────────────────────────
app.delete('/api/logs', auth, async (req, res) => {
  await pool.query('DELETE FROM logs WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});

// ── Delete account ────────────────────────────────────────────────────────────
app.delete('/api/account', auth, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
  res.json({ ok: true });
});

// ── Serve frontend for all other routes ──────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Cat Care running → http://localhost:${PORT}`));
