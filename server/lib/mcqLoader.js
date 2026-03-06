import fs from 'node:fs/promises';

const subjectAliases = {
  mathematics: 'mathematics',
  math: 'mathematics',
  maths: 'mathematics',
  physics: 'physics',
  english: 'english',
  biology: 'biology',
  chemistry: 'chemistry',
  intelligence: 'intelligence',
  'general knowledge': 'general-knowledge',
  gk: 'general-knowledge',
};

const orderedSubjects = ['mathematics', 'physics', 'chemistry', 'english', 'intelligence', 'general-knowledge', 'biology'];

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function classifyDifficulty(index, total) {
  if (total <= 2) return index === 0 ? 'Easy' : index === 1 ? 'Medium' : 'Hard';
  const ratio = (index + 1) / total;
  if (ratio <= 0.34) return 'Easy';
  if (ratio <= 0.67) return 'Medium';
  return 'Hard';
}

function normalizeAnswer(rawAnswer, options) {
  const answer = String(rawAnswer || '').trim();
  if (!answer) return '';

  const labels = ['A', 'B', 'C', 'D'];
  const upper = answer.toUpperCase();
  const labelIndex = labels.indexOf(upper);
  if (labelIndex >= 0 && options[labelIndex]) {
    return options[labelIndex];
  }

  const exact = options.find((option) => option.trim().toLowerCase() === answer.toLowerCase());
  return exact || answer;
}

export async function loadMcqsFromCsv(csvPath) {
  const csvText = await fs.readFile(csvPath, 'utf-8');
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((key, idx) => {
      row[key] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }

  const grouped = new Map();

  rows.forEach((row) => {
    const subjectRaw = String(row.subject || '').toLowerCase();
    const subject = subjectAliases[subjectRaw];
    if (!subject) return;

    if (!grouped.has(subject)) grouped.set(subject, []);
    grouped.get(subject).push(row);
  });

  const mcqs = [];

  orderedSubjects.forEach((subject) => {
    const subjectRows = grouped.get(subject) || [];
    subjectRows.forEach((row, index) => {
      const options = [row.optionA, row.optionB, row.optionC, row.optionD]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      if (!row.question || !options.length) return;

      mcqs.push({
        externalId: String(row.id || `${subject}-${index + 1}`),
        subject,
        topic: row.topic || 'General',
        question: row.question,
        options,
        answer: normalizeAnswer(row.answer, options),
        tip: row.tip || '',
        difficulty: classifyDifficulty(index, subjectRows.length),
        source: 'NET Dataset',
      });
    });
  });

  return mcqs;
}
