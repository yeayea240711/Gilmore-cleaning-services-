/**
 * Gilmore Cleaning Services: booking backend on Google Sheets.
 *
 * Setup (once):
 *  1. Create a new Google Sheet named "Gilmore Bookings".
 *  2. In the Sheet: Extensions > Apps Script. Delete what's there, paste this whole file, and save.
 *  3. Change OWNER_PASSCODE below to a passcode only you know. You'll type it on the owner page.
 *  4. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 *  5. Allow the permissions Google asks for, then copy the Web app URL into config.js (googleScriptUrl).
 *
 * Every booking, reschedule and cancel is emailed to OWNER_EMAIL
 * (left blank, that's the Google account that deployed this script).
 *
 * Deposits (optional): fill in STRIPE_PAYMENT_LINK and STRIPE_SECRET_KEY below, then pick
 * setupDeposits in the function menu at the top and press Run once (see README).
 * Left blank, bookings work as before with no deposit.
 */

const OWNER_PASSCODE = 'change-me';
const OWNER_EMAIL = '';
const BUSINESS_NAME = 'Gilmore Cleaning Services';

// ----- deposits (Stripe) -----
const STRIPE_PAYMENT_LINK = '';   // your Stripe Payment Link, like https://buy.stripe.com/abc123
const STRIPE_SECRET_KEY = '';     // a Stripe restricted key (rk_live_...) that can read Checkout Sessions
const DEPOSIT_AMOUNT = 20;        // dollars, must match the Payment Link's price
const DEPOSIT_REFUND_EARLY = true; // true: refund when a customer cancels more than DEPOSIT_KEEP_HOURS ahead
const DEPOSIT_KEEP_HOURS = 24;    // cancelling closer than this keeps the deposit
const DEPOSIT_HOLD_MIN = 30;      // an unpaid booking gives its time back after this many minutes

const SHEET_NAME = 'Appointments';
const COLS = ['When', 'Service', 'Option', 'Customer', 'Phone', 'Address', 'Notes', 'Price', 'Status',
  'Email', 'Add-ons', 'Frequency', 'Quote visit', 'Ref', 'start_at', 'end_at', 'service_key', 'option_id', 'Booked at', 'Updated at', 'Deposit'];
const MAX_MS = 6 * 3600 * 1000;

// ---------- web entry points ----------
function doGet(e) {
  return json_({ data: { ok: true, name: BUSINESS_NAME } });
}

// Run this once from the Apps Script editor after filling in the Stripe settings.
// It asks Google for permission, checks the Stripe key, and starts a check every 10 minutes.
function setupDeposits() {
  sheet_().getRange(1, COLS.length).setValue(COLS[COLS.length - 1]).setFontWeight('bold');
  if (!depositsOn_()) throw new Error('Fill in STRIPE_PAYMENT_LINK and STRIPE_SECRET_KEY first.');
  stripeSessions_(Date.now() - 3600 * 1000);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sweepDeposits').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sweepDeposits').timeBased().everyMinutes(10).create();
  Logger.log('Deposits are on. Stripe key works.');
}

function sweepDeposits() {
  withLock_(sweep_);
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: { message: 'Bad request.' } }); }
  try {
    const fn = ACTIONS[body.action];
    if (!fn) return json_({ error: { message: 'Unknown action.' } });
    return json_({ data: fn(body) });
  } catch (err) {
    return json_({ error: { code: err.code || null, message: err.message || String(err) } });
  }
}

