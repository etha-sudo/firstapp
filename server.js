const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const dbPath = path.join(__dirname, 'tracker.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL,
    label TEXT,
    destination TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL,
    source TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversions (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL,
    email TEXT,
    timestamp TEXT NOT NULL
  );
`);

app.post('/links', (req, res) => {
  const { slug, label, destination } = req.body ?? {};

  if (typeof slug !== 'string' || slug.trim() === '') {
    return res.status(400).json({ error: 'slug is required' });
  }
  if (typeof destination !== 'string' || destination.trim() === '') {
    return res.status(400).json({ error: 'destination is required' });
  }
  if (label != null && typeof label !== 'string') {
    return res.status(400).json({ error: 'label must be a string' });
  }

  const createdAt = new Date().toISOString();
  const stmt = db.prepare(
    'INSERT INTO links (slug, label, destination, created_at) VALUES (?, ?, ?, ?)'
  );
  const info = stmt.run(slug.trim(), label ?? null, destination.trim(), createdAt);

  const created = db
    .prepare('SELECT id, slug, label, destination, created_at FROM links WHERE id = ?')
    .get(info.lastInsertRowid);

  return res.status(201).json(created);
});

app.get('/links', (_req, res) => {
  const links = db
    .prepare('SELECT id, slug, label, destination, created_at FROM links ORDER BY id DESC')
    .all();
  res.json(links);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/dashboard', (_req, res) => {
  const links = db
    .prepare('SELECT slug, label FROM links ORDER BY id DESC')
    .all();

  const clicksBySlug = new Map(
    db.prepare('SELECT slug, COUNT(*) AS clicks FROM clicks GROUP BY slug').all().map((r) => [
      r.slug,
      r.clicks,
    ])
  );
  const conversionsBySlug = new Map(
    db
      .prepare('SELECT slug, COUNT(*) AS conversions FROM conversions GROUP BY slug')
      .all()
      .map((r) => [r.slug, r.conversions])
  );

  const rows = links.map((l) => {
    const clicks = Number(clicksBySlug.get(l.slug) ?? 0);
    const conversions = Number(conversionsBySlug.get(l.slug) ?? 0);
    const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;

    return {
      slug: l.slug,
      label: l.label,
      clicks,
      conversions,
      conversion_rate: conversionRate,
    };
  });

  res.json(rows);
});

app.post('/conversion', (req, res) => {
  const { slug, email } = req.body ?? {};

  if (typeof slug !== 'string' || slug.trim() === '') {
    return res.status(400).json({ error: 'slug is required' });
  }
  if (email != null && typeof email !== 'string') {
    return res.status(400).json({ error: 'email must be a string' });
  }

  const timestamp = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO conversions (slug, email, timestamp) VALUES (?, ?, ?)')
    .run(slug.trim(), email ?? null, timestamp);

  const created = db
    .prepare('SELECT id, slug, email, timestamp FROM conversions WHERE id = ?')
    .get(info.lastInsertRowid);

  return res.status(201).json(created);
});

app.get('/:slug', (req, res) => {
  const { slug } = req.params;

  const link = db
    .prepare('SELECT destination FROM links WHERE slug = ?')
    .get(slug);

  if (!link) {
    return res.status(404).json({ error: 'not found' });
  }

  const clickStmt = db.prepare('INSERT INTO clicks (slug, source, timestamp) VALUES (?, ?, ?)');
  const timestamp = new Date().toISOString();
  const source = req.get('referer') ?? null;
  clickStmt.run(slug, source, timestamp);

  let destination = link.destination;
  try {
    const url = new URL(destination);
    url.searchParams.set('ref', slug);
    destination = url.toString();
  } catch {
    // If destination isn't an absolute URL, fall back to original.
  }

  return res.redirect(destination);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

