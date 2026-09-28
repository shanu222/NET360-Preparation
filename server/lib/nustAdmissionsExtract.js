import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

export const NUST_UG_PORTAL_URL = 'https://ugadmissions.nust.edu.pk/';

const LOGIN_PATH_HINTS = [
  'meritsearch',
  'netform/default',
  'login',
  'forgotpassword',
  'newregistration',
];

export function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)));
}

export function stripHtml(text) {
  return decodeHtmlEntities(String(text || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function sanitizeNustText(text, maxLen = 280) {
  return stripHtml(text)
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\(\s*click here[^)]*\)/gi, ' ')
    .replace(/please login to your account\.?/gi, ' ')
    .replace(/to view the result,?\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function isPrivateNustPath(href) {
  const path = String(href || '').trim().toLowerCase();
  if (!path) return false;
  return LOGIN_PATH_HINTS.some((hint) => path.includes(hint));
}

export function isSelectionListNotice(item) {
  const haystack = `${item?.title || ''} ${item?.subtitle || ''}`.toLowerCase();
  return /selection\s*list|merit\s*list/.test(haystack);
}

export function normalizeNustStatus(raw, fallback = 'info') {
  const text = String(raw || '').toLowerCase();
  if (text.includes('registration closed') || text.includes('closed')) return 'closed';
  if (text.includes('uploaded') || text.includes('announced') || text.includes('declared')) return 'completed';
  if (text.includes('onwards') || text.includes('open now') || text.includes('open')) return 'open';
  if (text.includes('tentative') || text.includes('upcoming') || text.includes('will start')) return 'upcoming';
  return fallback;
}

function cellText($, cell) {
  return sanitizeNustText($(cell).text(), 160);
}

function isDash(value) {
  return !value || value === '-' || value === '–' || /^[-–]+$/.test(value);
}

export function extractNustSeriesDates(html) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  $('table.nettable tr').each((_, row) => {
    const cells = $(row).find('td').toArray().map((cell) => cellText($, cell));
    if (!cells.length) return;
    const seriesMatch = String(cells[0] || '').match(/series\s*[-–]?\s*(\d+)/i);
    if (!seriesMatch) return;
    const series = Number(seriesMatch[1]);
    const registrationRaw = cells[1] || '';
    const locations = ['Islamabad', 'Karachi', 'Quetta', 'Gilgit'];
    const locationBits = [];
    for (let i = 0; i < locations.length; i += 1) {
      const value = cells[i + 2] || '';
      if (isDash(value)) continue;
      locationBits.push(`${locations[i]}: ${value}`);
    }

    items.push({
      key: `series-${series}`,
      title: `NET Series ${series}`,
      registration: registrationRaw ? `Online Registration: ${registrationRaw}` : '',
      testDate: locationBits.length ? `Test Schedule: ${locationBits.join('; ')}` : '',
      status: normalizeNustStatus(`${registrationRaw} ${locationBits.join(' ')}`, 'upcoming'),
    });
  });

  items.sort((a, b) => Number(String(a.key).match(/(\d+)/)?.[1] || 0) - Number(String(b.key).match(/(\d+)/)?.[1] || 0));
  return items;
}

export function extractNustNotices(html) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  const seen = new Set();

  const pushNotice = (title, subtitle, category, status) => {
    const cleanTitle = sanitizeNustText(title, 180);
    const cleanSubtitle = sanitizeNustText(subtitle, 240);
    if (!cleanTitle || cleanTitle.length < 6) return;
    if (/^login to your account/i.test(cleanTitle)) return;
    const key = cleanTitle.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      key: `notice-${items.length + 1}`,
      title: cleanTitle,
      subtitle: cleanSubtitle || 'Official undergraduate admission announcement from NUST.',
      category,
      status,
    });
  };

  $('.Notice-box table, #Body_Div1 table').each((_, table) => {
    const heading = sanitizeNustText($(table).find('td.heading').first().text(), 180);
    const body = sanitizeNustText($(table).find('td').not('.heading').first().text(), 260);
    if (!heading && !body) return;
    const combined = `${heading} ${body}`.toLowerCase();
    let category = 'notice';
    if (/selection|merit list/.test(combined)) category = 'notice';
    else if (combined.includes('result')) category = 'result';
    else if (combined.includes('act') || combined.includes('sat')) category = 'act_sat';
    else if (combined.includes('net')) category = 'net';
    pushNotice(heading || body, body, category, normalizeNustStatus(combined, 'info'));
  });

  const pageText = sanitizeNustText($.text(), 8000);
  const netLast = pageText.match(/NUST Entry Test\s*\(Series-?\s*(\d)\)\s*Application Form\s*Last Date:\s*([A-Za-z0-9 ,\-]+)/i);
  if (netLast) {
    pushNotice(
      `NET Series ${netLast[1]} registration deadline`,
      `Application form last date: ${netLast[2].trim()}`,
      'net',
      normalizeNustStatus(pageText, 'closed'),
    );
  }
  const actLast = pageText.match(/ACT\s*\/?\s*SAT Basis Application Form\s*Last Date:\s*([A-Za-z0-9 ,\-]+)/i);
  if (actLast) {
    pushNotice(
      'ACT/SAT application deadline',
      `Application form last date: ${actLast[1].trim()}`,
      'act_sat',
      'info',
    );
  }

  $('li').each((_, li) => {
    const text = sanitizeNustText($(li).text(), 260);
    if (/rescheduled|postponed|admit card|important notice/i.test(text) && text.length > 24) {
      pushNotice(text.slice(0, 120), text, 'net', normalizeNustStatus(text, 'info'));
    }
  });

  return items.slice(0, 12);
}

export function extractNustExtras(html) {
  const $ = cheerio.load(String(html || ''));
  const pageText = sanitizeNustText($.text(), 8000);
  const tableSession = sanitizeNustText($('table.nettable th').first().text(), 20);
  const sessionMatch = tableSession.match(/NET-20\d{2}/i) || pageText.match(/NET-20\d{2}/i);
  const locations = [];
  if (/islamabad/i.test(pageText)) locations.push('Islamabad (NUST Campus, computer-based)');
  if (/karachi/i.test(pageText)) locations.push('Karachi (paper-based)');
  if (/quetta/i.test(pageText)) locations.push('Quetta (computer-based)');
  if (/gilgit/i.test(pageText)) locations.push('Gilgit (paper-based)');

  return {
    sessionLabel: sessionMatch ? sessionMatch[0].toUpperCase() : '',
    locations: [...new Set(locations)],
    sourceTitle: sanitizeNustText($('title').first().text(), 80),
  };
}

export function extractNustAdmissionsFromHtml(html) {
  const dates = extractNustSeriesDates(html);
  const notices = extractNustNotices(html);
  const extras = extractNustExtras(html);
  return { dates, notices, extras };
}

export function buildNustContentHash(payload) {
  const normalized = {
    dates: Array.isArray(payload?.dates) ? payload.dates : [],
    notices: Array.isArray(payload?.notices) ? payload.notices : [],
    extras: payload?.extras || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function timelineMonthFromSchedule(testDate) {
  const raw = String(testDate || '');
  const match = raw.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i);
  if (!match) return '';
  const key = match[1].slice(0, 3).toLowerCase();
  const map = {
    jan: 'January',
    feb: 'February',
    mar: 'March',
    apr: 'April',
    may: 'May',
    jun: 'June',
    jul: 'July',
    aug: 'August',
    sep: 'September',
    oct: 'October',
    nov: 'November',
    dec: 'December',
  };
  return map[key] || '';
}

export function formatNustLastUpdated(value) {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(at);
}
