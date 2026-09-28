/**
 * Canonical NET360 syllabus. Used by Preparation Materials (frontend) and Videos (API).
 * Do not add a second syllabus tree.
 */

export const SUBJECT_TABS = [
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

export const PART_STRUCTURED_SUBJECTS = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
export const CHAPTER_ONLY_SUBJECTS = ['computer-science', 'intelligence'];
export const FLAT_TOPIC_SUBJECTS = ['quantitative-mathematics', 'design-aptitude'];

export const SUBJECT_FOLDER = {
  mathematics: 'Mathematics',
  physics: 'Physics',
  english: 'English',
  biology: 'Biology',
  chemistry: 'Chemistry',
  'computer-science': 'Computer-Science',
  intelligence: 'Intelligence',
  'quantitative-mathematics': 'Quantitative-Mathematics',
  'design-aptitude': 'Design-Aptitude',
};

export const FLAT_TOPIC_TABS = {
  'quantitative-mathematics': {
    title: 'Quantitative Mathematics',
    topics: ['Algebra', 'Ratios & proportions', 'Arithmetic', 'Graphs', 'Functions'],
  },
  'design-aptitude': {
    title: 'Design Aptitude',
    topics: ['Spatial reasoning', 'Visual perception', 'Pattern recognition', 'Sketching basics', 'Creativity and design thinking', 'Basic statistics'],
  },
};

export const RAW_COMPUTER_SCIENCE_SYLLABUS = [
  { id: 'cs-c1', title: 'Chapter 1 - Computer Fundamentals', sections: ['Introduction to Computers', 'Computer Architecture', 'Basic Terminology'] },
  { id: 'cs-c2', title: 'Chapter 2 - Programming in C++', sections: ['Elements of C++', 'Decision Constructs', 'Loops', 'Functions', 'File Handling'] },
  { id: 'cs-c3', title: 'Chapter 3 - Object-Oriented Programming (OOP)', sections: ['Classes', 'Objects', 'Encapsulation', 'Polymorphism', 'Inheritance'] },
  { id: 'cs-c4', title: 'Chapter 4 - Data Structures & Algorithms', sections: ['Arrays', 'Data Structures', 'Performance Analysis of Algorithms'] },
  { id: 'cs-c5', title: 'Chapter 5 - Database Management System', sections: ['Basics of Microsoft Access', 'Database Design Processes', 'Normalization', 'Data Integrity'] },
  { id: 'cs-c6', title: 'Chapter 6 - Operating Systems & Networks', sections: ['Basics of Operating Systems', 'Data Communications', 'Networking Fundamentals'] },
  { id: 'cs-c7', title: 'Chapter 7 - Additional Topics', sections: ['Artificial Intelligence', 'Software Engineering', 'Web Engineering', 'Digital Logic Design'] },
];

export const RAW_INTELLIGENCE_SYLLABUS = [
  { id: 'iq-c1', title: 'Chapter 1 - Analytical Reasoning', sections: ['Logical Scenarios', 'Logical Deductions'] },
  { id: 'iq-c2', title: 'Chapter 2 - Coding & Decoding', sections: ['Letter-Based Puzzles', 'Number-Based Puzzles'] },
  { id: 'iq-c3', title: 'Chapter 3 - Direction Sense', sections: ['Movement Problems', 'Relative Position Questions'] },
  { id: 'iq-c4', title: 'Chapter 4 - Odd One Out', sections: ['Series Anomalies', 'Pattern Exceptions'] },
  { id: 'iq-c5', title: 'Chapter 5 - Series Completion', sections: ['Number Series Patterns', 'Figure Series Patterns'] },
  { id: 'iq-c6', title: 'Chapter 6 - Critical Thinking', sections: ['Problem Solving', 'Pattern Recognition'] },
];

export const RAW_SYLLABUS = {
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
        { id: 'p1-c3', title: 'Chapter 3 - Motion and Force', sections: ['3.1 Displacement Velocity and Acceleration', '3.2 Equations of Motion', '3.3 Projectile Motion', "3.4 Newton's Laws of Motion", '3.5 Friction'] },
        { id: 'p1-c4', title: 'Chapter 4 - Work and Energy', sections: ['4.1 Work Done by Constant Force', '4.2 Work Done by Variable Force', '4.3 Kinetic Energy', '4.4 Potential Energy', '4.5 Conservation of Energy', '4.6 Power'] },
        { id: 'p1-c5', title: 'Chapter 5 - Circular Motion', sections: ['5.1 Angular Motion', '5.2 Centripetal Force', '5.3 Centrifugal Force', '5.4 Banking of Roads', '5.5 Motion of Satellites'] },
        { id: 'p1-c6', title: 'Chapter 6 - Fluid Dynamics', sections: ['6.1 Fluid Pressure', "6.2 Pascal's Law", '6.3 Archimedes Principle', "6.4 Bernoulli's Equation", '6.5 Viscosity'] },
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
        { id: 'p2-c12', title: 'Chapter 12 - Electrostatics', sections: ['12.1 Electric Charge', "12.2 Coulomb's Law", '12.3 Electric Field', '12.4 Electric Field Lines', '12.5 Electric Potential', '12.6 Capacitors'] },
        { id: 'p2-c13', title: 'Chapter 13 - Current Electricity', sections: ['13.1 Electric Current', "13.2 Ohm's Law", '13.3 Electrical Resistance', '13.4 Combination of Resistors', "13.5 Kirchhoff's Laws", '13.6 Electrical Energy and Power'] },
        { id: 'p2-c14', title: 'Chapter 14 - Electromagnetism', sections: ['14.1 Magnetic Field', '14.2 Magnetic Force on Current Carrying Conductor', '14.3 Magnetic Field due to Current', '14.4 Force on Moving Charge', '14.5 Galvanometer'] },
        { id: 'p2-c15', title: 'Chapter 15 - Electromagnetic Induction', sections: ['15.1 Electromagnetic Induction', "15.2 Faraday's Law", "15.3 Lenz's Law", '15.4 Induced EMF', '15.5 AC Generator', '15.6 Transformer'] },
        { id: 'p2-c16', title: 'Chapter 16 - Alternating Current', sections: ['16.1 Alternating Current', '16.2 AC Circuits', '16.3 Capacitive and Inductive Circuits', '16.4 Resonance in AC Circuits', '16.5 Power in AC Circuits'] },
        { id: 'p2-c17', title: 'Chapter 17 - Physics of Solids', sections: ['17.1 Crystal Structure', '17.2 Elasticity', '17.3 Stress and Strain', "17.4 Young's Modulus"] },
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

export function slugifyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

export function subjectLabel(subjectId) {
  return SUBJECT_TABS.find((item) => item.key === subjectId)?.label || String(subjectId || '');
}

export function partFolderName(partId) {
  if (partId === 'part1') return 'Part-1';
  if (partId === 'part2') return 'Part-2';
  return 'General';
}

export function partDisplayLabel(partId, partLabel) {
  if (partLabel) return partLabel;
  if (partId === 'part1') return 'Part 1';
  if (partId === 'part2') return 'Part 2';
  return '';
}

export function topicIdForChapter(chapterId) {
  return `${chapterId}::topic`;
}

export function buildSectionId({ subjectId, partId, chapterId, topicId, sectionTitle }) {
  return [
    String(subjectId || '').trim(),
    String(partId || 'none').trim() || 'none',
    String(chapterId || 'none').trim() || 'none',
    String(topicId || 'none').trim() || 'none',
    slugifyKey(sectionTitle),
  ].join('::');
}

function pushSection(list, node) {
  list.push(node);
}

export function flattenSyllabusSections() {
  const list = [];

  PART_STRUCTURED_SUBJECTS.forEach((subjectId) => {
    const subjectParts = RAW_SYLLABUS[subjectId];
    ['part1', 'part2'].forEach((partId) => {
      const part = subjectParts?.[partId];
      (part?.chapters || []).forEach((chapter) => {
        const topicId = topicIdForChapter(chapter.id);
        (chapter.sections || []).forEach((sectionTitle) => {
          pushSection(list, {
            subjectId,
            subject: subjectLabel(subjectId),
            partId,
            part: partDisplayLabel(partId, part.label),
            chapterId: chapter.id,
            chapter: chapter.title,
            topicId,
            topic: chapter.title,
            sectionId: buildSectionId({
              subjectId,
              partId,
              chapterId: chapter.id,
              topicId,
              sectionTitle,
            }),
            section: sectionTitle,
          });
        });
      });
    });
  });

  CHAPTER_ONLY_SUBJECTS.forEach((subjectId) => {
    const chapters = subjectId === 'computer-science' ? RAW_COMPUTER_SCIENCE_SYLLABUS : RAW_INTELLIGENCE_SYLLABUS;
    chapters.forEach((chapter) => {
      const topicId = topicIdForChapter(chapter.id);
      (chapter.sections || []).forEach((sectionTitle) => {
        pushSection(list, {
          subjectId,
          subject: subjectLabel(subjectId),
          partId: '',
          part: '',
          chapterId: chapter.id,
          chapter: chapter.title,
          topicId,
          topic: chapter.title,
          sectionId: buildSectionId({
            subjectId,
            partId: '',
            chapterId: chapter.id,
            topicId,
            sectionTitle,
          }),
          section: sectionTitle,
        });
      });
    });
  });

  FLAT_TOPIC_SUBJECTS.forEach((subjectId) => {
    const chapterId = `${subjectId}::topics`;
    const topicChapterTitle = `${FLAT_TOPIC_TABS[subjectId].title} Topics`;
    (FLAT_TOPIC_TABS[subjectId].topics || []).forEach((topicTitle) => {
      const topicId = `${chapterId}::${slugifyKey(topicTitle)}`;
      pushSection(list, {
        subjectId,
        subject: subjectLabel(subjectId),
        partId: '',
        part: '',
        chapterId,
        chapter: topicChapterTitle,
        topicId,
        topic: topicTitle,
        sectionId: buildSectionId({
          subjectId,
          partId: '',
          chapterId,
          topicId,
          sectionTitle: topicTitle,
        }),
        section: topicTitle,
      });
    });
  });

  return list;
}

const SECTION_BY_ID = new Map(flattenSyllabusSections().map((item) => [item.sectionId, item]));

export function resolveSyllabusSection(sectionId) {
  return SECTION_BY_ID.get(String(sectionId || '').trim()) || null;
}

export function listSyllabusSubjects() {
  return SUBJECT_TABS.map((item) => ({
    id: item.key,
    subjectId: item.key,
    label: item.label,
    kind: PART_STRUCTURED_SUBJECTS.includes(item.key)
      ? 'parts'
      : CHAPTER_ONLY_SUBJECTS.includes(item.key)
        ? 'chapters'
        : 'topics',
  }));
}

export function listSyllabusParts(subjectId) {
  if (!PART_STRUCTURED_SUBJECTS.includes(subjectId)) return [];
  const subjectParts = RAW_SYLLABUS[subjectId];
  return ['part1', 'part2'].map((partId) => ({
    id: partId,
    partId,
    label: partDisplayLabel(partId, subjectParts?.[partId]?.label),
  }));
}

export function listSyllabusChapters(subjectId, partId) {
  if (PART_STRUCTURED_SUBJECTS.includes(subjectId)) {
    const chapters = RAW_SYLLABUS[subjectId]?.[partId]?.chapters || [];
    return chapters.map((chapter) => ({
      id: chapter.id,
      chapterId: chapter.id,
      title: chapter.title,
      topicId: topicIdForChapter(chapter.id),
      topic: chapter.title,
      sections: chapter.sections || [],
    }));
  }
  if (subjectId === 'computer-science' || subjectId === 'intelligence') {
    const chapters = subjectId === 'computer-science' ? RAW_COMPUTER_SCIENCE_SYLLABUS : RAW_INTELLIGENCE_SYLLABUS;
    return chapters.map((chapter) => ({
      id: chapter.id,
      chapterId: chapter.id,
      title: chapter.title,
      topicId: topicIdForChapter(chapter.id),
      topic: chapter.title,
      sections: chapter.sections || [],
    }));
  }
  if (FLAT_TOPIC_SUBJECTS.includes(subjectId)) {
    const chapterId = `${subjectId}::topics`;
    const title = `${FLAT_TOPIC_TABS[subjectId].title} Topics`;
    return [{
      id: chapterId,
      chapterId,
      title,
      topicId: chapterId,
      topic: title,
      sections: FLAT_TOPIC_TABS[subjectId].topics || [],
    }];
  }
  return [];
}

export function listSyllabusSections(subjectId, partId, chapterId) {
  const chapters = listSyllabusChapters(subjectId, partId);
  const chapter = chapters.find((item) => item.chapterId === chapterId);
  if (!chapter) return [];
  return (chapter.sections || []).map((sectionTitle) => {
    const topicId = FLAT_TOPIC_SUBJECTS.includes(subjectId)
      ? `${chapter.chapterId}::${slugifyKey(sectionTitle)}`
      : chapter.topicId;
    const node = {
      subjectId,
      subject: subjectLabel(subjectId),
      partId: partId || '',
      part: partDisplayLabel(partId, RAW_SYLLABUS[subjectId]?.[partId]?.label),
      chapterId: chapter.chapterId,
      chapter: chapter.title,
      topicId,
      topic: FLAT_TOPIC_SUBJECTS.includes(subjectId) ? sectionTitle : chapter.topic,
      section: sectionTitle,
    };
    return {
      ...node,
      sectionId: buildSectionId({
        subjectId,
        partId: partId || '',
        chapterId: chapter.chapterId,
        topicId,
        sectionTitle,
      }),
    };
  });
}

export function buildR2Prefix(node) {
  const subjectFolder = SUBJECT_FOLDER[node.subjectId] || slugifyKey(node.subjectId);
  const segments = [subjectFolder];
  if (node.partId) segments.push(partFolderName(node.partId));
  if (node.chapterId) {
    segments.push(`${node.chapterId}-${slugifyKey(node.chapter || node.chapterId)}`);
  }
  if (node.section) {
    segments.push(`Section-${slugifyKey(node.section)}`);
  }
  return `${segments.join('/')}/`;
}

export function buildVideoObjectKey(node, { displayOrder, title, ext = 'mp4' }) {
  const order = String(Math.max(1, Number(displayOrder) || 1)).padStart(3, '0');
  const file = `${order}-${slugifyKey(title)}.${String(ext || 'mp4').replace(/^\./, '')}`;
  return `${buildR2Prefix(node)}${file}`;
}

export function buildThumbnailObjectKey(videoObjectKey) {
  const prefix = String(videoObjectKey || '').replace(/\/[^/]+$/, '/');
  const base = String(videoObjectKey || '').split('/').pop() || 'video';
  const stem = base.replace(/\.[^.]+$/, '');
  return `${prefix}thumbnails/${stem}.jpg`;
}

export function publicHierarchyPayload() {
  return listSyllabusSubjects().map((subject) => {
    const parts = listSyllabusParts(subject.subjectId);
    return {
      ...subject,
      parts: parts.length
        ? parts.map((part) => ({
          ...part,
          chapters: listSyllabusChapters(subject.subjectId, part.partId).map((chapter) => ({
            id: chapter.chapterId,
            chapterId: chapter.chapterId,
            title: chapter.title,
            topicId: chapter.topicId,
            topic: chapter.topic,
            sections: listSyllabusSections(subject.subjectId, part.partId, chapter.chapterId).map((section) => ({
              sectionId: section.sectionId,
              title: section.section,
              topicId: section.topicId,
              topic: section.topic,
            })),
          })),
        }))
        : [{
          id: '',
          partId: '',
          label: '',
          chapters: listSyllabusChapters(subject.subjectId, '').map((chapter) => ({
            id: chapter.chapterId,
            chapterId: chapter.chapterId,
            title: chapter.title,
            topicId: chapter.topicId,
            topic: chapter.topic,
            sections: listSyllabusSections(subject.subjectId, '', chapter.chapterId).map((section) => ({
              sectionId: section.sectionId,
              title: section.section,
              topicId: section.topicId,
              topic: section.topic,
            })),
          })),
        }],
    };
  });
}
