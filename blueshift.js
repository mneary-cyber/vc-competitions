'use strict';

const fetch = require('node-fetch');

const BASE_URL = 'https://api.getblueshift.com/api/v1';

function authHeader() {
  const token = Buffer.from(`${process.env.BLUESHIFT_API_KEY}:`).toString('base64');
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

async function bsPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Blueshift ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function bsGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeader() });
  const text = await res.text();
  if (!res.ok) throw new Error(`Blueshift GET ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

// Cache list IDs in memory for the lifetime of the process
const listIdCache = {};

async function getOrCreateList(competitionId, competitionTitle) {
  if (listIdCache[competitionId]) return listIdCache[competitionId];

  // Fetch all lists and look for an existing one
  const data = await bsGet('/user_lists');
  const lists = data.user_lists || [];
  const listName = `Competition: ${competitionTitle}`;
  const existing = lists.find(l => l.name === listName);

  if (existing) {
    listIdCache[competitionId] = existing.id;
    return existing.id;
  }

  // Create a new list
  const created = await bsPost('/user_lists', { user_list: { name: listName } });
  const id = created.user_list?.id || created.id;
  listIdCache[competitionId] = id;
  console.log(`[Blueshift] Created list "${listName}" (id: ${id})`);
  return id;
}

async function syncEntry({ competitionId, competitionTitle, email, firstname, source, utmSource, utmMedium, utmCampaign }) {
  // 1. Create / update customer profile
  await bsPost('/customers', {
    email,
    firstname: firstname || undefined,
  });

  // 2. Add to competition list
  const listId = await getOrCreateList(competitionId, competitionTitle);
  await bsPost(`/user_lists/${listId}/add`, { emails: [email] });

  // 3. Fire competition_entry event
  await bsPost('/event', {
    event: 'competition_entry',
    email,
    properties: {
      competition_id: competitionId,
      competition_title: competitionTitle,
      source: source || 'direct',
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      entry_date: new Date().toISOString(),
    },
  });
}

module.exports = { syncEntry };
