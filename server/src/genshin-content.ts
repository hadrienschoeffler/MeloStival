export interface GenshinLocationDefinition {
  id: string;
  title: string;
  povImage: string;
  regionMapImage: string | string[];
  gridImage: string;
  answerGridImage: string;
  answers: [string[], string[], string[]];
}

// Les réponses restent côté serveur : elles ne sont envoyées aux joueurs
// qu'au moment du récapitulatif de la localisation.
export const GENSHIN_LOCATIONS: GenshinLocationDefinition[] = [
  {
    id: "1",
    title: "Colline Sifflante",
    povImage: "/genshin/Lieu1/Lieu_1.png",
    regionMapImage: "/genshin/Lieu1/Mondstadt.png",
    gridImage: "/genshin/Lieu1/Colline_sifflante.png",
    answerGridImage: "/genshin/Lieu1/Reponse_Lieu_1.png",
    answers: [["Mondstadt"], ["Colline Sifflante"], ["F13", "F 13"]],
  },
  {
    id: "2",
    title: "Vaisseau voyageur",
    povImage: "/genshin/Lieu2/Lieu_2.png",
    regionMapImage: ["/genshin/Lieu2/lune_p1.png", "/genshin/Lieu2/lune_p2.png"],
    gridImage: "/genshin/Lieu2/Cercle_de_pierre_de_nuur.png",
    answerGridImage: "/genshin/Lieu2/Reponse_Lieu2.png",
    answers: [["Lune"], ["Cercle de pierre de nuur"], ["N18", "N 18"]],
  },
  {
    id: "3",
    title: "Corne arrachée Nodkrai",
    povImage: "/genshin/Lieu3/Lieu_3.png",
    regionMapImage: ["/genshin/Lieu3/Nod_krai_p1.png", "/genshin/Lieu3/Nod_krai_p2.png"],
    gridImage: "/genshin/Lieu3/Ile_de_Paha.png",
    answerGridImage: "/genshin/Lieu3/Reponse_Lieu3.png",
    answers: [["Nodkrai"], ["Ile de Paha", "Île de Paha"], ["K10", "K 10"]],
  },
  {
    id: "4",
    title: "Cascade inazuma",
    povImage: "/genshin/Lieu4/Lieu_4.png",
    regionMapImage: "/genshin/Lieu4/Inazuma.png",
    gridImage: "/genshin/Lieu4/Ile_de_Watatsumi.png",
    answerGridImage: "/genshin/Lieu4/Reponse_Lieu4.png",
    answers: [["Inazuma"], ["Ile de Watatsumi", "Île de Watatsumi", "Watatsumi"], ["E19", "E 19"]],
  },
  {
    id: "5",
    title: "escalier temple désert",
    povImage: "/genshin/Lieu5/Lieu_5.png",
    regionMapImage: "/genshin/Lieu5/temple_de_lespace.png",
    gridImage: "/genshin/Lieu5/Pavillon_du_desert.png",
    answerGridImage: "/genshin/Lieu5/Reponse_Lieu5.png",
    answers: [["Temple de l'Espace"], ["Pavillon du Désert", "Pavillon du Desert"], ["G6", "G 6"]],
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
