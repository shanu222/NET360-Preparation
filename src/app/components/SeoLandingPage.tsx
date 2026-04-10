import { useEffect } from 'react';
import { Button } from './ui/button';

type SeoPageKey =
  | 'physics-mcqs-net'
  | 'math-mcqs-net'
  | 'net-preparation-pakistan'
  | 'nust-entry-test-preparation';

const COPY: Record<
  SeoPageKey,
  {
    title: string;
    paragraphs: string[];
  }
> = {
  'physics-mcqs-net': {
    title: 'Physics MCQs for NUST NET',
    paragraphs: [
      'Practice physics MCQs for NUST NET with topic-wise tests, timed sessions, and instant scoring so you can build speed and accuracy.',
      'Use Preparation Materials for focused revision, then attempt Mock Tests to simulate the real exam experience.',
    ],
  },
  'math-mcqs-net': {
    title: 'Mathematics MCQs for NUST NET',
    paragraphs: [
      'Prepare mathematics MCQs for NUST NET with structured practice, chapter-wise coverage, and repeated test attempts to strengthen concepts.',
      'Track performance in Analytics and focus on weak areas with targeted practice sessions.',
    ],
  },
  'net-preparation-pakistan': {
    title: 'NET Preparation in Pakistan',
    paragraphs: [
      'NET360 helps students across Pakistan prepare for NUST NET through MCQs, mock tests, analytics, and a guided preparation flow.',
      'Choose your NET type, practice subject-wise, and build exam readiness with consistent practice.',
    ],
  },
  'nust-entry-test-preparation': {
    title: 'NUST Entry Test Preparation',
    paragraphs: [
      'Prepare for the NUST entry test with MCQs practice and mock tests designed for NET-style timing and question flow.',
      'Use topic-wise practice for revision and take full mock tests to measure real exam performance.',
    ],
  },
};

const PATH_BY_PAGE: Record<SeoPageKey, string> = {
  'physics-mcqs-net': '/physics-mcqs-net',
  'math-mcqs-net': '/math-mcqs-net',
  'net-preparation-pakistan': '/net-preparation-pakistan',
  'nust-entry-test-preparation': '/nust-entry-test-preparation',
};

const HEAD_SEO: Record<
  SeoPageKey,
  {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
  }
> = {
  'physics-mcqs-net': {
    title: 'Practice Physics MCQs | Free Test Prep',
    description:
      'Practice Physics MCQs with detailed explanations. Prepare for exams with high-quality questions.',
    ogTitle: 'Practice Physics MCQs',
    ogDescription: 'High-quality MCQs for exam prep',
  },
  'math-mcqs-net': {
    title: 'Practice Math MCQs | Free Test Prep',
    description:
      'Practice Math MCQs with detailed explanations. Improve your problem-solving skills.',
    ogTitle: 'Practice Math MCQs',
    ogDescription: 'High-quality MCQs for exam prep',
  },
  'net-preparation-pakistan': {
    title: 'NET Preparation in Pakistan | Free Test Prep',
    description: COPY['net-preparation-pakistan'].paragraphs[0],
    ogTitle: 'NET Preparation in Pakistan',
    ogDescription: 'MCQs, mock tests, and analytics for NUST NET.',
  },
  'nust-entry-test-preparation': {
    title: 'NUST Entry Test Preparation | Free Test Prep',
    description: COPY['nust-entry-test-preparation'].paragraphs[0],
    ogTitle: 'NUST Entry Test Preparation',
    ogDescription: 'MCQs and mock tests aligned with NET-style practice.',
  },
};

export function SeoLandingPage({ page }: { page: SeoPageKey }) {
  const copy = COPY[page];

  useEffect(() => {
    const seo = HEAD_SEO[page];
    const descEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const robotsEl = document.querySelector<HTMLMetaElement>('meta[name="robots"]');

    const previousTitle = document.title;
    const previousDescription = descEl?.getAttribute('content') ?? '';

    document.title = seo.title;
    if (descEl) descEl.setAttribute('content', seo.description);
    if (robotsEl) robotsEl.setAttribute('content', 'index, follow');

    const ogEntries: Array<[string, string]> = [
      ['og:title', seo.ogTitle],
      ['og:description', seo.ogDescription],
      ['og:type', 'website'],
      ['og:url', `${window.location.origin}${PATH_BY_PAGE[page]}`],
    ];

    const injected: HTMLMetaElement[] = [];
    for (const [property, content] of ogEntries) {
      const el = document.createElement('meta');
      el.setAttribute('property', property);
      el.setAttribute('content', content);
      el.setAttribute('data-net360-seo', '1');
      document.head.appendChild(el);
      injected.push(el);
    }

    return () => {
      document.title = previousTitle;
      if (descEl) descEl.setAttribute('content', previousDescription);
      injected.forEach((el) => el.remove());
    };
  }, [page]);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-indigo-100 bg-white/90 p-5 shadow-[0_10px_25px_rgba(98,113,202,0.11)]">
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">{copy.title}</h1>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          {copy.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/preparation">
            <Button className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white">Open Preparation Materials</Button>
          </a>
          <a href="/tests">
            <Button variant="outline">Start a Mock Test</Button>
          </a>
        </div>
      </header>

      <section className="rounded-2xl border border-indigo-100 bg-white/90 p-5 text-sm text-slate-700 shadow-[0_10px_25px_rgba(98,113,202,0.11)]">
        <h2 className="text-base font-semibold text-indigo-950">Explore more</h2>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a className="text-indigo-700 underline underline-offset-2 hover:text-indigo-800" href="/physics-mcqs-net">Practice Physics MCQs</a>
          <a className="text-indigo-700 underline underline-offset-2 hover:text-indigo-800" href="/math-mcqs-net">Practice Math MCQs</a>
          <a className="text-indigo-700 underline underline-offset-2 hover:text-indigo-800" href="/net-preparation-pakistan">NET Preparation Pakistan</a>
          <a className="text-indigo-700 underline underline-offset-2 hover:text-indigo-800" href="/nust-entry-test-preparation">NUST Entry Test Preparation</a>
        </div>
      </section>
    </div>
  );
}

