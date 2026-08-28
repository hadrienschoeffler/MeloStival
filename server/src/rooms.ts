import { randomInt } from "node:crypto";
import { GENSHIN_LOCATIONS, getGenshinAnswerPoints } from "./genshin-content.js";
import { CROSSWORD_COLUMNS, CROSSWORD_ROWS, CROSSWORD_WORDS } from "./crossword-content.js";
import type { PublicRoom, Room } from "./types.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const MAX_PLAYERS = 24;

export const rooms = new Map<string, Room>();

export function normalizeNickname(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

export function normalizeRoomCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 128;
}

export function isValidAvatarId(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160) return false;
  if (value.includes("/") || value.includes("\\") || value.includes("..")) return false;
  return /\.(webp|png|jpe?g|svg)$/i.test(value);
}

export function createRoomCode(): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += ROOM_ALPHABET[randomInt(0, ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }

  throw new Error("Impossible de générer un code de salon unique.");
}

export function toPublicRoom(room: Room, viewerSessionId?: string): PublicRoom {
  const genshinLocation = room.genshin ? GENSHIN_LOCATIONS[room.genshin.locationIndex] : null;
  const showGenshinAnswers = room.genshin?.phase === "recap" || room.genshin?.phase === "results";
  const genshin = room.genshin && genshinLocation
    ? {
        phase: room.genshin.phase,
        locationIndex: room.genshin.locationIndex,
        locationCount: GENSHIN_LOCATIONS.length,
        stage: room.genshin.stage,
        responseDeadline: room.genshin.responseDeadline,
        scores: room.genshin.phase === "answering" ? room.genshin.revealedScores : room.genshin.scores,
        location: {
          id: genshinLocation.id,
          title: genshinLocation.title,
          povImage: genshinLocation.povImage,
          regionMapImage: genshinLocation.regionMapImage,
          gridImage: genshinLocation.gridImage,
          answerGridImage: genshinLocation.answerGridImage,
        },
        submittedSessionIds: Object.entries(room.genshin.responses)
          .filter(([, answers]) => Boolean(answers[room.genshin!.stage]))
          .map(([sessionId]) => sessionId),
        correctAnswer: showGenshinAnswers
          ? genshinLocation.answers[room.genshin.stage][0]
          : null,
        recap: showGenshinAnswers
          ? [...room.players.values()]
            .filter((player) => player.role === "participant")
            .map((player) => {
              const answers = room.genshin!.responses[player.sessionId] ?? [null, null, null];
              const answer = answers[room.genshin!.stage] ?? null;
              const manuallyAccepted = Boolean(
                room.genshin!.acceptedOverrides[player.sessionId]?.[room.genshin!.stage],
              );
              const points = answer
                ? getGenshinAnswerPoints(
                    answer,
                    genshinLocation.answers[room.genshin!.stage],
                    room.genshin!.stage,
                  )
                : 0;
              return {
                sessionId: player.sessionId,
                answer,
                correct: manuallyAccepted || points > 0,
                adjacent: !manuallyAccepted && room.genshin!.stage === 2 && points === 1,
              };
            })
          : null,
      }
    : null;
  const crosswordReviewWords = [...CROSSWORD_WORDS].sort(
    (left, right) => left.number - right.number || left.direction.localeCompare(right.direction),
  );
  const revealedCrosswordWords = room.crossword?.phase === "results"
    ? crosswordReviewWords
    : crosswordReviewWords.slice(0, room.crossword?.reviewIndex ?? 0);
  const correctionLetters = Object.fromEntries(
    revealedCrosswordWords.flatMap((word) =>
      [...word.answer].map((letter, index) => {
        const row = word.row + (word.direction === "down" ? index : 0);
        const column = word.column + (word.direction === "across" ? index : 0);
        return [`${row}:${column}`, letter];
      }),
    ),
  );

  return {
    code: room.code,
    status: room.status,
    currentTool: room.currentTool,
    hostSessionId: room.hostSessionId,
    buzzer: room.buzzer,
    genshin,
    crossword: room.crossword
      ? {
          phase: room.crossword.phase,
          responseDeadline: room.crossword.responseDeadline,
          letters: viewerSessionId === room.hostSessionId
            ? {}
            : { ...(viewerSessionId ? room.crossword.lettersBySession[viewerSessionId] : {}) },
          completed: Boolean(viewerSessionId && room.crossword.completedSessionIds.includes(viewerSessionId)),
          scores: room.crossword.scores,
          reviewIndex: room.crossword.reviewIndex,
          correctionLetters,
          activeWordId: room.crossword.phase === "review" && room.crossword.reviewIndex > 0
            ? crosswordReviewWords[room.crossword.reviewIndex - 1]?.id ?? null
            : null,
          revision: room.crossword.revision,
          rows: CROSSWORD_ROWS,
          columns: CROSSWORD_COLUMNS,
          words: CROSSWORD_WORDS.map(({ answer, ...word }) => ({ ...word, length: answer.length })),
        }
      : null,
    players: [...room.players.values()].map((player) => ({
      sessionId: player.sessionId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      role: player.role,
      connected: player.connected,
      joinedAt: player.joinedAt,
    })),
  };
}

export function nicknameIsAvailable(room: Room, nickname: string, exceptSessionId?: string): boolean {
  const candidate = nickname.toLocaleLowerCase("fr");
  return [...room.players.values()].every(
    (player) =>
      player.sessionId === exceptSessionId || player.nickname.toLocaleLowerCase("fr") !== candidate,
  );
}

export function roomHasCapacity(room: Room): boolean {
  return room.players.size < MAX_PLAYERS;
}
