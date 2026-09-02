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

export type CrosswordGridId = "easy" | "medium" | "hard" | "hardcore";

export interface CrosswordGridDefinition {
  id: CrosswordGridId;
  label: string;
  pointsPerWord: number;
  rows: number;
  columns: number;
  words: CrosswordWordDefinition[];
  cells: Set<string>;
}


export const EASY_CROSSWORD_ENTRIES: CrosswordEntry[] = [
  { answer: "APEP", clue: "Dragon gardien de l'oasis" },
  { answer: "ABYSSE", clue: "Tous les 16 du mois" },
  { answer: "DILUC", clue: "Maître du domaine de l'aurore" },
  { answer: "SAURIEN", clue: "Partenaire des natlanois" },
  { answer: "SORCIERE", clue: "A 7 elles composent l'Hexenzirkel" },
  { answer: "DETECTEUR", clue: "Fait apparaître des trésors aux alentours" },
  { answer: "ENDURANCE", clue: "Pour courir, nager, grimper, planer" },
  { answer: "INVOCATION", clue: "Echange contre des primogemmes" },
  { answer: "CLORINDE", clue: "Duelliste mandaté de Fontaine" },
  { answer: "GOUFFRE", clue: "Mines souterraines" },
  { answer: "PIGEON", clue: "Protégé de Timmy" },
  { answer: "PAIMON", clue: "Guide touristique ou casse-croûte d'urgence" },
  { answer: "INAZUMA", clue: "Région electro" },
  { answer: "BLOB", clue: "créature molle élémentaire" },
  { answer: "MORA", clue: "Monnaie de Teyvat" },
];

export const MEDIUM_CROSSWORD_ENTRIES: CrosswordEntry[] = [
  { answer: "COPPELIA", clue: "Danseuse Artificiée" },
  { answer: "COLLEI", clue: "Garde forestière" },
  { answer: "ISTAROTH", clue: "Ombre du temps" },
  { answer: "SARA", clue: "Serveuse du bon chasseur" },
  { answer: "OROBASHI", clue: "Serpent géant de Yashiori" },
  { answer: "GIVRELUNE", clue: "Clan de Lauma" },
  { answer: "ASHRU", clue: "Chat de Nefer" },
  { answer: "SCARABUTO", clue: "Coléoptère de combat" },
  { answer: "CHUYCHU", clue: "Soeur de Chasca" },
  { answer: "OCEANIDE", clue: "Anciens Fontainois et Fontainoises" },
  { answer: "AJAW", clue: "Majesté saurienne suprême" },
  { answer: "ZANDIK", clue: "Autrement appelé Dottore" },
];

