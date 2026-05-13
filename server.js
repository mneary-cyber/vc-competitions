'use strict';

require('dotenv').config();

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const rateLimit  = require('express-rate-limit');
const { insertEntry, getEntryCount } = require('./db');
const { syncEntry } = require('./blueshift');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limit entries: 5 submissions per IP per 15 minutes
const entryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

function loadCompetition(slug) {
  const file = path.join(__dirname, 'competitions', `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function renderTemplate(templateName, vars) {
  let html = fs.readFileSync(path.join(__dirname, 'views', templateName), 'utf8');
  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, val ?? '');
  }
  return html;
}

// Competition page
app.get('/c/:slug', (req, res) => {
  const comp = loadCompetition(req.params.slug);
  if (!comp) return res.status(404).send('Competition not found.');

  const now = new Date();
  const end = new Date(comp.end_date);
  if (now > end) {
    return res.send(renderTemplate('closed.html', { title: comp.title, prize: comp.prize, brand_color: comp.brand_color || '#E4002B' }));
  }

  const count = getEntryCount(req.params.slug);
  res.send(renderTemplate('competition.html', {
    slug: req.params.slug,
    title: comp.title,
    subtitle: comp.subtitle || '',
    prize: comp.prize,
    prize_image: comp.prize_image || '',
    end_date: new Date(comp.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    terms_url: comp.terms_url || '#',
    brand_color: comp.brand_color || '#E4002B',
    entry_count: count,
  }));
});

// Entry submission
app.post('/c/:slug/enter', entryLimiter, async (req, res) => {
  const comp = loadCompetition(req.params.slug);
  if (!comp) return res.status(404).json({ error: 'Competition not found.' });

  const now = new Date();
  if (now > new Date(comp.end_date)) return res.status(400).json({ error: 'Competition has closed.' });

  const email     = (req.body.email || '').trim().toLowerCase();
  const firstname = (req.body.firstname || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const utmSource   = req.body.utm_source   || req.query.utm_source   || null;
  const utmMedium   = req.body.utm_medium   || req.query.utm_medium   || null;
  const utmCampaign = req.body.utm_campaign || req.query.utm_campaign || null;
  const ip          = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  const saved = insertEntry({ competition: req.params.slug, email, firstname, utmSource, utmMedium, utmCampaign, ip });

  if (!saved) {
    // Already entered — still show thank you, just don't re-sync to Blueshift
    return res.json({ ok: true, duplicate: true });
  }

  // Sync to Blueshift in the background — don't block the response
  syncEntry({
    competitionId: req.params.slug,
    competitionTitle: comp.title,
    email,
    firstname,
    utmSource,
    utmMedium,
    utmCampaign,
  }).catch(err => console.error('[Blueshift] sync failed:', err.message));

  res.json({ ok: true });
});

// Health check for Render
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Admin: entry count (basic — no auth, for internal use only)
app.get('/admin/:slug/entries', (req, res) => {
  const { getAllEntries } = require('./db');
  const comp = loadCompetition(req.params.slug);
  if (!comp) return res.status(404).json({ error: 'Not found' });
  res.json({ competition: comp.title, entries: getAllEntries(req.params.slug) });
});

app.listen(PORT, () => console.log(`VC Competitions running on http://localhost:${PORT}`));