const ACTIONS = {
  settings: () => ({
    deposit: depositsOn_() ? DEPOSIT_AMOUNT : 0, pay_link: depositsOn_() ? STRIPE_PAYMENT_LINK : '',
    refund_early: DEPOSIT_REFUND_EARLY, keep_hours: DEPOSIT_KEEP_HOURS, hold_min: DEPOSIT_HOLD_MIN
  }),

  busy: b => {
    const from = Date.parse(b.from), to = Date.parse(b.to);
    return readAll_().filter(r => r.status === 'booked' && r.start < to && r.end > from)
      .map(r => ({ start_at: iso_(r.start), end_at: iso_(r.end) }));
  },

  book: b => withLock_(() => {
    const p = b.p || {};
    const start = Date.parse(p.start_at), end = Date.parse(p.end_at);
    if (!(start > Date.now())) throw err_('That time has already passed.');
    if (!(end > start) || end - start > MAX_MS) throw err_('Invalid appointment length.');
    if (digits_(p.customer_phone).length < 10) throw err_('A 10-digit phone number is required.');
    if (!clean_(p.customer_name) || !clean_(p.address)) throw err_('Name and address are required.');
    if (overlaps_(start, end, null)) throw err_('That time was just booked.', '23P01');

    const needsDeposit = depositsOn_() && !p.is_quote;
    const ref = 'GCS-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    const now = new Date().toISOString();
    const rec = {
      ref, status: 'booked', start, end,
      service_key: cut_(p.service_key, 40), service: cut_(p.service, 80), option_id: cut_(p.option_id, 40),
      option_label: cut_(p.option_label, 120), addons: (p.addons || []).map(x => cut_(x, 80)).join(', '),
      frequency: cut_(p.frequency || 'once', 20), price_label: cut_(p.price_label, 40), is_quote: !!p.is_quote,
      customer_name: cut_(p.customer_name, 120), customer_phone: cut_(p.customer_phone, 40),
      customer_email: cut_(p.customer_email, 160), address: cut_(p.address, 240), notes: cut_(p.notes, 1000),
      created_at: now, updated_at: now, deposit: needsDeposit ? 'Waiting' : ''
    };
    const sh = sheet_(), row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, COLS.length).setNumberFormat('@').setValues([toRow_(rec)]);
    // With a deposit, you're emailed once it's paid (see sweep_).
    if (!needsDeposit) email_('New booking', rec);
    return ref;
  }),

  lookup: b => {
    const refs = b.refs || [], phone = digits_(b.phone);
    const mine = () => readAll_().filter(r => refs.indexOf(r.ref) >= 0 && digits_(r.customer_phone) === phone);
    let rows = mine();
    // A customer coming back from checkout: check Stripe right away instead of waiting for the 10-minute check.
    if (rows.some(r => r.deposit === 'Waiting')) { withLock_(sweep_); rows = mine(); }
    return rows.map(r => ({ ref: r.ref, status: r.status, deposit: r.deposit, start_at: iso_(r.start), end_at: iso_(r.end) }));
  },

  cancel: b => withLock_(() => {
    let r = findCustomer_(b.ref, b.phone);
    if (r && r.deposit === 'Waiting') { sweep_(); r = findCustomer_(b.ref, b.phone); }
    if (!r || r.status !== 'booked') return false;
    r.status = 'cancelled';
    if (r.deposit === 'Waiting') r.deposit = 'Not paid';
    if (r.deposit === 'Paid') r.deposit = DEPOSIT_REFUND_EARLY && r.start - Date.now() >= DEPOSIT_KEEP_HOURS * 3600000 ? 'Refund due' : 'Kept';
    save_(r);
    // You only hear about a booking once its deposit is paid, so skip the email for unpaid ones.
    if (r.deposit !== 'Not paid') email_('Booking cancelled', r);
    return true;
  }),

  reschedule: b => withLock_(() => {
    const r = findCustomer_(b.ref, b.phone);
    if (!r || r.status !== 'booked') return false;
    const start = Date.parse(b.start), len = r.end - r.start;
    if (!(start > Date.now())) throw err_('That time has already passed.');
    if (overlaps_(start, start + len, r.ref)) throw err_('That time was just booked.', '23P01');
    r.start = start; r.end = start + len; save_(r);
    if (r.deposit !== 'Waiting') email_('Booking moved', r);
    return true;
  }),

  // ----- owner page -----
  owner_check: b => { owner_(b); return true; },

  owner_list: b => {
    owner_(b);
    if (readAll_().some(r => r.deposit === 'Waiting')) withLock_(sweep_);
    const since = Date.parse(b.since) || 0;
    return readAll_().filter(r => r.end >= since).sort((a, c) => a.start - c.start).map(r => ({
      id: r.ref, ref: r.ref, status: r.status, service: r.service, option_label: r.option_label,
      addons: r.addons ? r.addons.split(', ') : [], frequency: r.frequency, price_label: r.price_label,
      is_quote: r.is_quote, start_at: iso_(r.start), end_at: iso_(r.end), customer_name: r.customer_name,
      customer_phone: r.customer_phone, customer_email: r.customer_email, address: r.address, notes: r.notes,
      created_at: r.created_at, deposit: r.deposit
    }));
  },

  owner_status: b => withLock_(() => {
    owner_(b);
    if (['booked', 'completed', 'cancelled'].indexOf(b.status) < 0) throw err_('Unknown status.');
    const r = readAll_().filter(x => x.ref === b.id)[0];
    if (!r) throw err_('Appointment not found.');
    if (b.status === 'booked' && r.status === 'cancelled' && overlaps_(r.start, r.end, r.ref)) throw err_('That time is now booked by someone else.', '23P01');
    r.status = b.status; save_(r);
    return true;
  })
};

