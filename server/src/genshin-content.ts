export interface GenshinLocationDefinition {
  id: string;
  title: string;
  povImage: string;
  regionMapImage: string;
  gridImage: string;
  answerGridImage: string;
  answers: [string[], string[], string[]];
}

// Les réponses restent côté serveur : elles ne sont envoyées aux joueurs
// qu'au moment du récapitulatif de la localisation.
export const GENSHIN_LOCATIONS: GenshinLocationDefinition[] = [
  {
    id: "1",
    title: "Entrée d'Enkanomiya",
    povImage: "/genshin/Lieu_1.png",
    regionMapImage: "/genshin/Enkanomiya.PNG",
    gridImage: "/genshin/entree.PNG",
    answerGridImage: "/genshin/reponse_entree.PNG",
    answers: [["Enkanomiya"], ["Entrée", "Entree"], ["F15", "F 15"]],
  },
  {
    id: "2",
    title: "Entrée d'Enkanomiya",
    povImage: "/genshin/Lieu_1.png",
    regionMapImage: "/genshin/Enkanomiya.PNG",
    gridImage: "/genshin/entree.PNG",
    answerGridImage: "/genshin/reponse_entree.PNG",
    answers: [["Enkanomiya"], ["Entrée", "Entree"], ["F15", "F 15"]],
  },
];

export function normalizeGenshinAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

export function isCorrectGenshinAnswer(value: string, acceptedAnswers: string[]): boolean {
  const normalized = normalizeGenshinAnswer(value);
  return acceptedAnswers.some((answer) => normalizeGenshinAnswer(answer) === normalized);
}

function parseGridCell(value: string): { column: number; row: number } | null {
  const match = normalizeGenshinAnswer(value).replace(/\s/g, "").match(/^([a-z]+)(\d+)$/);
  if (!match) return null;

  const column = [...match[1]].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 96, 0);
  const row = Number(match[2]);
  if (!Number.isSafeInteger(row) || row < 1) return null;
  return { column, row };
}

export function getGenshinAnswerPoints(
  value: string,
  acceptedAnswers: string[],
  stage: 0 | 1 | 2,
): number {
  if (isCorrectGenshinAnswer(value, acceptedAnswers)) return stage === 2 ? 2 : 1;
  if (stage !== 2) return 0;

  const submittedCell = parseGridCell(value);
  const expectedCell = parseGridCell(acceptedAnswers[0] ?? "");
  if (!submittedCell || !expectedCell) return 0;

  const columnDistance = Math.abs(submittedCell.column - expectedCell.column);
  const rowDistance = Math.abs(submittedCell.row - expectedCell.row);
  return columnDistance <= 1 && rowDistance <= 1 ? 1 : 0;
}
