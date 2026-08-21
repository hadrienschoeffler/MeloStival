import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { GENSHIN_LOCATIONS, getGenshinAnswerPoints } from "./genshin-content.js";
import {
  createRoomCode,
  isValidAvatarId,
  isValidSessionId,
  nicknameIsAvailable,
  normalizeNickname,
  normalizeRoomCode,
  roomHasCapacity,
  rooms,
  toPublicRoom,
} from "./rooms.js";
import type { Player, Room, RoomActionResult } from "./types.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const DISCONNECT_GRACE_MS = Number(process.env.ROOM_DISCONNECT_GRACE_MS ?? 30 * 60 * 1000);
const GENSHIN_STAGE_DURATIONS_MS = [30_000, 30_000, 45_000] as const;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, now: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN },
  transports: ["websocket", "polling"],
});

type Ack = (result: RoomActionResult) => void;

function emitRoom(room: Room): void {
  io.to(room.code).emit("room:state", toPublicRoom(room));
}

function emitRoomAvailability(): void {
  io.emit("room:availability", { canCreate: rooms.size === 0 });
}

function scheduleGenshinDeadline(room: Room): void {
  const deadline = room.genshin?.responseDeadline;
  if (!deadline) return;

  setTimeout(() => {
    const currentRoom = rooms.get(room.code);
    if (
      !currentRoom?.genshin ||
      currentRoom.genshin.phase !== "answering" ||
      currentRoom.genshin.responseDeadline !== deadline
    ) return;

    // Le délai bloque uniquement les nouvelles réponses. L'Host reste maître
    // du passage au récapitulatif.
    emitRoom(currentRoom);
  }, Math.max(0, deadline - Date.now())).unref();
}

function leaveSocketRoom(socketId: string | null, roomCode: string): void {
  if (!socketId) return;
  const socket = io.sockets.sockets.get(socketId);
  socket?.leave(roomCode);
}

function findPlayerRoom(sessionId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.players.has(sessionId)) return room;
  }
  return null;
}

function closeRoom(room: Room): void {
  io.to(room.code).emit("room:closed");
  for (const player of room.players.values()) {
    leaveSocketRoom(player.socketId, room.code);
  }
  room.players.clear();
  rooms.delete(room.code);
  emitRoomAvailability();
}

function removePlayer(room: Room, sessionId: string): void {
  const player = room.players.get(sessionId);
  if (!player) return;

  if (room.hostSessionId === sessionId) {
    closeRoom(room);
    return;
  }

  leaveSocketRoom(player.socketId, room.code);
  room.players.delete(sessionId);

  if (room.players.size === 0) {
    closeRoom(room);
    return;
  }

  emitRoom(room);
}

function scheduleDisconnectedCleanup(roomCode: string, sessionId: string, disconnectedAt: number): void {
  setTimeout(() => {
    const room = rooms.get(roomCode);
    const player = room?.players.get(sessionId);
    if (!room || !player) return;
    if (player.connected || player.disconnectedAt !== disconnectedAt) return;

    removePlayer(room, sessionId);
  }, DISCONNECT_GRACE_MS).unref();
}

function validateIdentity(payload: Record<string, unknown>): { sessionId: string; nickname: string; avatarId: string } | string {
  const sessionId = payload.sessionId;
  const nickname = normalizeNickname(payload.nickname);
  const avatarId = payload.avatarId;

  if (!isValidSessionId(sessionId)) return "Session invalide.";
  if (nickname.length < 1) return "Un pseudo est requis.";
  if (!isValidAvatarId(avatarId)) return "Avatar invalide.";

  return { sessionId, nickname, avatarId };
}