// ---------- sheet storage ----------
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME, 0);
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:U').setNumberFormat('@');
  }
  return sh;
}

function readAll_() {
  const sh = sheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, COLS.length).getValues().map((v, i) => ({
    _row: i + 2, ref: String(v[13]), status: String(v[8]), service: String(v[1]), option_label: String(v[2]),
    customer_name: String(v[3]), customer_phone: String(v[4]), address: String(v[5]), notes: String(v[6]),
    price_label: typeof v[7] === 'number' ? '$' + v[7].toFixed(2) : String(v[7]), customer_email: String(v[9]), addons: String(v[10]), frequency: String(v[11]),
    is_quote: String(v[12]) === 'Yes', start: toMs_(v[14]), end: toMs_(v[15]), service_key: String(v[16]),
    option_id: String(v[17]), created_at: String(v[18]), updated_at: String(v[19]), deposit: String(v[20] || '')
  })).filter(r => r.ref);
}

function toRow_(r) {
  return [whenLabel_(r.start, r.end), r.service, r.option_label, r.customer_name, r.customer_phone, r.address, r.notes,
    r.price_label, r.status, r.customer_email, r.addons, r.frequency, r.is_quote ? 'Yes' : 'No', r.ref,
    iso_(r.start), iso_(r.end), r.service_key, r.option_id, r.created_at, r.updated_at, r.deposit || ''];
}

function save_(r) {
  r.updated_at = new Date().toISOString();
  sheet_().getRange(r._row, 1, 1, COLS.length).setNumberFormat('@').setValues([toRow_(r)]);
}

function overlaps_(start, end, ignoreRef) {
  return readAll_().some(r => r.status === 'booked' && r.ref !== ignoreRef && r.start < end && start < r.end);
}

function findCustomer_(ref, phone) {
  return readAll_().filter(r => r.ref === ref && digits_(r.customer_phone) === digits_(phone))[0] || null;
}

// ---------- deposits ----------
function depositsOn_() { return !!(STRIPE_PAYMENT_LINK && STRIPE_SECRET_KEY); }

