import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeAnalyticsText,
  normalizeAnalyticsPlatform,
  normalizeAnalyticsFeature,
  normalizeErrorCategory,
  buildAnalyticsAlertKey,
  buildDailyReportId,
  shouldAlertOnError,
  ANALYTICS_ALERT_WINDOW_MS,
} from './adminAnalytics.js';

test('sanitizes tokens, passwords, and connection strings', () => {
  const raw = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb password=secret123 mongodb+srv://u:p@host/db';
  const cleaned = sanitizeAnalyticsText(raw);
  assert.equal(cleaned.includes('secret123'), false);
  assert.equal(cleaned.includes('mongodb+srv'), false);
  assert.equal(cleaned.includes('eyJ'), false);
  assert.ok(cleaned.includes('[redacted]'));
});

test('normalizes platforms from client headers', () => {
  assert.equal(normalizeAnalyticsPlatform('android-native'), 'android');
  assert.equal(normalizeAnalyticsPlatform('', 'ios-native'), 'ios');
  assert.equal(normalizeAnalyticsPlatform('admin-web'), 'web');
});

test('maps screens to feature identifiers', () => {
  assert.equal(normalizeAnalyticsFeature('', 'practice-board'), 'PRACTICE_BOARD');
  assert.equal(normalizeAnalyticsFeature('QUIZ_BATTLE'), 'QUIZ_BATTLE');
  assert.equal(normalizeAnalyticsFeature('', 'guide'), 'NUST_ADMISSION_GUIDE');
});

test('maps technical event types to categories', () => {
  assert.equal(normalizeErrorCategory('test_launch_failed'), 'TEST');
  assert.equal(normalizeErrorCategory('pdf_failed'), 'PDF');
  assert.equal(normalizeErrorCategory('login_failed', 'AUTHENTICATION'), 'AUTHENTICATION');
});

test('alert keys stay stable inside a 30-minute window', () => {
  const start = ANALYTICS_ALERT_WINDOW_MS * 4;
  const first = buildAnalyticsAlertKey({
    platform: 'android',
    userId: 'u1',
    eventType: 'test_launch_failed',
    resource: 'tests',
    at: start,
  });
  const repeats = Array.from({ length: 20 }, (_, index) => buildAnalyticsAlertKey({
    platform: 'android',
    userId: 'u1',
    eventType: 'test_launch_failed',
    resource: 'tests',
    at: start + index * 1000,
  }));
  const later = buildAnalyticsAlertKey({
    platform: 'android',
    userId: 'u1',
    eventType: 'test_launch_failed',
    resource: 'tests',
    at: start + ANALYTICS_ALERT_WINDOW_MS,
  });
  assert.ok(repeats.every((key) => key === first));
  assert.notEqual(first, later);
});

test('daily report ids are unique per date', () => {
  assert.equal(buildDailyReportId('2026-09-27'), 'NET360-DAILY-REPORT-2026-09-27');
  assert.notEqual(buildDailyReportId('2026-09-27'), buildDailyReportId('2026-09-28'));
});

test('only meaningful failures are alertable', () => {
  assert.equal(shouldAlertOnError({ category: 'TEST', statusCode: 0, eventType: 'test_launch_failed' }), true);
  assert.equal(shouldAlertOnError({ category: 'API', statusCode: 500, eventType: 'api_failed' }), true);
  assert.equal(shouldAlertOnError({ category: 'API', statusCode: 404, eventType: 'api_failed' }), false);
  assert.equal(shouldAlertOnError({ category: 'GENERAL', statusCode: 0, eventType: 'technical_error' }), false);
});