io.on("connection", (socket) => {
  socket.on("server:time", (ack: (result: { now: number }) => void) => {
    ack({ now: Date.now() });
  });

  socket.on("room:availability", (ack: (result: { canCreate: boolean }) => void) => {
    ack({ canCreate: rooms.size === 0 });
  });

  socket.on("room:create", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const identity = validateIdentity(rawPayload);
    if (typeof identity === "string") {
      ack({ ok: false, error: identity });
      return;
    }

    const existingRoom = findPlayerRoom(identity.sessionId);
    if (existingRoom) {
      const existingPlayer = existingRoom.players.get(identity.sessionId)!;
      existingPlayer.socketId = socket.id;
      existingPlayer.connected = true;
      existingPlayer.disconnectedAt = null;
      socket.join(existingRoom.code);
      emitRoom(existingRoom);
      ack({ ok: true, room: toPublicRoom(existingRoom) });
      return;
    }

    if (rooms.size > 0) {
      ack({
        ok: false,
        error: "Un salon est déjà en cours. Tu peux uniquement le rejoindre.",
        code: "ROOM_ALREADY_ACTIVE",
      });
      return;
    }

    const code = createRoomCode();
    const now = Date.now();
    const host: Player = {
      sessionId: identity.sessionId,
      socketId: socket.id,
      nickname: identity.nickname,
      avatarId: identity.avatarId,
      role: "host",
      connected: true,
      joinedAt: now,
      disconnectedAt: null,
    };

    const room: Room = {
      code,
      status: "lobby",
      currentTool: null,
      hostSessionId: host.sessionId,
      players: new Map([[host.sessionId, host]]),
      buzzer: null,
      genshin: null,
      createdAt: now,
    };

    rooms.set(code, room);
    socket.join(code);
    emitRoomAvailability();
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("room:join", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const identity = validateIdentity(rawPayload);
    if (typeof identity === "string") {
      ack({ ok: false, error: identity });
      return;
    }

    const roomCode = normalizeRoomCode(rawPayload.roomCode);
    const room = rooms.get(roomCode);
    if (!room) {
      ack({ ok: false, error: "Ce salon n'existe pas ou a été fermé.", code: "ROOM_NOT_FOUND" });
      return;
    }

    const existingGlobalRoom = findPlayerRoom(identity.sessionId);
    if (existingGlobalRoom && existingGlobalRoom.code !== room.code) {
      ack({ ok: false, error: `Tu es déjà associé au salon ${existingGlobalRoom.code}. Quitte-le d'abord.` });
      return;
    }

    const existingPlayer = room.players.get(identity.sessionId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.connected = true;
      existingPlayer.disconnectedAt = null;
      socket.join(room.code);
      emitRoom(room);
      ack({ ok: true, room: toPublicRoom(room) });
      return;
    }

    if (!roomHasCapacity(room)) {
      ack({ ok: false, error: "Le salon est complet." });
      return;
    }

    if (!nicknameIsAvailable(room, identity.nickname)) {
      ack({ ok: false, error: "Ce pseudo est déjà utilisé dans le salon." });
      return;
    }

    const participant: Player = {
      sessionId: identity.sessionId,
      socketId: socket.id,
      nickname: identity.nickname,
      avatarId: identity.avatarId,
      role: "participant",
      connected: true,
      joinedAt: Date.now(),
      disconnectedAt: null,
    };

    room.players.set(participant.sessionId, participant);
    socket.join(room.code);
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("room:resume", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const roomCode = normalizeRoomCode(rawPayload.roomCode);
    if (!isValidSessionId(sessionId)) {
      ack({ ok: false, error: "Session invalide." });
      return;
    }

    const room = rooms.get(roomCode);
    const player = room?.players.get(sessionId);
    if (!room || !player) {
      ack({ ok: false, error: "Le salon n'existe plus.", code: "ROOM_NOT_FOUND" });
      return;
    }

    if (player.socketId && player.socketId !== socket.id) {
      const previousSocket = io.sockets.sockets.get(player.socketId);
      previousSocket?.leave(room.code);
    }

    player.socketId = socket.id;
    player.connected = true;
    player.disconnectedAt = null;
    socket.join(room.code);
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("room:leave", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const roomCode = normalizeRoomCode(rawPayload.roomCode);
    if (!isValidSessionId(sessionId)) {
      ack({ ok: false, error: "Session invalide." });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room || !room.players.has(sessionId)) {
      ack({ ok: true, room: { code: roomCode, status: "lobby", currentTool: null, hostSessionId: "", players: [], buzzer: null, genshin: null } });
      return;
    }

    removePlayer(room, sessionId);
    socket.leave(roomCode);
    ack({ ok: true, room: room.players.size > 0 ? toPublicRoom(room) : { code: roomCode, status: "lobby", currentTool: null, hostSessionId: "", players: [], buzzer: null, genshin: null } });
  });

  socket.on("buzzer:start", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId) {
      ack({ ok: false, error: "Seul l'Host peut lancer le buzzer." });
      return;
    }

    room.status = "playing";
    room.currentTool = "buzzer";
    room.buzzer = {
      phase: "open",
      buzzedSessionId: null,
      oncePerQuestion: rawPayload.oncePerQuestion === true,
      excludedSessionIds: [],
      questionNumber: 1,
      scores: Object.fromEntries(
        [...room.players.values()]
          .filter((player) => player.role === "participant")
          .map((player) => [player.sessionId, 0]),
      ),
    };
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("buzzer:buzz", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    const player = isValidSessionId(sessionId) ? room?.players.get(sessionId) : null;
    if (!room || !player || player.role !== "participant") {
      ack({ ok: false, error: "Seuls les participants peuvent buzzer." });
      return;
    }
    if (room.currentTool !== "buzzer" || !room.buzzer || room.buzzer.phase !== "open") {
      ack({ ok: false, error: "Le buzzer n'est pas disponible." });
      return;
    }
    if (room.buzzer.excludedSessionIds.includes(player.sessionId)) {
      ack({ ok: false, error: "Tu as déjà buzzé pour cette question." });
      return;
    }

    room.buzzer.scores[player.sessionId] ??= 0;
    room.buzzer.phase = "buzzed";
    room.buzzer.buzzedSessionId = player.sessionId;
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("buzzer:reset", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId || !room.buzzer) {
      ack({ ok: false, error: "Action réservée à l'Host." });
      return;
    }

    if (room.buzzer.oncePerQuestion && room.buzzer.buzzedSessionId) {
      room.buzzer.excludedSessionIds.push(room.buzzer.buzzedSessionId);
    }
    room.buzzer.phase = "open";
    room.buzzer.buzzedSessionId = null;
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("buzzer:award", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId || !room.buzzer) {
      ack({ ok: false, error: "Action réservée à l'Host." });
      return;
    }

    const winnerId = room.buzzer.buzzedSessionId;
    if (room.buzzer.phase !== "buzzed" || !winnerId || !room.players.has(winnerId)) {
      ack({ ok: false, error: "Aucun buzz à valider." });
      return;
    }

    room.buzzer.scores[winnerId] = (room.buzzer.scores[winnerId] ?? 0) + 1;
    room.buzzer.phase = "open";
    room.buzzer.buzzedSessionId = null;
    room.buzzer.excludedSessionIds = [];
    room.buzzer.questionNumber += 1;
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("buzzer:next", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId || !room.buzzer) {
      ack({ ok: false, error: "Action réservée à l'Host." });
      return;
    }

    room.buzzer.phase = "open";
    room.buzzer.buzzedSessionId = null;
    room.buzzer.excludedSessionIds = [];
    room.buzzer.questionNumber += 1;
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("buzzer:end", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId || !room.buzzer) {
      ack({ ok: false, error: "Action réservée à l'Host." });
      return;
    }

    room.buzzer.phase = "results";
    room.buzzer.buzzedSessionId = null;
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("buzzer:return", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId || !room.buzzer) {
      ack({ ok: false, error: "Action réservée à l'Host." });
      return;
    }

    room.status = "lobby";
    room.currentTool = null;
    room.buzzer = null;
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("genshin:start", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId) {
      ack({ ok: false, error: "Seul l'Host peut lancer le Genshin Guesser." });
      return;
    }
    if (GENSHIN_LOCATIONS.length === 0) {
      ack({ ok: false, error: "Aucune localisation Genshin n'est configurée." });
      return;
    }

    room.status = "playing";
    room.currentTool = "genshin-guesser";
    room.buzzer = null;
    const initialScores = Object.fromEntries(
      [...room.players.values()]
        .filter((player) => player.role === "participant")
        .map((player) => [player.sessionId, 0]),
    );
    room.genshin = {
      phase: "answering",
      locationIndex: 0,
      stage: 0,
      responseDeadline: Date.now() + GENSHIN_STAGE_DURATIONS_MS[0],
      scores: { ...initialScores },
      revealedScores: { ...initialScores },
      responses: {},
      acceptedOverrides: {},
    };
    scheduleGenshinDeadline(room);
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("genshin:submit", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    const player = isValidSessionId(sessionId) ? room?.players.get(sessionId) : null;
    const answer = typeof rawPayload.answer === "string" ? rawPayload.answer.trim().slice(0, 80) : "";
    if (!room || !player || player.role !== "participant" || player.socketId !== socket.id) {
      ack({ ok: false, error: "Seuls les participants peuvent répondre." });
      return;
    }
    if (room.currentTool !== "genshin-guesser" || !room.genshin || room.genshin.phase !== "answering") {
      ack({ ok: false, error: "Cette question n'accepte plus de réponse." });
      return;
    }
    const automaticSubmission = rawPayload.automatic === true;
    const automaticGraceDeadline = room.genshin.responseDeadline + 1_500;
    if (
      Date.now() >= room.genshin.responseDeadline &&
      (!automaticSubmission || Date.now() > automaticGraceDeadline)
    ) {
      ack({ ok: false, error: "Le temps de réponse est écoulé." });
      return;
    }
    if (!answer) {
      ack({ ok: false, error: "Une réponse est requise." });
      return;
    }

    const answers = room.genshin.responses[player.sessionId] ?? [null, null, null];
    if (answers[room.genshin.stage]) {
      ack({ ok: false, error: "Tu as déjà répondu à cette question." });
      return;
    }

    answers[room.genshin.stage] = answer;
    room.genshin.responses[player.sessionId] = answers;
    const location = GENSHIN_LOCATIONS[room.genshin.locationIndex];
    if (location) {
      const points = getGenshinAnswerPoints(answer, location.answers[room.genshin.stage], room.genshin.stage);
      room.genshin.scores[player.sessionId] = (room.genshin.scores[player.sessionId] ?? 0) + points;
    }
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("genshin:advance", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId || !room.genshin) {
      ack({ ok: false, error: "Action réservée à l'Host." });
      return;
    }

    if (room.genshin.phase === "answering") {
      room.genshin.phase = "recap";
      room.genshin.revealedScores = { ...room.genshin.scores };
    } else if (room.genshin.phase === "recap") {
      if (room.genshin.stage < 2) {
        room.genshin.stage = (room.genshin.stage + 1) as 1 | 2;
        room.genshin.phase = "answering";
        room.genshin.responseDeadline = Date.now() + GENSHIN_STAGE_DURATIONS_MS[room.genshin.stage];
        scheduleGenshinDeadline(room);
      } else if (room.genshin.locationIndex + 1 < GENSHIN_LOCATIONS.length) {
        room.genshin.locationIndex += 1;
        room.genshin.stage = 0;
        room.genshin.phase = "answering";
        room.genshin.responseDeadline = Date.now() + GENSHIN_STAGE_DURATIONS_MS[0];
        room.genshin.responses = {};
        room.genshin.acceptedOverrides = {};
        scheduleGenshinDeadline(room);
      } else {
        room.genshin.phase = "results";
      }
    }
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("genshin:accept", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const targetSessionId = rawPayload.targetSessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (
      !isValidSessionId(sessionId) ||
      !isValidSessionId(targetSessionId) ||
      !room ||
      room.hostSessionId !== sessionId ||
      !room.genshin ||
      room.genshin.phase !== "recap"
    ) {
      ack({ ok: false, error: "Cette réponse ne peut pas être validée." });
      return;
    }

    const answer = room.genshin.responses[targetSessionId]?.[room.genshin.stage];
    const location = GENSHIN_LOCATIONS[room.genshin.locationIndex];
    if (!answer || !location || !room.players.has(targetSessionId)) {
      ack({ ok: false, error: "Réponse introuvable." });
      return;
    }

    const overrides = room.genshin.acceptedOverrides[targetSessionId] ?? [false, false, false];
    const alreadyAwarded = getGenshinAnswerPoints(
      answer,
      location.answers[room.genshin.stage],
      room.genshin.stage,
    ) > 0;
    if (!alreadyAwarded && !overrides[room.genshin.stage]) {
      overrides[room.genshin.stage] = true;
      room.genshin.acceptedOverrides[targetSessionId] = overrides;
      room.genshin.scores[targetSessionId] = (room.genshin.scores[targetSessionId] ?? 0) + 1;
      room.genshin.revealedScores = { ...room.genshin.scores };
      emitRoom(room);
    }
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("genshin:end", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId || !room.genshin) {
      ack({ ok: false, error: "Action réservée à l'Host." });
      return;
    }
    room.genshin.phase = "results";
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("genshin:return", (rawPayload: Record<string, unknown>, ack: Ack) => {
    const sessionId = rawPayload.sessionId;
    const room = rooms.get(normalizeRoomCode(rawPayload.roomCode));
    if (!isValidSessionId(sessionId) || !room || room.hostSessionId !== sessionId || !room.genshin) {
      ack({ ok: false, error: "Action réservée à l'Host." });
      return;
    }
    room.status = "lobby";
    room.currentTool = null;
    room.genshin = null;
    emitRoom(room);
    ack({ ok: true, room: toPublicRoom(room) });
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const player = [...room.players.values()].find((candidate) => candidate.socketId === socket.id);
      if (!player) continue;

      player.connected = false;
      player.socketId = null;
      player.disconnectedAt = Date.now();
      emitRoom(room);
      scheduleDisconnectedCleanup(room.code, player.sessionId, player.disconnectedAt);
    }
  });
});

server.listen(PORT, () => {
  console.log(`MeloStival server listening on http://localhost:${PORT}`);
  console.log(`Allowed client origin: ${CLIENT_ORIGIN}`);
  console.log(`Disconnect grace: ${DISCONNECT_GRACE_MS} ms`);
});
