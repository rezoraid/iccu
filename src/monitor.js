'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LOG = 200;
const DATA_DIR = path.join(__dirname, '..', 'data');
const BLOCKLIST_FILE = path.join(DATA_DIR, 'blocklist.json');

function loadBlockedIps() {
  try {
    const raw = fs.readFileSync(BLOCKLIST_FILE, 'utf8');
    return new Set(JSON.parse(raw));
  } catch (err) {
    return new Set();
  }
}

function saveBlockedIps() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BLOCKLIST_FILE, JSON.stringify([...state.blockedIps], null, 2));
  } catch (err) {
    console.error('[monitor] failed to persist blocklist:', err.message);
  }
}

const state = {
  blockedIps: loadBlockedIps(),
  log: [],
  totals: new Map(),
  perIp: new Map()
};

function recordRequest({ ip, method, path, status, ms }) {
  const entry = { ip, method, path, status, ms, at: new Date().toISOString() };
  state.log.push(entry);
  if (state.log.length > MAX_LOG) state.log.shift();

  state.totals.set(path, (state.totals.get(path) || 0) + 1);
  state.perIp.set(ip, (state.perIp.get(ip) || 0) + 1);
}

function isBlocked(ip) {
  return state.blockedIps.has(ip);
}

function blockIp(ip) {
  state.blockedIps.add(ip);
  saveBlockedIps();
}

function unblockIp(ip) {
  const removed = state.blockedIps.delete(ip);
  if (removed) saveBlockedIps();
  return removed;
}

function listBlocked() {
  return [...state.blockedIps];
}

function recentLog(limit = 20) {
  return state.log.slice(-limit).reverse();
}

function topEndpoints(limit = 10) {
  return [...state.totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([path, count]) => ({ path, count }));
}

function topIps(limit = 10) {
  return [...state.perIp.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([ip, count]) => ({ ip, count, blocked: isBlocked(ip) }));
}

function totalRequests() {
  return state.log.length ? [...state.totals.values()].reduce((a, b) => a + b, 0) : 0;
}

module.exports = {
  recordRequest,
  isBlocked,
  blockIp,
  unblockIp,
  listBlocked,
  recentLog,
  topEndpoints,
  topIps,
  totalRequests
};
