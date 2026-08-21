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
  currentTool: null | "buzzer" | "genshin-guesser";
  hostSessionId: string;
  players: PublicPlayer[];
  buzzer: BuzzerState | null;
  genshin: GenshinState | null;
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

export type RoomActionResult =
  | { ok: true; room: PublicRoom }
  | { ok: false; error: string; code?: string };
