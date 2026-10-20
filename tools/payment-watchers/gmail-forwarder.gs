/**
 * Neram Instant UPI: Gmail watcher (Google Apps Script).
 *
 * Runs every minute in the mailbox that receives the bank's credit alerts
 * (NEFT inward, IMPS, cash deposits; UPI credits come by SMS, not email).
 * For each new mail from the bank it posts the text plus Gmail's own
 * Authentication-Results header (the server reads the DKIM verdict from it)
 * to the marketing site, signed with this watcher's secret, and labels the
 * thread so it is never sent twice. Every run also
 * posts a heartbeat; no heartbeat for a while hides Instant UPI for students.
 *
 * Setup (once, 5 minutes):
 *   1. script.google.com → New project → paste this file.
 *   2. Project Settings → Script Properties:
 *        DEVICE_ID   the watcher id you added in Admin › Settings › Instant UPI (e.g. gmail-script)
 *        SECRET      the same id's secret from the Vercel env PAYMENT_WATCHER_SECRETS (32+ random chars)
 *        ENDPOINT    https://neramclasses.com   (staging: https://staging.neramclasses.com)
 *        BANK_DOMAINS  kvb.bank.in              (comma separated, optional; default below)
 *   3. Run `setup` once and accept the Gmail permission prompt.
 *   4. Triggers → Add → `run`, time-driven, every minute.
 *   5. Admin › Collections › Bank credits should show "Gmail script · just now".
 *
 * Nothing secret is in this file. Rotate by changing SECRET here and in Vercel.
 */

var DEFAULT_BANK_DOMAINS = ['kvb.bank.in'];
var LABEL_DONE = 'neram-processed';
var LABEL_SKIPPED = 'neram-skipped';
var LOOKBACK = '2d';
var MAX_PER_RUN = 20;

function setup() {
  getOrCreateLabel_(LABEL_DONE);
  getOrCreateLabel_(LABEL_SKIPPED);
  heartbeat_();
  Logger.log('Ready. Add a time trigger for run() every minute.');
}

function run() {
  var props = PropertiesService.getScriptProperties();
  var domains = (props.getProperty('BANK_DOMAINS') || DEFAULT_BANK_DOMAINS.join(',')).split(',').map(trim_).filter(Boolean);
  var fromQuery = domains.map(function (d) { return 'from:' + d; }).join(' OR ');
  var query = '(' + fromQuery + ') newer_than:' + LOOKBACK + ' -label:' + LABEL_DONE + ' -label:' + LABEL_SKIPPED;
  var threads = GmailApp.search(query, 0, MAX_PER_RUN);
  var done = getOrCreateLabel_(LABEL_DONE);
  var skipped = getOrCreateLabel_(LABEL_SKIPPED);

  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    var allOk = true;
    var retryLater = false;
    for (var j = 0; j < messages.length; j++) {
      var m = messages[j];
      var from = m.getFrom() || '';
      if (!fromBank_(from, domains)) continue;
      var raw = m.getRawContent() || '';
      var payload = {
        messageId: m.getId(),
        from: from,
        subject: m.getSubject() || '',
        bodyText: (m.getPlainBody() || '').slice(0, 8000),
        internalDate: m.getDate().toISOString(),
        // Gmail's own verdict (the topmost Authentication-Results header). The server
        // decides DKIM from this; nothing computed here is trusted.
        authResults: topAuthResults_(raw),
      };
      var res = post_('/api/payments/ingest/email', payload);
      if (!res.ok) {
        allOk = false;
        Logger.log('post failed for ' + m.getId() + ': ' + res.status + ' ' + res.text);
        if (res.status >= 500 || res.status === 0) retryLater = true;
      }
    }
    // A server error or no answer: leave the thread unlabelled so the next run resends it.
    if (retryLater) continue;
    threads[i].addLabel(allOk ? done : skipped);
  }
  heartbeat_();
}

// ── helpers ──────────────────────────────────────────────────────────────────

function heartbeat_() {
  post_('/api/payments/ingest/heartbeat', { kind: 'email', appVersion: 'gmail-forwarder-2026-10' });
}

/** POST JSON signed with HMAC-SHA256(secret, timestamp.nonce.body). */
function post_(path, body) {
  var props = PropertiesService.getScriptProperties();
  var deviceId = props.getProperty('DEVICE_ID');
  var secret = props.getProperty('SECRET');
  var endpoint = (props.getProperty('ENDPOINT') || '').replace(/\/+$/, '');
  if (!deviceId || !secret || !endpoint) throw new Error('Set DEVICE_ID, SECRET and ENDPOINT in Script Properties.');

  var raw = JSON.stringify(body);
  var timestamp = String(Math.floor(Date.now() / 1000));
  var nonce = Utilities.getUuid();
  var sig = Utilities.computeHmacSha256Signature(timestamp + '.' + nonce + '.' + raw, secret, Utilities.Charset.UTF_8);
  var hex = sig.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');

  var res = UrlFetchApp.fetch(endpoint + path, {
    method: 'post',
    contentType: 'application/json',
    payload: raw,
    muteHttpExceptions: true,
    headers: {
      'x-neram-device': deviceId,
      'x-neram-timestamp': timestamp,
      'x-neram-nonce': nonce,
      'x-neram-signature': hex,
    },
  });
  var status = res.getResponseCode();
  return { ok: status >= 200 && status < 300, status: status, text: res.getContentText().slice(0, 300) };
}

/**
 * The topmost Authentication-Results header, which is the one Gmail itself
 * added (authserv-id mx.google.com). Lower ones, and ARC-Authentication-Results,
 * can be written by anyone along the way, so they are not sent.
 */
function topAuthResults_(raw) {
  var headers = raw.split(/\r?\n\r?\n/)[0] || '';
  var unfolded = headers.replace(/\r?\n[ \t]+/g, ' ');
  var lines = unfolded.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var mm = lines[i].match(/^Authentication-Results:\s*(.*)$/i);
    if (mm) return mm[1].slice(0, 2000);
  }
  return '';
}

function fromBank_(from, domains) {
  var lower = from.toLowerCase();
  for (var i = 0; i < domains.length; i++) if (lower.indexOf('@' + domains[i]) !== -1 || lower.indexOf('.' + domains[i]) !== -1) return true;
  return false;
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function trim_(s) {
  return String(s || '').trim();
}
