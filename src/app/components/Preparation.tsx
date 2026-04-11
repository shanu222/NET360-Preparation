import { useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import { apiRequest, resolveLaunchAuthToken } from '../lib/api';
import { bearerForLaunchUrl } from '../lib/authSession';
import { SubjectKey, getSubjectLabel } from '../lib/mcq';
import { dedupeNormalizedStrings, normalizeHierarchyLabel } from '../lib/hierarchyDedup';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';

type AcademicPart = 'part1' | 'part2';
type TabKey = SubjectKey;
type PartStructuredSubjectKey = 'mathematics' | 'physics' | 'english' | 'biology' | 'chemistry';

export interface ChapterItem {
  id: string;
  title: string;
  sections: string[];
}

export interface PartItem {
  label: string;
  chapters: ChapterItem[];
}

function uniqueSections(sections: string[]) {
  return dedupeNormalizedStrings(sections);
}

function dedupeChaptersByTitle(chapters: ChapterItem[]) {
  const chapterMap = new Map<string, ChapterItem>();

  (chapters || []).forEach((chapter) => {
    const title = String(chapter?.title || '').trim();
    if (!title) return;
    const titleKey = normalizeHierarchyLabel(title);
    const currentSections = uniqueSections(Array.isArray(chapter?.sections) ? chapter.sections : []);

    if (!chapterMap.has(titleKey)) {
      chapterMap.set(titleKey, {
        id: String(chapter?.id || titleKey),
        title,
        sections: currentSections,
      });
      return;
    }

    const existing = chapterMap.get(titleKey)!;
    const existingSections = uniqueSections(existing.sections);
    const mergedSections = uniqueSections([...existingSections, ...currentSections]);

    // Keep the chapter record that already contains the fuller section list.
    const preferIncoming = currentSections.length > existingSections.length;
    chapterMap.set(titleKey, {
      id: preferIncoming ? String(chapter?.id || existing.id) : existing.id,
      title: preferIncoming ? title : existing.title,
      sections: mergedSections,
    });
  });

  return Array.from(chapterMap.values());
}

function normalizePartItem(partItem: PartItem): PartItem {
  return {
    label: partItem.label,
    chapters: dedupeChaptersByTitle(Array.isArray(partItem.chapters) ? partItem.chapters : []),
  };
}

const subjectTabs: SubjectKey[] = ['mathematics', 'physics', 'english', 'biology', 'chemistry', 'computer-science', 'intelligence'];
const PART_STRUCTURED_SUBJECTS: PartStructuredSubjectKey[] = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
const tabItems: Array<{ key: TabKey; label: string }> = [
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'physics', label: 'Physics' },
  { key: 'english', label: 'English' },
  { key: 'biology', label: 'Biology' },
  { key: 'chemistry', label: 'Chemistry' },
  { key: 'computer-science', label: 'Computer Science' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'quantitative-mathematics', label: 'Quantitative Mathematics' },
  { key: 'design-aptitude', label: 'Design Aptitude' },
];

const tabTriggerToneByKey: Record<TabKey, { idle: string; active: string }> = {
  mathematics: {
    idle: 'border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100',
    active: 'data-[state=active]:from-indigo-600 data-[state=active]:to-violet-500 data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)]',
  },
  physics: {
    idle: 'border-cyan-200 bg-cyan-50/80 text-cyan-700 hover:bg-cyan-100',
    active: 'data-[state=active]:from-cyan-600 data-[state=active]:to-blue-500 data-[state=active]:shadow-[0_12px_24px_rgba(8,145,178,0.35)]',
  },
  english: {
    idle: 'border-rose-200 bg-rose-50/80 text-rose-700 hover:bg-rose-100',
    active: 'data-[state=active]:from-rose-600 data-[state=active]:to-pink-500 data-[state=active]:shadow-[0_12px_24px_rgba(225,29,72,0.32)]',
  },
  biology: {
    idle: 'border-emerald-200 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100',
    active: 'data-[state=active]:from-emerald-600 data-[state=active]:to-teal-500 data-[state=active]:shadow-[0_12px_24px_rgba(5,150,105,0.33)]',
  },
  chemistry: {
    idle: 'border-amber-200 bg-amber-50/80 text-amber-700 hover:bg-amber-100',
    active: 'data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:shadow-[0_12px_24px_rgba(245,158,11,0.34)]',
  },
  'computer-science': {
    idle: 'border-sky-200 bg-sky-50/80 text-sky-700 hover:bg-sky-100',
    active: 'data-[state=active]:from-sky-600 data-[state=active]:to-indigo-500 data-[state=active]:shadow-[0_12px_24px_rgba(14,116,144,0.34)]',
  },
  intelligence: {
    idle: 'border-violet-200 bg-violet-50/80 text-violet-700 hover:bg-violet-100',
    active: 'data-[state=active]:from-violet-600 data-[state=active]:to-fuchsia-500 data-[state=active]:shadow-[0_12px_24px_rgba(124,58,237,0.34)]',
  },
  'quantitative-mathematics': {
    idle: 'border-fuchsia-200 bg-fuchsia-50/80 text-fuchsia-700 hover:bg-fuchsia-100',
    active: 'data-[state=active]:from-fuchsia-600 data-[state=active]:to-violet-500 data-[state=active]:shadow-[0_12px_24px_rgba(192,38,211,0.34)]',
  },
  'design-aptitude': {
    idle: 'border-purple-200 bg-purple-50/80 text-purple-700 hover:bg-purple-100',
    active: 'data-[state=active]:from-purple-600 data-[state=active]:to-indigo-500 data-[state=active]:shadow-[0_12px_24px_rgba(124,58,237,0.34)]',
  },
};

const PREPARATION_TAB_WIDTH_CLASS =
  'max-w-[min(100%,11rem)] sm:max-w-[13rem] md:max-w-[15rem] lg:max-w-none';

const syllabusToneBySubject: Record<
  SubjectKey,
  {
    partIdle: string;
    partHover: string;
    partActive: string;
    partShadow: string;
    chapterIdle: string;
    chapterHover: string;
    chapterActive: string;
    chapterAccent: string;
    sectionHover: string;
    sectionActive: string;
    sectionShadow: string;
    panelSurface: string;
  }
