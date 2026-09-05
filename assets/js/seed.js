// A starter timetable, so a new account is not an empty grid.
//
// This is the 10-Green week: seven periods a day, Monday to Friday, with the
// real bell times. Change it in Settings once you are in — nothing here is
// fixed, it is only what the app starts with.

export const PERIODS = [
  { period: 1, start: 8 * 60 + 30, end: 9 * 60 + 15 },
  { period: 2, start: 9 * 60 + 20, end: 10 * 60 + 5 },
  { period: 3, start: 10 * 60 + 10, end: 10 * 60 + 55 },
  { period: 4, start: 11 * 60 + 25, end: 12 * 60 + 10 },
  { period: 5, start: 12 * 60 + 15, end: 13 * 60 + 0 },
  { period: 6, start: 14 * 60 + 0, end: 14 * 60 + 45 },
  { period: 7, start: 14 * 60 + 50, end: 15 * 60 + 35 },
];

const A10 = ['A10', '201, 203, 104', '-14, -1, -44'];
const B10 = ['B10', '104, 202, 201', '5 Teachers'];
const MATH = ['Math', '101', '-29, -11'];

// [code, room, teacher] per period; null is a free period.
export const GRID = {
  0: [['KS', '109', '-7'], B10, B10, MATH, A10, A10, ['PreYouth', '207', '*23']],
  1: [['His_Uzb', '206', '-2'], MATH, ['Edu', '207', '-9'], B10, B10,
      ['English', '107', '-7'], ['PhysEd', 'S-zal', '-5']],
  2: [['English', '107', '-7'], MATH, ['GP', '205', '*6, -50'],
      ['PreYouth', '207', '*23'], ['PhysEd', 'S-zal', '-5'], A10, A10],
  3: [MATH, ['NatLang/Uzb_Lit', '106', '-13'], ['NatLang', '106', '-13'],
      ['His_World', '206', '-2'], A10, A10, ['Russian', '105', 'VacPhy']],
  4: [['Law', '205', '*48'], MATH, B10, B10, ['Russian', '109', 'VacPhy'],
      ['Uzb_Lit', '106', '-13'], null],
};

// Longer names only where the abbreviation has an obvious expansion.
export const NAMES = {
  Math: 'Mathematics',
  Uzb_Lit: 'Uzbek Literature',
  NatLang: 'Native Language',
  'NatLang/Uzb_Lit': 'Native Language / Uzbek Lit',
  His_Uzb: 'History of Uzbekistan',
  His_World: 'World History',
  PhysEd: 'Physical Education',
  PreYouth: 'Pre-Youth',
  GP: 'Global Perspectives',
  KS: 'Kasb-hunar',
  Edu: 'Education',
};

// Distinct hues so a subject is recognisable at a glance in the grid.
const COLORS = ['#E2C044', '#8FB8F0', '#7E9E8C', '#C97F6A', '#B49CD8',
                '#6FB3A8', '#D89B7A', '#9AB07E', '#E08A9E', '#7FA8C9',
                '#C4A96A', '#8E9099'];

export function seedRows(ownerId, uuid) {
  const codes = [];
  for (const row of Object.values(GRID)) {
    for (const cell of row) if (cell && !codes.includes(cell[0])) codes.push(cell[0]);
  }

  const subjects = codes.map((code, i) => ({
    id: uuid(), owner_id: ownerId, code,
    name: NAMES[code] || code, color: COLORS[i % COLORS.length],
    position: i, archived: false,
  }));
  const byCode = Object.fromEntries(subjects.map((s) => [s.code, s.id]));

  const lessons = [];
  for (const [dow, row] of Object.entries(GRID)) {
    row.forEach((cell, i) => {
      if (!cell) return;
      const p = PERIODS[i];
      lessons.push({
        id: uuid(), owner_id: ownerId, subject_id: byCode[cell[0]],
        dow: Number(dow), period: p.period, start_min: p.start, end_min: p.end,
        title: NAMES[cell[0]] || cell[0], room: cell[1], teacher: cell[2],
      });
    });
  }
  return { subjects, lessons };
}
