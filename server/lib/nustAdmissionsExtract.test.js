import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNustContentHash,
  extractNustAdmissionsFromHtml,
  isPrivateNustPath,
  isSelectionListNotice,
  timelineMonthFromSchedule,
} from './nustAdmissionsExtract.js';

const FIXTURE = `
<title>Undergraduate Admission 2026</title>
<div id="Body_Div1" class="body-Notice">
  <div class="Notice-box">
    <table>
      <tr><td class="heading">UG 14th Selection List 2026</td></tr>
      <tr><td><a href="result/meritsearch.aspx">UG 14th selection list (NET and ACT/SAT basis) session 2026 have been uploaded. Last date to deposit dues is 25 Sep 2026.</a></td></tr>
    </table>
    <table>
      <tr><td class="heading">Result NET-2026</td></tr>
      <tr><td>Result of NET-2026 (Series-4) conducted from 13 Jun to 29 Jul 2026 CBNET (Islamabad and Quetta) has been uploaded.</td></tr>
    </table>
  </div>
</div>
<p>NUST Entry Test (Series-4) Application Form Last Date: 18 Jun 2026</p>
<p>ACT/SAT Basis Application Form Last Date: 25 Jul 2026</p>
<table class="nettable">
  <tr><th>NET-2027</th><th>Online Registration</th><th>Islamabad</th><th>Karachi</th><th>Quetta</th><th>Gilgit</th></tr>
  <tr>
    <td>Series - 1</td>
    <td>4 Oct - 14 Nov 2026</td>
    <td>17 Nov 2026 onwards</td>
    <td>-</td><td></td><td></td>
  </tr>
  <tr>
    <td>Series - 2</td>
    <td>Dec 2026 – Jan 2027</td>
    <td>Jan – Feb 2027</td>
    <td>Mar 2027</td>
    <td></td>
    <td>-</td>
  </tr>
  <tr>
    <td>Series - 3</td>
    <td>Feb – Mar 2027</td>
    <td>Apr 2027</td>
    <td>-</td><td></td><td></td>
  </tr>
  <tr>
    <td>Series - 4</td>
    <td>Apr – May 2027</td>
    <td>Jun – Jul 2027</td>
    <td>Jul 2027</td>
    <td></td><td></td>
  </tr>
</table>
<p>NET is conducted at four locations, that is Islamabad (NUST Campus), Karachi, Quetta and Gilgit.</p>
`;

test('extracts official series dates and public notices without login pages', () => {
  const extracted = extractNustAdmissionsFromHtml(FIXTURE);
  assert.equal(extracted.dates.length, 4);
  assert.match(extracted.dates[0].registration, /4 Oct - 14 Nov 2026/);
  assert.match(extracted.dates[0].testDate, /Islamabad: 17 Nov 2026 onwards/);
  assert.equal(extracted.dates[0].testDate.includes('Karachi'), false);
  assert.match(extracted.dates[1].testDate, /Karachi: Mar 2027/);
  assert.equal(extracted.extras.sessionLabel, 'NET-2027');
  assert.ok(extracted.notices.some((item) => /14th Selection List/i.test(item.title)));
  assert.ok(extracted.notices.some((item) => /Result NET-2026/i.test(item.title)));
  assert.equal(isPrivateNustPath('result/meritsearch.aspx'), true);
  assert.equal(isPrivateNustPath('https://ugadmissions.nust.edu.pk/'), false);
});

test('selection-list notices are identified for the public announcement email', () => {
  assert.equal(isSelectionListNotice({ title: 'UG 14th Selection List 2026', subtitle: 'uploaded' }), true);
  assert.equal(isSelectionListNotice({ title: 'Result NET-2026', subtitle: 'Series-4' }), false);
});

test('content hash is stable for the same official payload', () => {
  const extracted = extractNustAdmissionsFromHtml(FIXTURE);
  const first = buildNustContentHash(extracted);
  const second = buildNustContentHash(extracted);
  assert.equal(first, second);
  assert.notEqual(first, buildNustContentHash({ ...extracted, notices: [] }));
  assert.equal(timelineMonthFromSchedule('Test Schedule: Islamabad: 17 Nov 2026 onwards'), 'November');
});