> = {
  mathematics: {
    partIdle: 'border-indigo-200/80 bg-indigo-50/45',
    partHover: 'hover:border-indigo-300 hover:bg-indigo-50/85',
    partActive: 'from-indigo-600 to-violet-500',
    partShadow: 'shadow-[0_14px_24px_rgba(79,70,229,0.3)]',
    chapterIdle: 'border-indigo-100 bg-white',
    chapterHover: 'hover:border-indigo-200 hover:bg-indigo-50/35',
    chapterActive: 'border-indigo-300/80 bg-indigo-50/75 shadow-[0_10px_18px_rgba(99,102,241,0.16)]',
    chapterAccent: 'text-indigo-700',
    sectionHover: 'hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-900',
    sectionActive: 'from-indigo-600 to-violet-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(79,70,229,0.28)]',
    panelSurface: 'border-indigo-200 bg-indigo-50/35',
  },
  physics: {
    partIdle: 'border-cyan-200/80 bg-cyan-50/45',
    partHover: 'hover:border-cyan-300 hover:bg-cyan-50/85',
    partActive: 'from-cyan-600 to-blue-500',
    partShadow: 'shadow-[0_14px_24px_rgba(8,145,178,0.3)]',
    chapterIdle: 'border-cyan-100 bg-white',
    chapterHover: 'hover:border-cyan-200 hover:bg-cyan-50/35',
    chapterActive: 'border-cyan-300/80 bg-cyan-50/75 shadow-[0_10px_18px_rgba(14,116,144,0.16)]',
    chapterAccent: 'text-cyan-700',
    sectionHover: 'hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900',
    sectionActive: 'from-cyan-600 to-blue-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(8,145,178,0.28)]',
    panelSurface: 'border-cyan-200 bg-cyan-50/35',
  },
  english: {
    partIdle: 'border-rose-200/80 bg-rose-50/45',
    partHover: 'hover:border-rose-300 hover:bg-rose-50/85',
    partActive: 'from-rose-600 to-pink-500',
    partShadow: 'shadow-[0_14px_24px_rgba(225,29,72,0.3)]',
    chapterIdle: 'border-rose-100 bg-white',
    chapterHover: 'hover:border-rose-200 hover:bg-rose-50/35',
    chapterActive: 'border-rose-300/80 bg-rose-50/75 shadow-[0_10px_18px_rgba(225,29,72,0.14)]',
    chapterAccent: 'text-rose-700',
    sectionHover: 'hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900',
    sectionActive: 'from-rose-600 to-pink-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(225,29,72,0.26)]',
    panelSurface: 'border-rose-200 bg-rose-50/35',
  },
  biology: {
    partIdle: 'border-emerald-200/80 bg-emerald-50/45',
    partHover: 'hover:border-emerald-300 hover:bg-emerald-50/85',
    partActive: 'from-emerald-600 to-teal-500',
    partShadow: 'shadow-[0_14px_24px_rgba(5,150,105,0.3)]',
    chapterIdle: 'border-emerald-100 bg-white',
    chapterHover: 'hover:border-emerald-200 hover:bg-emerald-50/35',
    chapterActive: 'border-emerald-300/80 bg-emerald-50/75 shadow-[0_10px_18px_rgba(5,150,105,0.14)]',
    chapterAccent: 'text-emerald-700',
    sectionHover: 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900',
    sectionActive: 'from-emerald-600 to-teal-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(5,150,105,0.26)]',
    panelSurface: 'border-emerald-200 bg-emerald-50/35',
  },
  chemistry: {
    partIdle: 'border-amber-200/80 bg-amber-50/45',
    partHover: 'hover:border-amber-300 hover:bg-amber-50/85',
    partActive: 'from-amber-500 to-orange-500',
    partShadow: 'shadow-[0_14px_24px_rgba(245,158,11,0.3)]',
    chapterIdle: 'border-amber-100 bg-white',
    chapterHover: 'hover:border-amber-200 hover:bg-amber-50/35',
    chapterActive: 'border-amber-300/80 bg-amber-50/75 shadow-[0_10px_18px_rgba(245,158,11,0.15)]',
    chapterAccent: 'text-amber-700',
    sectionHover: 'hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900',
    sectionActive: 'from-amber-500 to-orange-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(245,158,11,0.26)]',
    panelSurface: 'border-amber-200 bg-amber-50/35',
  },
  'computer-science': {
    partIdle: 'border-sky-200/80 bg-sky-50/45',
    partHover: 'hover:border-sky-300 hover:bg-sky-50/85',
    partActive: 'from-sky-600 to-indigo-500',
    partShadow: 'shadow-[0_14px_24px_rgba(14,116,144,0.3)]',
    chapterIdle: 'border-sky-100 bg-white',
    chapterHover: 'hover:border-sky-200 hover:bg-sky-50/35',
    chapterActive: 'border-sky-300/80 bg-sky-50/75 shadow-[0_10px_18px_rgba(14,116,144,0.15)]',
    chapterAccent: 'text-sky-700',
    sectionHover: 'hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900',
    sectionActive: 'from-sky-600 to-indigo-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(14,116,144,0.26)]',
    panelSurface: 'border-sky-200 bg-sky-50/35',
  },
  intelligence: {
    partIdle: 'border-violet-200/80 bg-violet-50/45',
    partHover: 'hover:border-violet-300 hover:bg-violet-50/85',
    partActive: 'from-violet-600 to-fuchsia-500',
    partShadow: 'shadow-[0_14px_24px_rgba(124,58,237,0.3)]',
    chapterIdle: 'border-violet-100 bg-white',
    chapterHover: 'hover:border-violet-200 hover:bg-violet-50/35',
    chapterActive: 'border-violet-300/80 bg-violet-50/75 shadow-[0_10px_18px_rgba(124,58,237,0.15)]',
    chapterAccent: 'text-violet-700',
    sectionHover: 'hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900',
    sectionActive: 'from-violet-600 to-fuchsia-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(124,58,237,0.26)]',
    panelSurface: 'border-violet-200 bg-violet-50/35',
  },
  'quantitative-mathematics': {
    partIdle: 'border-fuchsia-200/80 bg-fuchsia-50/45',
    partHover: 'hover:border-fuchsia-300 hover:bg-fuchsia-50/85',
    partActive: 'from-fuchsia-600 to-violet-500',
    partShadow: 'shadow-[0_14px_24px_rgba(192,38,211,0.3)]',
    chapterIdle: 'border-fuchsia-100 bg-white',
    chapterHover: 'hover:border-fuchsia-200 hover:bg-fuchsia-50/35',
    chapterActive: 'border-fuchsia-300/80 bg-fuchsia-50/75 shadow-[0_10px_18px_rgba(192,38,211,0.15)]',
    chapterAccent: 'text-fuchsia-700',
    sectionHover: 'hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:text-fuchsia-900',
    sectionActive: 'from-fuchsia-600 to-violet-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(192,38,211,0.26)]',
    panelSurface: 'border-fuchsia-200 bg-fuchsia-50/35',
  },
  'design-aptitude': {
    partIdle: 'border-purple-200/80 bg-purple-50/45',
    partHover: 'hover:border-purple-300 hover:bg-purple-50/85',
    partActive: 'from-purple-600 to-indigo-500',
    partShadow: 'shadow-[0_14px_24px_rgba(124,58,237,0.3)]',
    chapterIdle: 'border-purple-100 bg-white',
    chapterHover: 'hover:border-purple-200 hover:bg-purple-50/35',
    chapterActive: 'border-purple-300/80 bg-purple-50/75 shadow-[0_10px_18px_rgba(124,58,237,0.15)]',
    chapterAccent: 'text-purple-700',
    sectionHover: 'hover:border-purple-300 hover:bg-purple-50 hover:text-purple-900',
    sectionActive: 'from-purple-600 to-indigo-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(124,58,237,0.26)]',
    panelSurface: 'border-purple-200 bg-purple-50/35',
  },
};

export const FLAT_TOPIC_TABS: Record<'quantitative-mathematics' | 'design-aptitude', { title: string; topics: string[] }> = {
  'quantitative-mathematics': {
    title: 'Quantitative Mathematics',
    topics: ['Algebra', 'Ratios & proportions', 'Arithmetic', 'Graphs', 'Functions'],
  },
  'design-aptitude': {
    title: 'Design Aptitude',
    topics: ['Spatial reasoning', 'Visual perception', 'Pattern recognition', 'Sketching basics', 'Creativity and design thinking', 'Basic statistics'],
  },
};

const FLAT_TAB_SUBJECT_FALLBACKS: Record<'quantitative-mathematics' | 'design-aptitude', SubjectKey[]> = {
  'quantitative-mathematics': ['mathematics'],
  'design-aptitude': ['english', 'physics', 'mathematics'],
};

const RAW_COMPUTER_SCIENCE_SYLLABUS: ChapterItem[] = [
  {
    id: 'cs-c1',
    title: 'Chapter 1 - Computer Fundamentals',
    sections: ['Introduction to Computers', 'Computer Architecture', 'Basic Terminology'],
  },
  {
    id: 'cs-c2',
    title: 'Chapter 2 - Programming in C++',
    sections: ['Elements of C++', 'Decision Constructs', 'Loops', 'Functions', 'File Handling'],
  },
  {
    id: 'cs-c3',
    title: 'Chapter 3 - Object-Oriented Programming (OOP)',
    sections: ['Classes', 'Objects', 'Encapsulation', 'Polymorphism', 'Inheritance'],
  },
  {
    id: 'cs-c4',
    title: 'Chapter 4 - Data Structures & Algorithms',
    sections: ['Arrays', 'Data Structures', 'Performance Analysis of Algorithms'],
  },
  {
    id: 'cs-c5',
    title: 'Chapter 5 - Database Management System',
    sections: ['Basics of Microsoft Access', 'Database Design Processes', 'Normalization', 'Data Integrity'],
  },
  {
    id: 'cs-c6',
    title: 'Chapter 6 - Operating Systems & Networks',
    sections: ['Basics of Operating Systems', 'Data Communications', 'Networking Fundamentals'],
  },
  {
    id: 'cs-c7',
    title: 'Chapter 7 - Additional Topics',
    sections: ['Artificial Intelligence', 'Software Engineering', 'Web Engineering', 'Digital Logic Design'],
  },
];