export const HARD_CROSSWORD_ENTRIES: CrosswordEntry[] = [
  { answer: "LISHA", clue: "Entre gouffre et mer de nuages" },
  { answer: "MUSK", clue: "Récif abyssal" },
  { answer: "OCTAVIA", clue: "Sorcière créatrice du Milliastra" },
  { answer: "PRINCE", clue: "Chat Joeur de TCG" },
  { answer: "FISCHL", clue: "Corvus" },
  { answer: "NIBELUNG", clue: "Deuxième descendeur" },
  { answer: "MAMERE", clue: "Melusine peintre" },
  { answer: "ATOCPAN", clue: "Zone du Grand Volcan de Tollan" },
  { answer: "THOLINDIS", clue: "Compagne du Rächer de solnari" },
  { answer: "SIGURD", clue: '"Chasser la chasse"' },
];
export const HARDCORE_CROSSWORD_ENTRIES: CrosswordEntry[] = [
  { answer: "BARBARA", clue: "Toujours le meilleur pour vous" },
  { answer: "YELENA", clue: "Parfum qu'Emilie a concocté elle-même" },
  { answer: "TRISHIRAITE", clue: "Formé à partir de la condensation de l'énergie élémentaire" },
  { answer: "AYIN", clue: "Hypostase Pyro" },
  { answer: "KAMUIJIMA", clue: "Canon pour briser la barrière de Tatarasuna" },
  { answer: "BEISHT", clue: "Epouse d'Osial" },
  { answer: "PRUNE", clue: "20/11" },
  { answer: "SHITOU", clue: "Propriétaire du Mystère des jades" },
  { answer: "YOHUALTECUHTIN", clue: "Seigneur de la nuit" },
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
  if (!prepared.length) throw new Error("Ajoute au moins un mot dans la liste de cette grille.");
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

function createGrid(
  id: CrosswordGridId,
  label: string,
  pointsPerWord: number,
  entries: CrosswordEntry[],
): CrosswordGridDefinition {
  const generatedLayout = generateLayout(entries);
  const starts = new Map<string, { row: number; column: number; directions: Set<Direction> }>();
  for (const word of generatedLayout) {
    const key = cellKey(word.row, word.column);
    const start = starts.get(key);
    if (start) start.directions.add(word.direction);
    else starts.set(key, { row: word.row, column: word.column, directions: new Set([word.direction]) });
  }

  const remainingStarts = [...starts.entries()].sort(([, left], [, right]) =>
    left.row - right.row || left.column - right.column,
  );
  const numberedStarts: string[] = [];
  let nextDirection: Direction = remainingStarts[0]?.[1].directions.has("across") ? "across" : "down";

  // La position des mots ne change pas : seuls leurs numéros alternent entre
  // horizontal et vertical. Un départ commun conserve un numéro commun.
  while (remainingStarts.length > 0) {
    const matchingIndex = remainingStarts.findIndex(([, start]) => start.directions.has(nextDirection));
    const selectedIndex = matchingIndex >= 0 ? matchingIndex : 0;
    const [selected] = remainingStarts.splice(selectedIndex, 1);
    numberedStarts.push(selected[0]);
    nextDirection = nextDirection === "across" ? "down" : "across";
  }

  const numberByStart = new Map(numberedStarts.map((start, index) => [start, index + 1]));
  const words: CrosswordWordDefinition[] = generatedLayout.map((word) => ({
    ...word,
    number: numberByStart.get(cellKey(word.row, word.column))!,
  }));
  const cells = new Set(buildCells(words).keys());
  const coordinates = [...cells].map((key) => key.split(":").map(Number));
  return {
    id,
    label,
    pointsPerWord,
    words,
    cells,
    rows: Math.max(...coordinates.map(([row]) => row)) + 1,
    columns: Math.max(...coordinates.map(([, column]) => column)) + 1,
  };
}

export const CROSSWORD_GRIDS: Record<CrosswordGridId, CrosswordGridDefinition> = {
  easy: createGrid("easy", "Facile", 1, EASY_CROSSWORD_ENTRIES),
  medium: createGrid("medium", "Moyen", 2, MEDIUM_CROSSWORD_ENTRIES),
  hard: createGrid("hard", "Difficile", 3, HARD_CROSSWORD_ENTRIES),
  hardcore: createGrid("hardcore", "Hardcore", 5, HARDCORE_CROSSWORD_ENTRIES),
};

export const CROSSWORD_GRID_ORDER: CrosswordGridId[] = ["easy", "medium", "hard", "hardcore"];

export function isCrosswordGridId(value: unknown): value is CrosswordGridId {
  return typeof value === "string" && CROSSWORD_GRID_ORDER.includes(value as CrosswordGridId);
}

export function crosswordCellExists(gridId: CrosswordGridId, row: number, column: number): boolean {
  return CROSSWORD_GRIDS[gridId].cells.has(cellKey(row, column));
}

export function crosswordIsSolved(gridId: CrosswordGridId, letters: Record<string, string>): boolean {
  return CROSSWORD_GRIDS[gridId].words.every((word) =>
    [...word.answer].every((letter, index) => {
      const row = word.row + (word.direction === "down" ? index : 0);
      const column = word.column + (word.direction === "across" ? index : 0);
      return letters[cellKey(row, column)] === letter;
    }),
  );
}

export function getCrosswordScore(gridId: CrosswordGridId, letters: Record<string, string>): number {
  const grid = CROSSWORD_GRIDS[gridId];
  const correctWords = grid.words.filter((word) =>
    [...word.answer].every((letter, index) => {
      const row = word.row + (word.direction === "down" ? index : 0);
      const column = word.column + (word.direction === "across" ? index : 0);
      return letters[cellKey(row, column)] === letter;
    }),
  ).length;
  return correctWords * grid.pointsPerWord;
}