// Matches Stripe payments to bookings by confirmation code, and frees times that were never paid for.
function sweep_() {
  if (!depositsOn_()) return;
  const now = Date.now(), day = 86400000;
  const open = readAll_().filter(r => r.deposit === 'Waiting' || (r.deposit === 'Expired' && now - Date.parse(r.created_at) < 2 * day));
  if (!open.length) return;
  const paid = {};
  stripeSessions_(now - 3 * day).forEach(s => {
    if (s.payment_status === 'paid' && s.client_reference_id) paid[s.client_reference_id] = true;
  });
  open.forEach(r => {
    if (paid[r.ref]) {
      if (r.status === 'booked') { r.deposit = 'Paid'; save_(r); email_('New booking', r); return; }
      // Paid after the hold ran out: put the booking back if the time is still free.
      if (r.start > now && !overlaps_(r.start, r.end, r.ref)) { r.status = 'booked'; r.deposit = 'Paid'; save_(r); email_('New booking', r); }
      else { r.deposit = 'Refund due'; save_(r); email_('Deposit paid too late (refund it)', r); }
    } else if (r.deposit === 'Waiting' && now - Date.parse(r.created_at) > DEPOSIT_HOLD_MIN * 60000) {
      r.status = 'cancelled'; r.deposit = 'Expired'; save_(r);
    }
  });
}

function stripeSessions_(sinceMs) {
  const out = [];
  let after = '';
  for (let page = 0; page < 10; page++) {
    const url = 'https://api.stripe.com/v1/checkout/sessions?limit=100&created%5Bgte%5D=' + Math.floor(sinceMs / 1000) + (after ? '&starting_after=' + after : '');
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + STRIPE_SECRET_KEY }, muteHttpExceptions: true });
    const j = JSON.parse(res.getContentText());
    if (res.getResponseCode() !== 200) throw new Error('Stripe: ' + ((j.error && j.error.message) || res.getResponseCode()));
    out.push.apply(out, j.data);
    if (!j.has_more || !j.data.length) break;
    after = j.data[j.data.length - 1].id;
  }
  return out;
}

function depositLine_(r) {
  const amt = '$' + DEPOSIT_AMOUNT;
  return {
    'Paid': amt + ' paid (take it off the bill)',
    'Refund due': amt + ' paid. Refund it in Stripe.',
    'Kept': amt + ' paid. Keep it (cancelled within ' + DEPOSIT_KEEP_HOURS + ' hours).',
    'Not paid': 'not paid'
  }[r.deposit] || '';
}

// ---------- email ----------
function email_(kind, r) {
  const to = OWNER_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;
  const when = whenLabel_(r.start, r.end);
  const lines = [
    kind + ' for ' + BUSINESS_NAME, '',
    'When: ' + when,
    'Service: ' + r.service + ' (' + r.option_label + ')' + (r.addons ? ' + ' + r.addons : ''),
    'Frequency: ' + ({ once: 'One-time', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' }[r.frequency] || r.frequency),
    'Price: ' + r.price_label + (r.is_quote ? ' (free quote visit)' : ''),
  ];
  if (depositLine_(r)) lines.push('Deposit: ' + depositLine_(r));
  lines.push(
    '', 'Customer: ' + r.customer_name, 'Phone: ' + r.customer_phone, 'Email: ' + (r.customer_email || '—'),
    'Address: ' + r.address, 'Notes: ' + (r.notes || '—'), '', 'Confirmation code: ' + r.ref
  );
  MailApp.sendEmail({ to: to, subject: kind + ': ' + r.service + ' on ' + when, body: lines.join('\n') });
}

// ---------- helpers ----------
function owner_(b) { if (!b || b.passcode !== OWNER_PASSCODE || OWNER_PASSCODE === 'change-me') throw err_('Wrong passcode.', 'auth'); }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(message, code) { const e = new Error(message); e.code = code || null; return e; }
function digits_(t) { return String(t || '').replace(/\D/g, ''); }
function clean_(t) { return String(t || '').trim(); }
function cut_(t, n) { return clean_(t).slice(0, n); }
function iso_(ms) { return new Date(ms).toISOString(); }
function toMs_(v) { return v instanceof Date ? v.getTime() : Date.parse(String(v)); }
function whenLabel_(start, end) {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(start), tz, 'EEE MMM d, h:mm a') + ' – ' + Utilities.formatDate(new Date(end), tz, 'h:mm a');
}