const RAW_INTELLIGENCE_SYLLABUS: ChapterItem[] = [
  {
    id: 'iq-c1',
    title: 'Chapter 1 - Analytical Reasoning',
    sections: ['Logical Scenarios', 'Logical Deductions'],
  },
  {
    id: 'iq-c2',
    title: 'Chapter 2 - Coding & Decoding',
    sections: ['Letter-Based Puzzles', 'Number-Based Puzzles'],
  },
  {
    id: 'iq-c3',
    title: 'Chapter 3 - Direction Sense',
    sections: ['Movement Problems', 'Relative Position Questions'],
  },
  {
    id: 'iq-c4',
    title: 'Chapter 4 - Odd One Out',
    sections: ['Series Anomalies', 'Pattern Exceptions'],
  },
  {
    id: 'iq-c5',
    title: 'Chapter 5 - Series Completion',
    sections: ['Number Series Patterns', 'Figure Series Patterns'],
  },
  {
    id: 'iq-c6',
    title: 'Chapter 6 - Critical Thinking',
    sections: ['Problem Solving', 'Pattern Recognition'],
  },
];

const RAW_SYLLABUS: Record<PartStructuredSubjectKey, Record<AcademicPart, PartItem>> = {
  mathematics: {
    part1: {
      label: 'Mathematics Part 1 (FSc 1st Year)',
      chapters: [
        { id: 'm1-c1', title: 'Chapter 1 - Number Systems', sections: ['1.1 Real Numbers', '1.2 Complex Numbers', '1.3 Conjugate of a Complex Number', '1.4 Modulus and Argument of Complex Number', '1.5 Argand Diagram'] },
        { id: 'm1-c2', title: 'Chapter 2 - Functions and Graphs', sections: ['2.1 Functions', '2.2 Domain and Range', '2.3 Types of Functions', '2.4 Composite Functions', '2.5 Inverse Functions', '2.6 Graphs of Functions'] },
        { id: 'm1-c3', title: 'Chapter 3 - Matrices and Determinants', sections: ['3.1 Introduction to Matrices', '3.2 Types of Matrices', '3.3 Equality of Matrices', '3.4 Addition and Subtraction of Matrices', '3.5 Multiplication of Matrices', '3.6 Determinants', '3.7 Inverse of a Matrix'] },
        { id: 'm1-c4', title: 'Chapter 4 - Quadratic Equations', sections: ['4.1 Solution of Quadratic Equations', '4.2 Nature of Roots', '4.3 Relation between Roots and Coefficients', '4.4 Formation of Quadratic Equations'] },
        { id: 'm1-c5', title: 'Chapter 5 - Partial Fractions', sections: ['5.1 Introduction to Partial Fractions', '5.2 Proper and Improper Fractions', '5.3 Partial Fractions with Linear Factors', '5.4 Partial Fractions with Repeated Linear Factors', '5.5 Partial Fractions with Quadratic Factors'] },
        { id: 'm1-c6', title: 'Chapter 6 - Sequences and Series', sections: ['6.1 Sequences', '6.2 Arithmetic Sequence', '6.3 Geometric Sequence', '6.4 Arithmetic Mean', '6.5 Geometric Mean', '6.6 Sum of Arithmetic Series', '6.7 Sum of Geometric Series'] },
        { id: 'm1-c7', title: 'Chapter 7 - Permutations Combinations and Probability', sections: ['7.1 Fundamental Principle of Counting', '7.2 Permutations', '7.3 Combinations', '7.4 Binomial Theorem', '7.5 Probability'] },
        { id: 'm1-c8', title: 'Chapter 8 - Mathematical Induction and Binomial Theorem', sections: ['8.1 Principle of Mathematical Induction', '8.2 Binomial Expansion', '8.3 Binomial Coefficients'] },
        { id: 'm1-c9', title: 'Chapter 9 - Trigonometric Functions', sections: ['9.1 Radian Measure', '9.2 Trigonometric Functions', '9.3 Graphs of Trigonometric Functions', '9.4 Trigonometric Identities'] },
        { id: 'm1-c10', title: 'Chapter 10 - Trigonometric Identities', sections: ['10.1 Sum and Difference Formulas', '10.2 Double Angle Formulas', '10.3 Half Angle Formulas'] },
        { id: 'm1-c11', title: 'Chapter 11 - Trigonometric Equations', sections: ['11.1 General Solutions of Trigonometric Equations', '11.2 Solution of Trigonometric Equations'] },
      ],
    },
    part2: {
      label: 'Mathematics Part 2 (FSc 2nd Year)',
      chapters: [
        { id: 'm2-c1', title: 'Chapter 1 - Functions Limits and Continuity', sections: ['1.1 Real Functions', '1.2 Limit of a Function', '1.3 Limit Theorems', '1.4 Continuity'] },
        { id: 'm2-c2', title: 'Chapter 2 - Differentiation', sections: ['2.1 Derivative of a Function', '2.2 Derivatives of Algebraic Functions', '2.3 Derivatives of Trigonometric Functions', '2.4 Logarithmic and Exponential Functions', '2.5 Chain Rule', '2.6 Implicit Differentiation', '2.7 Higher Order Derivatives'] },
        { id: 'm2-c3', title: 'Chapter 3 - Application of Differentiation', sections: ['3.1 Increasing and Decreasing Functions', '3.2 Maxima and Minima', '3.3 Tangent and Normal', '3.4 Rate of Change'] },
        { id: 'm2-c4', title: 'Chapter 4 - Integration', sections: ['4.1 Indefinite Integration', '4.2 Standard Integrals', '4.3 Integration by Substitution', '4.4 Integration by Parts'] },
        { id: 'm2-c5', title: 'Chapter 5 - Definite Integration', sections: ['5.1 Definite Integrals', '5.2 Properties of Definite Integrals', '5.3 Area under Curves'] },
        { id: 'm2-c6', title: 'Chapter 6 - Differential Equations', sections: ['6.1 Introduction to Differential Equations', '6.2 First Order Differential Equations', '6.3 Variable Separable Equations', '6.4 Homogeneous Differential Equations'] },
        { id: 'm2-c7', title: 'Chapter 7 - Analytical Geometry of Straight Line', sections: ['7.1 Distance Formula', '7.2 Slope of a Line', '7.3 Equation of Straight Line'] },
        { id: 'm2-c8', title: 'Chapter 8 - Conic Sections', sections: ['8.1 Parabola', '8.2 Ellipse', '8.3 Hyperbola'] },
        { id: 'm2-c9', title: 'Chapter 9 - Vectors', sections: ['9.1 Introduction to Vectors', '9.2 Addition and Subtraction of Vectors', '9.3 Scalar Multiplication', '9.4 Dot Product', '9.5 Cross Product'] },
        { id: 'm2-c10', title: 'Chapter 10 - Three Dimensional Geometry', sections: ['10.1 Coordinates in Space', '10.2 Distance between Points', '10.3 Direction Cosines', '10.4 Equation of Line in Space'] },
      ],
    },
  },
  physics: {
    part1: {
      label: 'Physics Part 1 (FSc 1st Year)',
      chapters: [
        { id: 'p1-c1', title: 'Chapter 1 - Measurements', sections: ['1.1 Introduction', '1.2 Physical Quantities', '1.3 International System of Units', '1.4 Significant Figures', '1.5 Precision and Accuracy', '1.6 Errors and Uncertainties'] },
        { id: 'p1-c2', title: 'Chapter 2 - Vectors and Equilibrium', sections: ['2.1 Introduction to Vectors', '2.2 Addition of Vectors', '2.3 Resolution of Vectors', '2.4 Scalar and Vector Products', '2.5 Equilibrium of Forces', '2.6 Torque'] },
        { id: 'p1-c3', title: 'Chapter 3 - Motion and Force', sections: ['3.1 Displacement Velocity and Acceleration', '3.2 Equations of Motion', '3.3 Projectile Motion', '3.4 Newton\'s Laws of Motion', '3.5 Friction'] },
        { id: 'p1-c4', title: 'Chapter 4 - Work and Energy', sections: ['4.1 Work Done by Constant Force', '4.2 Work Done by Variable Force', '4.3 Kinetic Energy', '4.4 Potential Energy', '4.5 Conservation of Energy', '4.6 Power'] },
        { id: 'p1-c5', title: 'Chapter 5 - Circular Motion', sections: ['5.1 Angular Motion', '5.2 Centripetal Force', '5.3 Centrifugal Force', '5.4 Banking of Roads', '5.5 Motion of Satellites'] },
        { id: 'p1-c6', title: 'Chapter 6 - Fluid Dynamics', sections: ['6.1 Fluid Pressure', '6.2 Pascal\'s Law', '6.3 Archimedes Principle', '6.4 Bernoulli\'s Equation', '6.5 Viscosity'] },
        { id: 'p1-c7', title: 'Chapter 7 - Oscillations', sections: ['7.1 Simple Harmonic Motion', '7.2 Equation of SHM', '7.3 Energy in SHM', '7.4 Damped Oscillations', '7.5 Forced Oscillations'] },
        { id: 'p1-c8', title: 'Chapter 8 - Waves', sections: ['8.1 Wave Motion', '8.2 Types of Waves', '8.3 Wave Properties', '8.4 Interference', '8.5 Diffraction', '8.6 Doppler Effect'] },
        { id: 'p1-c9', title: 'Chapter 9 - Physical Optics', sections: ['9.1 Nature of Light', '9.2 Interference of Light', '9.3 Young Double Slit Experiment', '9.4 Diffraction of Light', '9.5 Polarization'] },
        { id: 'p1-c10', title: 'Chapter 10 - Optical Instruments', sections: ['10.1 Human Eye', '10.2 Simple Microscope', '10.3 Compound Microscope', '10.4 Telescope'] },
        { id: 'p1-c11', title: 'Chapter 11 - Heat and Thermodynamics', sections: ['11.1 Temperature and Heat', '11.2 Thermal Expansion', '11.3 Heat Transfer', '11.4 Laws of Thermodynamics', '11.5 Heat Engines'] },
      ],
    },
    part2: {
      label: 'Physics Part 2 (FSc 2nd Year)',
      chapters: [
        { id: 'p2-c12', title: 'Chapter 12 - Electrostatics', sections: ['12.1 Electric Charge', '12.2 Coulomb\'s Law', '12.3 Electric Field', '12.4 Electric Field Lines', '12.5 Electric Potential', '12.6 Capacitors'] },
        { id: 'p2-c13', title: 'Chapter 13 - Current Electricity', sections: ['13.1 Electric Current', '13.2 Ohm\'s Law', '13.3 Electrical Resistance', '13.4 Combination of Resistors', '13.5 Kirchhoff\'s Laws', '13.6 Electrical Energy and Power'] },
        { id: 'p2-c14', title: 'Chapter 14 - Electromagnetism', sections: ['14.1 Magnetic Field', '14.2 Magnetic Force on Current Carrying Conductor', '14.3 Magnetic Field due to Current', '14.4 Force on Moving Charge', '14.5 Galvanometer'] },
        { id: 'p2-c15', title: 'Chapter 15 - Electromagnetic Induction', sections: ['15.1 Electromagnetic Induction', '15.2 Faraday\'s Law', '15.3 Lenz\'s Law', '15.4 Induced EMF', '15.5 AC Generator', '15.6 Transformer'] },
        { id: 'p2-c16', title: 'Chapter 16 - Alternating Current', sections: ['16.1 Alternating Current', '16.2 AC Circuits', '16.3 Capacitive and Inductive Circuits', '16.4 Resonance in AC Circuits', '16.5 Power in AC Circuits'] },
        { id: 'p2-c17', title: 'Chapter 17 - Physics of Solids', sections: ['17.1 Crystal Structure', '17.2 Elasticity', '17.3 Stress and Strain', '17.4 Young\'s Modulus'] },
        { id: 'p2-c18', title: 'Chapter 18 - Electronics', sections: ['18.1 Semiconductor Physics', '18.2 p-type and n-type Semiconductors', '18.3 Diodes', '18.4 Rectifiers', '18.5 Transistors', '18.6 Logic Gates'] },
        { id: 'p2-c19', title: 'Chapter 19 - Dawn of Modern Physics', sections: ['19.1 Black Body Radiation', '19.2 Photoelectric Effect', '19.3 Atomic Spectra', '19.4 Bohr Model'] },
        { id: 'p2-c20', title: 'Chapter 20 - Atomic Spectra', sections: ['20.1 Hydrogen Spectrum', '20.2 Energy Levels', '20.3 Spectral Series'] },
        { id: 'p2-c21', title: 'Chapter 21 - Nuclear Physics', sections: ['21.1 Structure of Nucleus', '21.2 Radioactivity', '21.3 Nuclear Reactions', '21.4 Nuclear Fission', '21.5 Nuclear Fusion'] },
      ],
    },
  },
  english: {
    part1: {
      label: 'English Part 1',
      chapters: [
        { id: 'en-c1', title: 'Chapter 1 - Vocabulary', sections: ['Synonyms', 'Antonyms', 'Contextual Vocabulary'] },
        { id: 'en-c2', title: 'Chapter 2 - Grammar and Sentence Structure', sections: ['Sentence Completion', 'Tenses', 'Prepositions', 'Sentence Structure'] },
        { id: 'en-c3', title: 'Chapter 3 - Analogies', sections: ['Word Relationships', 'Meaning-Based Analogies'] },
      ],
    },
    part2: {
      label: 'English Part 2',
      chapters: [
        { id: 'en-c4', title: 'Chapter 4 - Reading Comprehension', sections: ['Passage Understanding', 'Critical Analysis', 'Inference Questions'] },
        { id: 'en-c5', title: 'Chapter 5 - Spelling', sections: ['Spelling Correction', 'Commonly Confused Words'] },
      ],
    },
  },
  biology: {
    part1: {
      label: 'Biology Part 1 (FSc 1st Year)',
      chapters: [
        { id: 'b1-c1', title: 'Chapter 1 - Introduction to Biology', sections: ['1.1 Biology and its Branches', '1.2 Biological Method'] },
        { id: 'b1-c2', title: 'Chapter 2 - Biological Molecules', sections: ['2.1 Carbohydrates', '2.2 Lipids', '2.3 Proteins', '2.4 Nucleic Acids'] },
        { id: 'b1-c3', title: 'Chapter 3 - Enzymes', sections: ['3.1 Mechanism of Enzyme Action', '3.2 Factors Affecting Enzyme Activity'] },
        { id: 'b1-c4', title: 'Chapter 4 - The Cell', sections: ['4.1 Cell Theory', '4.2 Cell Structure', '4.3 Cell Organelles'] },
        { id: 'b1-c5', title: 'Chapter 5 - Variety of Life', sections: ['5.1 Biological Classification', '5.2 Five Kingdom System'] },
      ],
    },
    part2: {
      label: 'Biology Part 2 (FSc 2nd Year)',
      chapters: [
        { id: 'b2-c13', title: 'Chapter 13 - Gaseous Exchange', sections: ['13.1 Respiratory Surfaces', '13.2 Breathing Mechanism', '13.3 Transport of Gases'] },
        { id: 'b2-c14', title: 'Chapter 14 - Transport', sections: ['14.1 Transport in Plants', '14.2 Circulatory System'] },
        { id: 'b2-c15', title: 'Chapter 15 - Homeostasis', sections: ['15.1 Osmoregulation', '15.2 Kidney Structure'] },
        { id: 'b2-c16', title: 'Chapter 16 - Support and Movement', sections: ['16.1 Skeleton', '16.2 Muscles'] },
        { id: 'b2-c17', title: 'Chapter 17 - Coordination and Control', sections: ['17.1 Nervous System', '17.2 Endocrine System'] },
        { id: 'b2-c18', title: 'Chapter 18 - Reproduction', sections: ['18.1 Asexual Reproduction', '18.2 Sexual Reproduction'] },
      ],
    },
  },
  chemistry: {
    part1: {
      label: 'Chemistry Part 1 (FSc 1st Year)',
      chapters: [
        { id: 'c1-c1', title: 'Chapter 1 - Basic Concepts', sections: ['1.1 Importance of Chemistry', '1.2 Branches of Chemistry', '1.3 Scientific Method', '1.4 Units and Measurements', '1.5 Significant Figures', '1.6 Mole Concept', '1.7 Chemical Equations'] },
        { id: 'c1-c2', title: 'Chapter 2 - Experimental Techniques', sections: ['2.1 Filtration', '2.2 Crystallization', '2.3 Distillation', '2.4 Chromatography'] },
        { id: 'c1-c3', title: 'Chapter 3 - Gases', sections: ['3.1 Gas Laws', '3.2 Boyle Law', '3.3 Charles Law', '3.4 Ideal Gas Equation'] },
        { id: 'c1-c4', title: 'Chapter 4 - Liquids and Solids', sections: ['4.1 Intermolecular Forces', '4.2 Vapour Pressure', '4.3 Surface Tension', '4.4 Crystal Lattices'] },
        { id: 'c1-c5', title: 'Chapter 5 - Atomic Structure', sections: ['5.1 Atomic Models', '5.2 Quantum Numbers', '5.3 Atomic Orbitals', '5.4 Electronic Configuration'] },
        { id: 'c1-c6', title: 'Chapter 6 - Chemical Bonding', sections: ['6.1 Ionic Bond', '6.2 Covalent Bond', '6.3 Molecular Geometry', '6.4 Hybridization'] },
        { id: 'c1-c7', title: 'Chapter 7 - Thermochemistry', sections: ['7.1 Exothermic Reactions', '7.2 Enthalpy Changes', '7.3 Hess Law'] },
        { id: 'c1-c8', title: 'Chapter 8 - Chemical Equilibrium', sections: ['8.1 Reversible Reactions', '8.2 Equilibrium Constant', '8.3 Le Chatelier Principle'] },
        { id: 'c1-c9', title: 'Chapter 9 - Solutions', sections: ['9.1 Types of Solutions', '9.2 Concentration of Solutions', '9.3 Solubility'] },
        { id: 'c1-c10', title: 'Chapter 10 - Electrochemistry', sections: ['10.1 Oxidation and Reduction', '10.2 Electrochemical Cells', '10.3 Electrolysis'] },
        { id: 'c1-c11', title: 'Chapter 11 - Reaction Kinetics', sections: ['11.1 Rate of Reaction', '11.2 Factors Affecting Rate'] },
        { id: 'c1-c12', title: 'Chapter 12 - Organic Chemistry', sections: ['12.1 Hydrocarbons', '12.2 Functional Groups', '12.3 Isomerism'] },
      ],
    },
    part2: {
      label: 'Chemistry Part 2 (FSc 2nd Year)',
      chapters: [
        { id: 'c2-c1', title: 'Chapter 1 - Periodic Classification of Elements', sections: ['1.1 Modern Periodic Law', '1.2 Atomic Radius', '1.3 Ionization Energy', '1.4 Electron Affinity', '1.5 Electronegativity'] },
        { id: 'c2-c2', title: 'Chapter 2 - s Block Elements', sections: ['2.1 Alkali Metals', '2.2 Properties of Alkali Metals', '2.3 Alkaline Earth Metals', '2.4 Properties of Alkaline Earth Metals'] },
        { id: 'c2-c3', title: 'Chapter 3 - Group IIIA and IVA Elements', sections: ['3.1 Boron Family', '3.2 Carbon Family', '3.3 Compounds of Boron', '3.4 Compounds of Carbon'] },
        { id: 'c2-c4', title: 'Chapter 4 - Group VA and VIA Elements', sections: ['4.1 Nitrogen Family', '4.2 Oxygen Family', '4.3 Compounds of Nitrogen', '4.4 Compounds of Oxygen'] },
        { id: 'c2-c5', title: 'Chapter 5 - Halogens and Noble Gases', sections: ['5.1 Properties of Halogens', '5.2 Compounds of Halogens', '5.3 Noble Gases'] },
        { id: 'c2-c6', title: 'Chapter 6 - Transition Elements', sections: ['6.1 Electronic Configuration', '6.2 Oxidation States', '6.3 Colored Compounds', '6.4 Catalytic Properties'] },
        { id: 'c2-c7', title: 'Chapter 7 - Fundamental Principles of Organic Chemistry', sections: ['7.1 Reaction Mechanisms', '7.2 Carbocations', '7.3 Resonance', '7.4 Inductive Effect'] },
        { id: 'c2-c8', title: 'Chapter 8 - Aliphatic Hydrocarbons', sections: ['8.1 Alkanes', '8.2 Alkenes', '8.3 Alkynes'] },
        { id: 'c2-c9', title: 'Chapter 9 - Aromatic Hydrocarbons', sections: ['9.1 Benzene Structure', '9.2 Aromaticity', '9.3 Electrophilic Substitution'] },
        { id: 'c2-c10', title: 'Chapter 10 - Alkyl Halides', sections: ['10.1 Preparation of Alkyl Halides', '10.2 Substitution Reactions', '10.3 Elimination Reactions'] },
        { id: 'c2-c11', title: 'Chapter 11 - Alcohols Phenols and Ethers', sections: ['11.1 Alcohols', '11.2 Phenols', '11.3 Ethers'] },
        { id: 'c2-c12', title: 'Chapter 12 - Aldehydes and Ketones', sections: ['12.1 Aldehydes', '12.2 Ketones', '12.3 Reactions of Carbonyl Compounds'] },
        { id: 'c2-c13', title: 'Chapter 13 - Carboxylic Acids', sections: ['13.1 Preparation of Carboxylic Acids', '13.2 Reactions of Carboxylic Acids'] },
        { id: 'c2-c14', title: 'Chapter 14 - Macromolecules', sections: ['14.1 Carbohydrates', '14.2 Proteins', '14.3 Lipids', '14.4 Nucleic Acids', '14.5 Polymers'] },
      ],
    },
  },
};

