import { jsPDF } from 'jspdf';
import {
  formatClosingMerit,
  formatMeritPosition,
  meritPositionLabel,
  meritStatusLabel,
  type ClosingMeritProgram,
  type MeritListStanding,
} from './closingMerits';
import { brandLogoUrl } from './publicMedia';

export type MeritPdfTrack = {
  label: string;
  aggregate: number;
  standing: MeritListStanding;
};

function asLines(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

async function loadLogoDataUrl(): Promise<string | null> {
  if (typeof fetch !== 'function' || typeof FileReader === 'undefined') return null;
  try {
    const response = await fetch(brandLogoUrl());
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(new Error('logo'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function programSchool(program: ClosingMeritProgram) {
  return [program.institution, program.location].filter(Boolean).join(', ');
}

export async function buildMeritResultPdf(input: { year: number; tracks: MeritPdfTrack[] }): Promise<Blob> {
  const logo = await loadLogoDataUrl();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 40;
  const contentWidth = pageWidth - left * 2;
  const bottom = pageHeight - 46;
  let y = 0;

  const ensure = (height: number) => {
    if (y + height <= bottom) return;
    doc.addPage();
    y = 48;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(49, 46, 129);
    doc.text('NET360 Merit Result', left, y);
    y += 18;
  };

  const writeLines = (text: string, size: number, color: [number, number, number], font: 'normal' | 'bold', gap = 4) => {
    doc.setFont('helvetica', font);
    doc.setFontSize(size);
    const lines = asLines(doc.splitTextToSize(text, contentWidth));
    const lineHeight = size + 3;
    ensure(lines.length * lineHeight + gap);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(lines, left, y);
    y += lines.length * lineHeight + gap;
  };

  doc.setFillColor(49, 46, 129);
  doc.rect(0, 0, pageWidth, 92, 'F');
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', left, 18, 56, 56);
    } catch {
      doc.setFillColor(99, 102, 241);
      doc.roundedRect(left, 18, 56, 56, 12, 12, 'F');
    }
  } else {
    doc.setFillColor(99, 102, 241);
    doc.roundedRect(left, 18, 56, 56, 12, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('N', left + 20, 54);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('NET360 Merit Result', left + 72, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${input.year} closing-merit list`, left + 72, 60);
  y = 114;

  const generated = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  writeLines(`Generated ${generated}`, 10, [100, 116, 139], 'normal', 10);

  input.tracks.forEach((track) => {
    const standing = track.standing;
    const best = standing.bestMet;
    const next = standing.nextAbove;
    writeLines(track.label, 14, [49, 46, 129], 'bold', 6);
    writeLines(`Aggregate: ${track.aggregate.toFixed(2)}%`, 12, [15, 23, 42], 'bold', 3);
    writeLines(`Merit position: ${meritPositionLabel(standing)}`, 11, [30, 41, 59], 'normal', 3);
    if (standing.met === 0) {
      const nearest = standing.nextAbove;
      writeLines(
        `Below every listed closing aggregate${nearest ? ` (nearest is ${nearest.name}, ${nearest.institution}, ${formatClosingMerit(nearest.closingMerit)})` : ''}.`,
        11,
        [30, 41, 59],
        'normal',
        3,
      );
    } else {
      writeLines(
        `Meets ${standing.met} ${standing.met === 1 ? 'program' : 'programs'} of ${standing.listed} on the ${input.year} list.`,
        11,
        [30, 41, 59],
        'normal',
        3,
      );
      if (best) {
        writeLines(
          `Highest match: ${best.name} (${programSchool(best)}), closing aggregate ${formatClosingMerit(best.closingMerit)}, position ${best.meritPosition != null ? formatMeritPosition(best.meritPosition) : '—'}, ${meritStatusLabel(best.meritStatus)}.`,
          11,
          [30, 41, 59],
          'normal',
          3,
        );
      }
      writeLines(
        next
          ? `Next above you: ${next.name} (${programSchool(next)}) ${formatClosingMerit(next.closingMerit)}.`
          : 'At or above the highest closing merit.',
        11,
        [30, 41, 59],
        'normal',
        3,
      );
    }

    writeLines(
      standing.metPrograms.length
        ? `Potential programs (${standing.metPrograms.length})`
        : 'Potential programs',
      12,
      [49, 46, 129],
      'bold',
      4,
    );
    writeLines(
      standing.metPrograms.length
        ? `NUST programs whose ${input.year} closing aggregate this result meets.`
        : 'No listed program is within this aggregate.',
      10,
      [71, 85, 105],
      'normal',
      8,
    );

    if (standing.metPrograms.length) {
      const columns = [left, left + 168, left + 318, left + 400, left + 468];
      const drawHeader = () => {
        ensure(22);
        doc.setFillColor(238, 242, 255);
        doc.rect(left - 4, y - 11, contentWidth + 8, 18, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(67, 56, 202);
        doc.text('Program', columns[0], y);
        doc.text('School', columns[1], y);
        doc.text('Aggregate', columns[2], y);
        doc.text('Position', columns[3], y);
        doc.text('Status', columns[4], y);
        y += 14;
      };
      drawHeader();
      standing.metPrograms.forEach((program) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const nameLines = asLines(doc.splitTextToSize(program.name, 156));
        const schoolLines = asLines(doc.splitTextToSize(programSchool(program), 140));
        const rowLines = Math.max(nameLines.length, schoolLines.length, 1);
        const rowHeight = rowLines * 11 + 6;
        if (y + rowHeight > bottom) {
          doc.addPage();
          y = 48;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(49, 46, 129);
          doc.text(`NET360 Merit Result · ${track.label}`, left, y);
          y += 18;
          drawHeader();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
        }
        doc.setTextColor(30, 27, 75);
        doc.text(nameLines, columns[0], y);
        doc.setTextColor(71, 85, 105);
        doc.text(schoolLines, columns[1], y);
        doc.text(formatClosingMerit(program.closingMerit), columns[2], y);
        doc.text(program.meritPosition != null ? formatMeritPosition(program.meritPosition) : '—', columns[3], y);
        doc.text(meritStatusLabel(program.meritStatus), columns[4], y);
        y += rowHeight;
      });
      y += 8;
    }
  });

  writeLines(
    `Figures use the admin ${input.year} closing-merit list. A program is within reach when the calculated aggregate is at least that program's closing aggregate. Real or Estimated is the status saved for that closing merit. Admission cutoffs can change.`,
    9,
    [100, 116, 139],
    'normal',
    0,
  );

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`NET360  ·  Page ${page} of ${pageCount}`, left, pageHeight - 28);
  }

  return doc.output('blob');
}
