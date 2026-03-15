export type SubjectKey =
	| 'mathematics'
	| 'physics'
	| 'english'
	| 'biology'
	| 'chemistry'
	| 'computer-science'
	| 'intelligence'
	| 'quantitative-mathematics'
	| 'design-aptitude';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export const SUBJECT_KEYS: SubjectKey[] = [
	'mathematics',
	'physics',
	'english',
	'biology',
	'chemistry',
	'computer-science',
	'intelligence',
	'quantitative-mathematics',
	'design-aptitude',
];

export interface McqImageFile {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface McqOptionMedia {
  key: string;
  text: string;
  image?: McqImageFile | null;
}

export interface MCQ {
	id: string;
	subject: SubjectKey;
	part?: string;
	chapter?: string;
	section?: string;
	topic: string;
	question: string;
	questionImageUrl?: string;
	questionImage?: McqImageFile | null;
	options: string[];
	optionMedia?: McqOptionMedia[];
	answer: string;
	answerKey?: string;
	tip: string;
	explanationText?: string;
	explanationImage?: McqImageFile | null;
	shortTrickText?: string;
	shortTrickImage?: McqImageFile | null;
	difficulty: Difficulty;
}

interface CsvRow {
	id?: string;
	subject?: string;
	topic?: string;
	question?: string;
	optionA?: string;
	optionB?: string;
	optionC?: string;
	optionD?: string;
	answer?: string;
	tip?: string;
}

const subjectAliases: Record<string, SubjectKey> = {
	mathematics: 'mathematics',
	math: 'mathematics',
	maths: 'mathematics',
	physics: 'physics',
	english: 'english',
	biology: 'biology',
	chemistry: 'chemistry',
	'computer-science': 'computer-science',
	'computer science': 'computer-science',
	cs: 'computer-science',
	intelligence: 'intelligence',
	'quantitative-mathematics': 'quantitative-mathematics',
	'quantitative mathematics': 'quantitative-mathematics',
	'design-aptitude': 'design-aptitude',
	'design aptitude': 'design-aptitude',
};

const subjectOrder: SubjectKey[] = SUBJECT_KEYS;

function splitCsvLine(line: string): string[] {
	const values: string[] = [];
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

function toSubject(value: string | undefined): SubjectKey | null {
	if (!value) return null;
	const normalized = value.trim().toLowerCase();
	return subjectAliases[normalized] ?? null;
}

function parseCsv(csvText: string): CsvRow[] {
	const lines = csvText
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0);

	if (!lines.length) return [];

	const header = splitCsvLine(lines[0]).map((h) => h.trim());
	const rows: CsvRow[] = [];

	for (let i = 1; i < lines.length; i += 1) {
		const values = splitCsvLine(lines[i]);
		if (!values.length) continue;

		const row: Record<string, string> = {};
		header.forEach((key, index) => {
			row[key] = (values[index] ?? '').trim();
		});
		rows.push(row);
	}

	return rows;
}

export function classifyDifficulty(index: number, total: number): Difficulty {
	if (total <= 2) return index === 0 ? 'Easy' : index === 1 ? 'Medium' : 'Hard';
	const ratio = (index + 1) / total;
	if (ratio <= 0.34) return 'Easy';
	if (ratio <= 0.67) return 'Medium';
	return 'Hard';
}

export function parseMcqs(csvText: string): MCQ[] {
	const parsedRows = parseCsv(csvText);
	const groupedBySubject: Record<SubjectKey, CsvRow[]> = {
		mathematics: [],
		physics: [],
		english: [],
		biology: [],
		chemistry: [],
		'computer-science': [],
		intelligence: [],
		'quantitative-mathematics': [],
		'design-aptitude': [],
	};

	parsedRows.forEach((row) => {
		const subject = toSubject(row.subject);
		if (!subject) return;
		groupedBySubject[subject].push(row);
	});

	const mcqs: MCQ[] = [];

	subjectOrder.forEach((subject) => {
		const rows = groupedBySubject[subject];
		rows.forEach((row, index) => {
			const options = [row.optionA, row.optionB, row.optionC, row.optionD]
				.map((value) => (value ?? '').trim())
				.filter(Boolean);

			if (!row.question || !options.length) return;

			mcqs.push({
				id: `${subject}-${row.id ?? index + 1}-${index}`,
				subject,
				topic: row.topic?.trim() || 'General',
				question: row.question.trim(),
				options,
				answer: row.answer?.trim() || '',
				tip: row.tip?.trim() || '',
				difficulty: classifyDifficulty(index, rows.length),
			});
		});
	});

	return mcqs;
}

export function getSubjectLabel(subject: SubjectKey): string {
	const labels: Record<SubjectKey, string> = {
		mathematics: 'Mathematics',
		physics: 'Physics',
		english: 'English',
		biology: 'Biology',
		chemistry: 'Chemistry',
		'computer-science': 'Computer Science',
		intelligence: 'Intelligence',
		'quantitative-mathematics': 'Quantitative Mathematics',
		'design-aptitude': 'Design Aptitude',
	};
	return labels[subject] || `${subject.charAt(0).toUpperCase()}${subject.slice(1)}`;
}