export const COMPUTER_SCIENCE_SYLLABUS: ChapterItem[] = dedupeChaptersByTitle(RAW_COMPUTER_SCIENCE_SYLLABUS);
export const INTELLIGENCE_SYLLABUS: ChapterItem[] = dedupeChaptersByTitle(RAW_INTELLIGENCE_SYLLABUS);
export const SYLLABUS: Record<PartStructuredSubjectKey, Record<AcademicPart, PartItem>> = {
  mathematics: {
    part1: normalizePartItem(RAW_SYLLABUS.mathematics.part1),
    part2: normalizePartItem(RAW_SYLLABUS.mathematics.part2),
  },
  physics: {
    part1: normalizePartItem(RAW_SYLLABUS.physics.part1),
    part2: normalizePartItem(RAW_SYLLABUS.physics.part2),
  },
  english: {
    part1: normalizePartItem(RAW_SYLLABUS.english.part1),
    part2: normalizePartItem(RAW_SYLLABUS.english.part2),
  },
  biology: {
    part1: normalizePartItem(RAW_SYLLABUS.biology.part1),
    part2: normalizePartItem(RAW_SYLLABUS.biology.part2),
  },
  chemistry: {
    part1: normalizePartItem(RAW_SYLLABUS.chemistry.part1),
    part2: normalizePartItem(RAW_SYLLABUS.chemistry.part2),
  },
};

