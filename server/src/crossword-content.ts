export interface CrosswordEntry {
  answer: string;
  clue: string;
}

export interface CrosswordWordDefinition extends CrosswordEntry {
  id: string;
  number: number;
  row: number;
  column: number;
  direction: "across" | "down";
}

// C'est la seule partie à modifier pour créer une nouvelle grille.
export const CROSSWORD_ENTRIES: CrosswordEntry[] = [
  { answer: "PRISE", clue: "lance de pêche" },
  { answer: "HYPOSTASE", clue: "C'est carré!" },
  { answer: "NARUKAMI", clue: "Sanctuaire de cerisier" },
  { answer: "HEIZOU", clue: "Détective prodige" },
  { answer: "LUMIDOUCE", clue: "Un instrument ou un moyen pratique" },
  { answer: "HULAO", clue: "Qui fait face au mont Aozang" },
  { answer: "FATALITE", clue: "Pierre d'invocation temporaires" },
  { answer: "ENKANOMIYA", clue: "De la nuit blanche à la nuit sans fin" },
  { answer: "LOUPIN", clue: "Concierge" },
  { answer: "ESCOFFIER", clue: "Diablesse des fourneaux" },
  { answer: "ECHO", clue: "Défi de trainé" },
  { answer: "ALCOR", clue: "Vaisseau du crux" },
];

type Direction = "across" | "down";
type PreparedEntry = CrosswordEntry & { id: string };
type Placement = PreparedEntry & { row: number; column: number; direction: Direction };
type Cell = { letter: string; directions: Set<Direction> };

const MAX_SEARCH_VISITS = 150_000;
const cellKey = (row: number, column: number) => `${row}:${column}`;

function normalizeAnswer(answer: string): string {
  return answer.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toUpperCase();
}

function prepareEntries(entries: CrosswordEntry[]): PreparedEntry[] {
  const prepared = entries.map((entry, index) => {
    const answer = normalizeAnswer(entry.answer);
    if (answer.length < 2) throw new Error(`Réponse de mots croisés invalide : « ${entry.answer} ».`);
    if (!entry.clue.trim()) throw new Error(`Définition manquante pour « ${entry.answer} ».`);
    return { answer, clue: entry.clue.trim(), id: `${answer.toLocaleLowerCase("fr")}-${index + 1}` };
  });
  const duplicates = prepared.filter((entry, index) => prepared.findIndex((candidate) => candidate.answer === entry.answer) !== index);
  if (duplicates.length) throw new Error(`Réponse présente plusieurs fois : ${duplicates[0].answer}.`);
  return prepared.sort((left, right) => right.answer.length - left.answer.length);
}

function buildCells(placements: Placement[]): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  for (const word of placements) {
    [...word.answer].forEach((letter, index) => {
      const row = word.row + (word.direction === "down" ? index : 0);
      const column = word.column + (word.direction === "across" ? index : 0);
      const key = cellKey(row, column);
      const existing = cells.get(key);
      if (existing) existing.directions.add(word.direction);
      else cells.set(key, { letter, directions: new Set([word.direction]) });
    });
  }
  return cells;
}

function layoutArea(placements: Placement[]): number {
  const cells = [...buildCells(placements).keys()].map((key) => key.split(":").map(Number));
  const rows = cells.map(([row]) => row);
  const columns = cells.map(([, column]) => column);
  return (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...columns) - Math.min(...columns) + 1);
}

function orientationImbalance(placements: Placement[]): number {
  const across = placements.filter((word) => word.direction === "across").length;
  const down = placements.length - across;
  return Math.abs(across - down);
}

function findPlacements(entry: PreparedEntry, placed: Placement[]): Placement[] {
  const cells = buildCells(placed);
  const candidates = new Map<string, Placement & { crossings: number }>();

  for (const [key, crossingCell] of cells) {
    const [crossingRow, crossingColumn] = key.split(":").map(Number);
    [...entry.answer].forEach((letter, letterIndex) => {
      if (letter !== crossingCell.letter) return;
      for (const direction of ["across", "down"] as const) {
        if (crossingCell.directions.has(direction)) continue;
        const row = crossingRow - (direction === "down" ? letterIndex : 0);
        const column = crossingColumn - (direction === "across" ? letterIndex : 0);
        const before = cellKey(row - (direction === "down" ? 1 : 0), column - (direction === "across" ? 1 : 0));
        const after = cellKey(
          row + (direction === "down" ? entry.answer.length : 0),
          column + (direction === "across" ? entry.answer.length : 0),
        );
        if (cells.has(before) || cells.has(after)) continue;

        let valid = true;
        let crossings = 0;
        [...entry.answer].forEach((candidateLetter, index) => {
          if (!valid) return;
          const candidateRow = row + (direction === "down" ? index : 0);
          const candidateColumn = column + (direction === "across" ? index : 0);
          const existing = cells.get(cellKey(candidateRow, candidateColumn));
          if (existing) {
            if (existing.letter !== candidateLetter || existing.directions.has(direction)) valid = false;
            else crossings += 1;
            return;
          }
          const neighbors = direction === "across"
            ? [cellKey(candidateRow - 1, candidateColumn), cellKey(candidateRow + 1, candidateColumn)]
            : [cellKey(candidateRow, candidateColumn - 1), cellKey(candidateRow, candidateColumn + 1)];
          if (neighbors.some((neighbor) => cells.has(neighbor))) valid = false;
        });
        if (!valid || crossings === 0) continue;
        candidates.set(`${row}:${column}:${direction}`, { ...entry, row, column, direction, crossings });
      }
    });
  }

  return [...candidates.values()]
    .sort((left, right) =>
      orientationImbalance([...placed, left]) - orientationImbalance([...placed, right]) ||
      right.crossings - left.crossings ||
      layoutArea([...placed, left]) - layoutArea([...placed, right]),
    );
}

