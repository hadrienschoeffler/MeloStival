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