interface PreparationProps {
  showStartTestButton?: boolean;
  onSelectSection?: (payload: {
    subject: SubjectKey;
    part?: AcademicPart;
    chapterTitle: string;
    sectionTitle: string;
  }) => void;
  onSelectFlatTopic?: (payload: {
    tabKey: 'quantitative-mathematics' | 'design-aptitude';
    subject: 'quantitative-mathematics' | 'design-aptitude';
    topicTitle: string;
  }) => void;
}

export function Preparation({ showStartTestButton = true, onSelectSection, onSelectFlatTopic }: PreparationProps = {}) {
  const { attempts } = useAppData();
  const { token: authContextToken } = useAuth();
  const difficultyLevels: Array<'Easy' | 'Medium' | 'Hard'> = ['Easy', 'Medium', 'Hard'];
  const [selectedSubject, setSelectedSubject] = useState<TabKey>('mathematics');
  const [selectedPartBySubject, setSelectedPartBySubject] = useState<Record<PartStructuredSubjectKey, AcademicPart | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, AcademicPart | null>)
  ));

  const [selectedChapterBySubject, setSelectedChapterBySubject] = useState<Record<PartStructuredSubjectKey, string | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, string | null>)
  ));

  const [selectedSectionBySubject, setSelectedSectionBySubject] = useState<Record<PartStructuredSubjectKey, string | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, string | null>)
  ));
  const [selectedComputerScienceChapterId, setSelectedComputerScienceChapterId] = useState<string | null>(null);
  const [selectedComputerScienceSection, setSelectedComputerScienceSection] = useState<string | null>(null);
  const [selectedIntelligenceChapterId, setSelectedIntelligenceChapterId] = useState<string | null>(null);
  const [selectedIntelligenceSection, setSelectedIntelligenceSection] = useState<string | null>(null);
  const [launchingSectionKey, setLaunchingSectionKey] = useState<string | null>(null);
  const launchingRef = useRef(false);
  const [difficultyMenuKey, setDifficultyMenuKey] = useState<string | null>(null);
  const [selectedFlatTopicByTab, setSelectedFlatTopicByTab] = useState<Record<'quantitative-mathematics' | 'design-aptitude', string | null>>({
    'quantitative-mathematics': null,
    'design-aptitude': null,
  });

  const normalizeProgressKey = (value: string) => normalizeHierarchyLabel(String(value || '').trim());

  const completedSectionKeys = useMemo(() => {
    const keys = new Set<string>();
    (attempts || []).forEach((attempt) => {
      const attemptSubject = String(attempt?.subject || '').trim();
      const attemptTopic = normalizeProgressKey(String(attempt?.topic || ''));
      if (!attemptSubject || !attemptTopic) return;
      keys.add(`${attemptSubject}::${attemptTopic}`);
    });
    return keys;
  }, [attempts]);

  const isSectionCompleted = (subject: SubjectKey, sectionTitle: string) => (
    completedSectionKeys.has(`${subject}::${normalizeProgressKey(sectionTitle)}`)
  );

  const getChapterProgressPercent = (subject: SubjectKey, sections: string[]) => {
    const totalSections = Array.isArray(sections) ? sections.length : 0;
    if (!totalSections) return 0;
    const completedSections = sections.filter((section) => isSectionCompleted(subject, section)).length;
    return Math.round((completedSections / totalSections) * 100);
  };

  const createTestSession = async (
    authToken: string,
    payload: {
      subject: string;
      difficulty: 'Easy' | 'Medium' | 'Hard';
      topic: string;
      mode: 'topic' | 'mock' | 'adaptive';
      questionCount: number;
      part?: string;
      chapter?: string;
      section?: string;
    },
  ) => {
    const response = await apiRequest<{ session: { id: string } }>(
      '/api/tests/start',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      authToken,
    );
    return response.session;
  };

  const resolveLaunchToken = async () => resolveLaunchAuthToken(authContextToken);

  const openExamWindow = (params: { sessionId: string; token: string; examWindow: Window | null }) => {
    const { sessionId, token: authToken, examWindow } = params;
    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    const urlAuth = bearerForLaunchUrl(authToken);

    localStorage.setItem(
      'net360-exam-launch',
      JSON.stringify({
        sessionId,
        testType: 'topic',
        ...(urlAuth ? { authToken: urlAuth } : {}),
        launchedAt: Date.now(),
      }),
    );

    const url = urlAuth
      ? `/exam-interface?sessionId=${encodeURIComponent(sessionId)}&testType=topic&authToken=${encodeURIComponent(urlAuth)}`
      : `/exam-interface?sessionId=${encodeURIComponent(sessionId)}&testType=topic`;

    if (isNativeRuntime) {
      // Android WebView commonly blocks popups; navigate in-place after session is ready.
      window.location.href = url;
      return;
    }

    if (!examWindow) {
      toast.error('Popup blocked. Please allow popups and try again.');
      return;
    }

    examWindow.location.href = url;
  };

  const handleStartSectionTest = async (payload: {
    subject: SubjectKey;
    part?: AcademicPart;
    chapterTitle: string;
    sectionTitle: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
  }) => {
    if (launchingRef.current) return;
    launchingRef.current = true;

    const authToken = await resolveLaunchToken();
    if (!authToken) {
      toast.error('Please login first to start a section test from Preparation Materials.');
      launchingRef.current = false;
      return;
    }

    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

    // Blank window first so exam-interface never loads without sessionId (avoids missing-ID flash).
    const examWindow = isNativeRuntime ? null : window.open('about:blank', '_blank', 'width=1400,height=900');
    if (!isNativeRuntime && !examWindow) {
      toast.error('Popup blocked. Please allow popups and try again.');
      launchingRef.current = false;
      return;
    }

    const launchKey = `${payload.subject}|${payload.part || ''}|${payload.chapterTitle}|${payload.sectionTitle}|${payload.difficulty}`;

    try {
      setLaunchingSectionKey(launchKey);
      const session = await createTestSession(authToken, {
        subject: payload.subject,
        difficulty: payload.difficulty,
        topic: payload.sectionTitle,
        mode: 'topic',
        questionCount: 25,
          part: payload.part || '',
        chapter: payload.chapterTitle,
        section: payload.sectionTitle,
      });

      openExamWindow({ sessionId: session.id, token: authToken, examWindow });
      toast.success(isNativeRuntime ? 'Section test launched.' : 'Section test launched in a new window.');
    } catch (error) {
      if (examWindow) examWindow.close();
      console.error('Section test start error:', error);
      toast.error('Could not start your test. Please try again.');
    } finally {
      setLaunchingSectionKey(null);
      launchingRef.current = false;
    }
  };

  const handleStartFlatTopicTest = async (
    tabKey: 'quantitative-mathematics' | 'design-aptitude',
    topicTitle: string,
    difficulty: 'Easy' | 'Medium' | 'Hard',
  ) => {
    if (launchingRef.current) return;
    launchingRef.current = true;

    const authToken = await resolveLaunchToken();
    if (!authToken) {
      toast.error('Please login first to start a topic test from Preparation Materials.');
      launchingRef.current = false;
      return;
    }

    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    const examWindow = isNativeRuntime ? null : window.open('about:blank', '_blank', 'width=1400,height=900');
    if (!isNativeRuntime && !examWindow) {
      toast.error('Popup blocked. Please allow popups and try again.');
      launchingRef.current = false;
      return;
    }

    const launchKey = `${tabKey}|${topicTitle}|${difficulty}`;
    const candidateSubjects = FLAT_TAB_SUBJECT_FALLBACKS[tabKey];
    let lastError: unknown = null;

    try {
      setLaunchingSectionKey(launchKey);

      for (const candidateSubject of candidateSubjects) {
        try {
          const session = await createTestSession(authToken, {
            subject: candidateSubject,
            difficulty,
            topic: topicTitle,
            mode: 'topic',
            questionCount: 25,
          });

          openExamWindow({ sessionId: session.id, token: authToken, examWindow });
          toast.success(isNativeRuntime ? 'Topic test launched.' : 'Topic test launched in a new window.');
          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error ? lastError : new Error('No questions available for this topic.');
    } catch (error) {
      if (examWindow) examWindow.close();
      console.error('Topic test start error:', error);
      toast.error('Could not start your test. Please try again.');
    } finally {
      setLaunchingSectionKey(null);
      launchingRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Preparation Materials</h1>
        <p className="text-muted-foreground">Syllabus browser by subject, part, chapter, and section</p>
      </div>

      <Tabs value={selectedSubject} onValueChange={(value) => setSelectedSubject(value as TabKey)}>
        <div className="net360-horizontal-scroll net360-swipe-row -mx-1 px-1 pb-1">
          <TabsList className="inline-flex h-auto min-w-max flex-nowrap gap-1.5 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-[#eef2ff] via-[#f1ecff] to-[#f5f8ff] p-1.5 shadow-[0_8px_18px_rgba(79,70,229,0.14)] lg:min-w-0 lg:flex-wrap lg:justify-center">
            {tabItems.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                onClick={() => {
                  setSelectedSubject(tab.key);
                  console.log('Selected Subject:', tab.key);
                }}
                className={`!flex-none min-h-[2.55rem] rounded-xl border border-indigo-200/90 bg-white/88 px-3 py-1.5 text-center text-[12px] font-semibold leading-tight tracking-[0.01em] text-slate-700 whitespace-normal break-words transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 hover:shadow-[0_8px_16px_rgba(79,70,229,0.16)] data-[state=active]:-translate-y-0.5 data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!text-white data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)] sm:text-sm ${PREPARATION_TAB_WIDTH_CLASS} ${tabTriggerToneByKey[tab.key].active} ${selectedSubject === tab.key ? 'bg-gradient-to-r from-indigo-600 to-violet-500 !text-white border-indigo-600 shadow-[0_10px_22px_rgba(79,70,229,0.32)] scale-[1.02]' : ''}`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabItems.map((tab) => {
          if (tab.key === 'quantitative-mathematics' || tab.key === 'design-aptitude') {
            const flatKey: 'quantitative-mathematics' | 'design-aptitude' = tab.key;
            const content = FLAT_TOPIC_TABS[flatKey];
            const selectedFlatTopic = selectedFlatTopicByTab[flatKey];
            return (
              <TabsContent key={flatKey} value={flatKey} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{content.title}</CardTitle>
                    <CardDescription>Topic list (no chapter structure for this section)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {content.topics.map((topic) => (
                        <li key={topic}>
                          <button
                            type="button"
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-200 ${selectedFlatTopic === topic ? 'border-transparent bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-[0_10px_18px_rgba(79,70,229,0.3)]' : 'border-indigo-100 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-900'}`}
                            onClick={() => {
                              setSelectedFlatTopicByTab((prev) => ({ ...prev, [flatKey]: topic }));
                              onSelectFlatTopic?.({
                                tabKey: flatKey,
                                subject: flatKey,
                                topicTitle: topic,
                              });
                            }}
                          >
                            {topic}
                          </button>

                          {showStartTestButton && !onSelectFlatTopic && selectedFlatTopic === topic ? (
                            <div className="mt-2 rounded-lg border border-indigo-200 bg-white p-3">
                              <Button
                                className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                                disabled={Boolean(launchingSectionKey)}
                                onClick={() => {
                                  const baseKey = `${flatKey}|${topic}`;
                                  setDifficultyMenuKey((prev) => (prev === baseKey ? null : baseKey));
                                }}
                              >
                                {launchingSectionKey?.startsWith(`${flatKey}|${topic}|`) ? 'Starting...' : 'Start Test'}
                              </Button>

                              {difficultyMenuKey === `${flatKey}|${topic}` ? (
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                  {difficultyLevels.map((difficulty) => {
                                    const currentLaunchKey = `${flatKey}|${topic}|${difficulty}`;
                                    return (
                                      <Button
                                        key={difficulty}
                                        type="button"
                                        variant="outline"
                                        disabled={Boolean(launchingSectionKey)}
                                        onClick={() => {
                                          setDifficultyMenuKey(null);
                                          void handleStartFlatTopicTest(flatKey, topic, difficulty);
                                        }}
                                      >
                                        {launchingSectionKey === currentLaunchKey ? 'Starting...' : difficulty}
                                      </Button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          }

          if (tab.key === 'computer-science' || tab.key === 'intelligence') {
            const subject: SubjectKey = tab.key;
            const chapterOnlySyllabus = subject === 'computer-science' ? COMPUTER_SCIENCE_SYLLABUS : INTELLIGENCE_SYLLABUS;
            const tone = syllabusToneBySubject[subject];
            const selectedChapterId = subject === 'computer-science' ? selectedComputerScienceChapterId : selectedIntelligenceChapterId;
            const selectedSection = subject === 'computer-science' ? selectedComputerScienceSection : selectedIntelligenceSection;
            const setSelectedChapter = subject === 'computer-science' ? setSelectedComputerScienceChapterId : setSelectedIntelligenceChapterId;
            const setSelectedSection = subject === 'computer-science' ? setSelectedComputerScienceSection : setSelectedIntelligenceSection;
            return (
              <TabsContent key={subject} value={subject} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{getSubjectLabel(subject)} Syllabus</CardTitle>
                    <CardDescription>Chapter and section structure (no part split).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {chapterOnlySyllabus.map((chapter) => {
                        const active = selectedChapterId === chapter.id;
                        return (
                          <div
                            key={chapter.id}
                            className={`rounded-xl border transition-all duration-300 ease-out ${active ? tone.chapterActive : `${tone.chapterIdle} ${tone.chapterHover}`} ${!active ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_15px_rgba(15,23,42,0.07)]' : ''}`}
                          >
                            <button
                              type="button"
                              className="w-full p-3 text-left transition-transform duration-200 active:scale-[0.995]"
                              onClick={() => {
                                setSelectedChapter((prev) => (prev === chapter.id ? null : chapter.id));
                                setSelectedSection(null);
                                console.log('Selected Chapter:', chapter.title);
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-indigo-950">{chapter.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">{chapter.sections.length} sections</p>
                                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300 ease-out"
                                      style={{ width: `${getChapterProgressPercent(subject, chapter.sections)}%` }}
                                    />
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-500">{getChapterProgressPercent(subject, chapter.sections)}% completed</p>
                                </div>
                                <ChevronRight className={`h-4 w-4 transition-transform ${active ? `rotate-90 ${tone.chapterAccent}` : 'text-slate-500'}`} />
                              </div>
                            </button>

                            {active ? (
                              <div className={`border-t px-3 pb-3 pt-2 ${tone.panelSurface}`}>
                                <ul className="space-y-2 text-sm">
                                  {chapter.sections.map((section) => (
                                    <li key={section}>
                                      <button
                                        type="button"
                                        className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-300 ease-out active:scale-[0.99] ${selectedSection === `${chapter.id}::${section}` ? `border-transparent bg-gradient-to-r ${tone.sectionActive} text-white ${tone.sectionShadow}` : `border-slate-200/80 bg-white text-slate-700 hover:-translate-y-0.5 ${tone.sectionHover} hover:shadow-[0_8px_14px_rgba(15,23,42,0.07)]`}`}
                                        onClick={() => {
                                          setSelectedSection(`${chapter.id}::${section}`);
                                          console.log('Selected Section:', section);
                                          onSelectSection?.({
                                            subject,
                                            chapterTitle: chapter.title,
                                            sectionTitle: section,
                                          });
                                        }}
                                      >
                                        <span className="flex items-center justify-between gap-2">
                                          <span>{section}</span>
                                          {isSectionCompleted(subject, section) ? (
                                            <span
                                              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] ${selectedSection === `${chapter.id}::${section}` ? 'bg-white/20 text-white' : 'bg-emerald-500 text-white'}`}
                                              title="Completed"
                                            >
                                              ✓
                                            </span>
                                          ) : null}
                                        </span>
                                      </button>

                                      {showStartTestButton && selectedSection === `${chapter.id}::${section}` ? (
                                        <div className={`mt-2 rounded-lg border bg-white p-3 ${tone.panelSurface}`}>
                                          <Button
                                            className={`bg-gradient-to-r ${tone.sectionActive} text-white transition-all duration-200 hover:brightness-105`}
                                            disabled={Boolean(launchingSectionKey)}
                                            onClick={() => {
                                              const baseKey = `${subject}||${chapter.title}|${section}`;
                                              setDifficultyMenuKey((prev) => (prev === baseKey ? null : baseKey));
                                            }}
                                          >
                                            {launchingSectionKey?.startsWith(`${subject}||${chapter.title}|${section}|`) ? 'Starting...' : 'Start Test'}
                                          </Button>

                                          {difficultyMenuKey === `${subject}||${chapter.title}|${section}` ? (
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                              {difficultyLevels.map((difficulty) => {
                                                const currentLaunchKey = `${subject}||${chapter.title}|${section}|${difficulty}`;
                                                return (
                                                  <Button
                                                    key={difficulty}
                                                    type="button"
                                                    variant="outline"
                                                    disabled={Boolean(launchingSectionKey)}
                                                    onClick={() => {
                                                      setDifficultyMenuKey(null);
                                                      void handleStartSectionTest({
                                                        subject,
                                                        chapterTitle: chapter.title,
                                                        sectionTitle: section,
                                                        difficulty,
                                                      });
                                                    }}
                                                  >
                                                    {launchingSectionKey === currentLaunchKey ? 'Starting...' : difficulty}
                                                  </Button>
                                                );
                                              })}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          }

          const subject = tab.key as PartStructuredSubjectKey;
          const tone = syllabusToneBySubject[subject];
          const selectedPart = selectedPartBySubject[subject];
          const currentPart = selectedPart ? SYLLABUS[subject][selectedPart] : null;
          const selectedChapterId = selectedChapterBySubject[subject];
          return (
            <TabsContent key={subject} value={subject} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{getSubjectLabel(subject)} Syllabus</CardTitle>
                  <CardDescription>Select Part 1 or Part 2, then choose a chapter to view all sections.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    {(['part1', 'part2'] as AcademicPart[]).map((part) => {
                      const isSelected = selectedPart === part;
                      const chapterCount = SYLLABUS[subject][part].chapters.length;
                      return (
                        <button
                          key={`${subject}-${part}`}
                          type="button"
                          onClick={() => {
                            setSelectedPartBySubject((prev) => ({ ...prev, [subject]: part }));
                            setSelectedChapterBySubject((prev) => ({ ...prev, [subject]: null }));
                            setSelectedSectionBySubject((prev) => ({ ...prev, [subject]: null }));
                            console.log('Selected Part:', part);
                          }}
                          className={`rounded-xl border p-3 text-left transition-all duration-300 ease-out active:scale-[0.99] ${isSelected ? `border-transparent bg-gradient-to-r ${tone.partActive} text-white ${tone.partShadow}` : `${tone.partIdle} ${tone.partHover} hover:-translate-y-0.5 hover:shadow-[0_10px_16px_rgba(15,23,42,0.08)]`}`}
                        >
                          <p className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-indigo-950'}`}>{SYLLABUS[subject][part].label}</p>
                          <p className={`mt-1 text-xs ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>{chapterCount} chapters</p>
                        </button>
                      );
                    })}
                  </div>

                  {!selectedPart ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">Select Part 1 or Part 2 to continue.</div>
                  ) : !currentPart?.chapters.length ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">No chapters added yet for this part.</div>
                  ) : (
                    <div className="space-y-3">
                      {currentPart.chapters.map((chapter) => {
                        const active = selectedChapterId === chapter.id;
                        return (
                          <div
                            key={chapter.id}
                            className={`rounded-xl border transition-all duration-300 ease-out ${active ? tone.chapterActive : `${tone.chapterIdle} ${tone.chapterHover}`} ${!active ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_15px_rgba(15,23,42,0.07)]' : ''}`}
                          >
                            <button
                              type="button"
                              className="w-full p-3 text-left transition-transform duration-200 active:scale-[0.995]"
                              onClick={() => {
                                setSelectedChapterBySubject((prev) => ({
                                  ...prev,
                                  [subject]: prev[subject] === chapter.id ? null : chapter.id,
                                }));
                                setSelectedSectionBySubject((prev) => ({ ...prev, [subject]: null }));
                                console.log('Selected Chapter:', chapter.title);
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-indigo-950">{chapter.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">{chapter.sections.length} sections</p>
                                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300 ease-out"
                                      style={{ width: `${getChapterProgressPercent(subject, chapter.sections)}%` }}
                                    />
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-500">{getChapterProgressPercent(subject, chapter.sections)}% completed</p>
                                </div>
                                <ChevronRight className={`h-4 w-4 transition-transform ${active ? `rotate-90 ${tone.chapterAccent}` : 'text-slate-500'}`} />
                              </div>
                            </button>

                            {active ? (
                              <div className={`border-t px-3 pb-3 pt-2 ${tone.panelSurface}`}>
                                <ul className="space-y-2 text-sm">
                                  {chapter.sections.map((section) => (
                                    <li key={section}>
                                      <button
                                        type="button"
                                        className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-300 ease-out active:scale-[0.99] ${selectedSectionBySubject[subject] === `${chapter.id}::${section}` ? `border-transparent bg-gradient-to-r ${tone.sectionActive} text-white ${tone.sectionShadow}` : `border-slate-200/80 bg-white text-slate-700 hover:-translate-y-0.5 ${tone.sectionHover} hover:shadow-[0_8px_14px_rgba(15,23,42,0.07)]`}`}
                                        onClick={() => {
                                          const selection = {
                                            subject,
                                            part: selectedPart,
                                            chapterTitle: chapter.title,
                                            sectionTitle: section,
                                          };
                                          setSelectedSectionBySubject((prev) => ({
                                            ...prev,
                                            [subject]: `${chapter.id}::${section}`,
                                          }));
                                          console.log('Selected Section:', section);
                                          onSelectSection?.(selection);
                                        }}
                                      >
                                        <span className="flex items-center justify-between gap-2">
                                          <span>{section}</span>
                                          {isSectionCompleted(subject, section) ? (
                                            <span
                                              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] ${selectedSectionBySubject[subject] === `${chapter.id}::${section}` ? 'bg-white/20 text-white' : 'bg-emerald-500 text-white'}`}
                                              title="Completed"
                                            >
                                              ✓
                                            </span>
                                          ) : null}
                                        </span>
                                      </button>

                                      {showStartTestButton && selectedSectionBySubject[subject] === `${chapter.id}::${section}` ? (
                                        <div className={`mt-2 rounded-lg border bg-white p-3 ${tone.panelSurface}`}>
                                          <Button
                                            className={`bg-gradient-to-r ${tone.sectionActive} text-white transition-all duration-200 hover:brightness-105`}
                                            disabled={Boolean(launchingSectionKey)}
                                            onClick={() => {
                                              const baseKey = `${subject}|${selectedPart}|${chapter.title}|${section}`;
                                              setDifficultyMenuKey((prev) => (prev === baseKey ? null : baseKey));
                                            }}
                                          >
                                            {launchingSectionKey?.startsWith(`${subject}|${selectedPart}|${chapter.title}|${section}|`) ? 'Starting...' : 'Start Test'}
                                          </Button>

                                          {difficultyMenuKey === `${subject}|${selectedPart}|${chapter.title}|${section}` ? (
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                              {difficultyLevels.map((difficulty) => {
                                                const currentLaunchKey = `${subject}|${selectedPart}|${chapter.title}|${section}|${difficulty}`;
                                                return (
                                                  <Button
                                                    key={difficulty}
                                                    type="button"
                                                    variant="outline"
                                                    disabled={Boolean(launchingSectionKey)}
                                                    onClick={() => {
                                                      setDifficultyMenuKey(null);
                                                      void handleStartSectionTest({
                                                        subject,
                                                        part: selectedPart,
                                                        chapterTitle: chapter.title,
                                                        sectionTitle: section,
                                                        difficulty,
                                                      });
                                                    }}
                                                  >
                                                    {launchingSectionKey === currentLaunchKey ? 'Starting...' : difficulty}
                                                  </Button>
                                                );
                                              })}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
