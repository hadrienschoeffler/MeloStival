export type PlayerRole = "host" | "participant";

export interface PublicPlayer {
  sessionId: string;
  nickname: string;
  avatarId: string;
  role: PlayerRole;
  connected: boolean;
  joinedAt: number;
}

export interface PublicRoom {
  code: string;
  status: "lobby" | "playing";
  currentTool: null | "buzzer" | "genshin-guesser" | "crossword";
  hostSessionId: string;
  players: PublicPlayer[];
  buzzer: BuzzerState | null;
  genshin: GenshinState | null;
  crossword: CrosswordState | null;
}

export interface BuzzerState {
  phase: "open" | "buzzed" | "results";
  buzzedSessionId: string | null;
  scores: Record<string, number>;
  oncePerQuestion: boolean;
  excludedSessionIds: string[];
  questionNumber: number;
}

export interface GenshinLocation {
  id: string;
  title: string;
  povImage: string;
  regionMapImage: string;
  gridImage: string;
  answerGridImage: string;
}

export interface GenshinRecapEntry {
  sessionId: string;
  answer: string | null;
  correct: boolean;
  adjacent: boolean;
}

export interface GenshinState {
  phase: "answering" | "recap" | "results";
  locationIndex: number;
  locationCount: number;
  stage: 0 | 1 | 2;
  responseDeadline: number;
  scores: Record<string, number>;
  location: GenshinLocation;
  submittedSessionIds: string[];
  correctAnswer: string | null;
  recap: GenshinRecapEntry[] | null;
}

export interface CrosswordWord {
  id: string;
  number: number;
  clue: string;
  row: number;
  column: number;
  length: number;
  direction: "across" | "down";
}

export interface CrosswordState {
  phase: "playing" | "review" | "results";
  responseDeadline: number;
  rows: number;
  columns: number;
  words: CrosswordWord[];
  letters: Record<string, string>;
  completed: boolean;
  scores: Record<string, number>;
  reviewIndex: number;
  correctionLetters: Record<string, string>;
  activeWordId: string | null;
  revision: number;
}

export type RoomActionResult =
  | { ok: true; room: PublicRoom }
  | { ok: false; error: string; code?: string };