function generateLayout(entries: CrosswordEntry[]): Placement[] {
  const prepared = prepareEntries(entries);
  if (!prepared.length) throw new Error("Ajoute au moins un mot dans CROSSWORD_ENTRIES.");
  const seed: Placement = { ...prepared[0], row: 0, column: 0, direction: "across" };
  let visits = 0;
  let best: Placement[] = [seed];
  let bestComplete: Placement[] | null = null;

  function search(placed: Placement[], remaining: PreparedEntry[]): Placement[] | null {
    visits += 1;
    if (visits > MAX_SEARCH_VISITS) return null;
    if (placed.length > best.length) best = placed;
    if (!remaining.length) {
      if (
        !bestComplete ||
        orientationImbalance(placed) < orientationImbalance(bestComplete) ||
        (orientationImbalance(placed) === orientationImbalance(bestComplete) && layoutArea(placed) < layoutArea(bestComplete))
      ) bestComplete = placed;
      return orientationImbalance(placed) <= 1 ? placed : null;
    }

    const choices = remaining
      .map((entry) => ({ entry, candidates: findPlacements(entry, placed) }))
      .filter((choice) => choice.candidates.length > 0)
      .sort((left, right) => left.candidates.length - right.candidates.length);

    for (const choice of choices) {
      const nextRemaining = remaining.filter((entry) => entry.id !== choice.entry.id);
      for (const candidate of choice.candidates.slice(0, 24)) {
        const result = search([...placed, candidate], nextRemaining);
        if (result) return result;
      }
    }
    return null;
  }

  const balancedResult = search([seed], prepared.slice(1));
  const result: Placement[] | null = balancedResult ?? bestComplete;
  if (!result) {
    const placedIds = new Set(best.map((word) => word.id));
    const missing = prepared.filter((entry) => !placedIds.has(entry.id)).map((entry) => entry.answer);
    throw new Error(`Impossible de générer une grille complète. Mots non placés : ${missing.join(", ")}.`);
  }

  const cells = [...buildCells(result).keys()].map((key) => key.split(":").map(Number));
  const minRow = Math.min(...cells.map(([row]) => row));
  const minColumn = Math.min(...cells.map(([, column]) => column));
  return result.map((word) => ({ ...word, row: word.row - minRow, column: word.column - minColumn }));
}

const generatedLayout = generateLayout(CROSSWORD_ENTRIES);
const numberedStarts = [...new Set(generatedLayout.map((word) => cellKey(word.row, word.column)))]
  .sort((left, right) => {
    const [leftRow, leftColumn] = left.split(":").map(Number);
    const [rightRow, rightColumn] = right.split(":").map(Number);
    return leftRow - rightRow || leftColumn - rightColumn;
  });
const numberByStart = new Map(numberedStarts.map((start, index) => [start, index + 1]));

export const CROSSWORD_WORDS: CrosswordWordDefinition[] = generatedLayout.map((word) => ({
  ...word,
  number: numberByStart.get(cellKey(word.row, word.column))!,
}));

const generatedCells = buildCells(CROSSWORD_WORDS);
const generatedCoordinates = [...generatedCells.keys()].map((key) => key.split(":").map(Number));
export const CROSSWORD_ROWS = Math.max(...generatedCoordinates.map(([row]) => row)) + 1;
export const CROSSWORD_COLUMNS = Math.max(...generatedCoordinates.map(([, column]) => column)) + 1;

export function crosswordCellExists(row: number, column: number): boolean {
  return generatedCells.has(cellKey(row, column));
}

export function crosswordIsSolved(letters: Record<string, string>): boolean {
  return CROSSWORD_WORDS.every((word) =>
    [...word.answer].every((letter, index) => {
      const row = word.row + (word.direction === "down" ? index : 0);
      const column = word.column + (word.direction === "across" ? index : 0);
      return letters[cellKey(row, column)] === letter;
    }),
  );
}

export function getCrosswordScore(letters: Record<string, string>): number {
  return CROSSWORD_WORDS.filter((word) =>
    [...word.answer].every((letter, index) => {
      const row = word.row + (word.direction === "down" ? index : 0);
      const column = word.column + (word.direction === "across" ? index : 0);
      return letters[cellKey(row, column)] === letter;
    }),
  ).length;
}
