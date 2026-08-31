import type { CrosswordGridId } from "./crossword-content.js";

export type PlayerRole = "host" | "participant";
export type ToolId = "buzzer" | "genshin-guesser" | "crossword";

export interface Player {
  sessionId: string;
  socketId: string | null;
  nickname: string;
  avatarId: string;
  role: PlayerRole;
  connected: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
}

export interface Room {
  code: string;
  status: "lobby" | "playing";
  currentTool: ToolId | null;
  hostSessionId: string;
  players: Map<string, Player>;
  buzzer: BuzzerState | null;
  genshin: GenshinState | null;
  crossword: CrosswordState | null;
  createdAt: number;
}

export interface BuzzerState {
  phase: "open" | "buzzed" | "results";
  buzzedSessionId: string | null;
  scores: Record<string, number>;
  oncePerQuestion: boolean;
  excludedSessionIds: string[];
  questionNumber: number;
}

export interface GenshinState {
  phase: "answering" | "recap" | "results";
  locationIndex: number;
  stage: 0 | 1 | 2;
  responseDeadline: number;
  scores: Record<string, number>;
  revealedScores: Record<string, number>;
  responses: Record<string, Array<string | null>>;
  acceptedOverrides: Record<string, boolean[]>;
}

export interface CrosswordState {
  phase: "setup" | "playing" | "review" | "results";
  responseDeadline: number;
  lettersBySession: Record<string, Partial<Record<CrosswordGridId, Record<string, string>>>>;
  selectedGridBySession: Record<string, CrosswordGridId | undefined>;
  activeGridBySession: Record<string, CrosswordGridId | undefined>;
  completedSessionIds: string[];
  scores: Record<string, number>;
  reviewGridIndex: number;
  reviewWordIndex: number;
  revision: number;
}

export interface PublicCrosswordWord {
  id: string;
  number: number;
  clue: string;
  row: number;
  column: number;
  length: number;
  direction: "across" | "down";
}

export interface PublicCrosswordGrid {
  id: CrosswordGridId;
  label: string;
  pointsPerWord: number;
  rows: number;
  columns: number;
  words: PublicCrosswordWord[];
}

export interface PublicCrosswordState {
  phase: CrosswordState["phase"];
  responseDeadline: number;
  scores: Record<string, number>;
  selectedSessionIds: string[];
  reviewGridId: CrosswordGridId | null;
  reviewWordIndex: number;
  correctionLetters: Record<string, string>;
  activeWordId: string | null;
  revision: number;
  grids: PublicCrosswordGrid[];
}

export interface PublicGenshinLocation {
  id: string;
  title: string;
  povImage: string;
  regionMapImage: string;
  gridImage: string;
  answerGridImage: string;
}

export interface PublicGenshinRecapEntry {
  sessionId: string;
  answer: string | null;
  correct: boolean;
  adjacent: boolean;
}

export interface PublicGenshinState {
  phase: GenshinState["phase"];
  locationIndex: number;
  locationCount: number;
  stage: 0 | 1 | 2;
  responseDeadline: number;
  scores: Record<string, number>;
  location: PublicGenshinLocation;
  submittedSessionIds: string[];
  correctAnswer: string | null;
  recap: PublicGenshinRecapEntry[] | null;
}

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
  currentTool: ToolId | null;
  hostSessionId: string;
  players: PublicPlayer[];
  buzzer: BuzzerState | null;
  genshin: PublicGenshinState | null;
  crossword: PublicCrosswordState | null;
}

export type RoomActionResult =
  | { ok: true; room: PublicRoom }
  | { ok: false; error: string; code?: string };
