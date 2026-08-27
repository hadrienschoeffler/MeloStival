import { useCallback, useEffect, useMemo, useState } from "react";
import { HomeScreen } from "./components/HomeScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { BuzzerScreen } from "./components/BuzzerScreen";
import { GenshinGuesserScreen } from "./components/GenshinGuesserScreen";
import { CrosswordScreen } from "./components/Crossword";
import { clearLastRoomCode, getLastRoomCode, getOrCreateSessionId, saveLastRoomCode } from "./lib/session";
import { socket } from "./lib/socket";
import type { PublicRoom, RoomActionResult } from "./types/room";

const ACK_TIMEOUT_MS = 5000;

function emitWithAck<TPayload>(event: string, payload: TPayload): Promise<RoomActionResult> {
  return new Promise((resolve, reject) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (error: Error | null, result: RoomActionResult) => {
      if (error) {
        reject(new Error("Le serveur ne répond pas. Réessaie dans quelques secondes."));
        return;
      }
      resolve(result);
    });
  });
}

function App() {
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [busy, setBusy] = useState(true);
  const [serverConnected, setServerConnected] = useState(socket.connected);
  const [canCreateRoom, setCanCreateRoom] = useState(true);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [crosswordPrivate, setCrosswordPrivate] = useState<{ letters: Record<string, string>; completed: boolean }>({ letters: {}, completed: false });

  const tryResume = useCallback(async () => {
    const lastRoomCode = getLastRoomCode();
    if (!lastRoomCode) {
      setBusy(false);
      return;
    }

    try {
      const result = await emitWithAck("room:resume", {
        roomCode: lastRoomCode,
        sessionId,
      });

      if (result.ok) {
        setRoom(result.room);
        setConnectionError(null);
      } else {
        clearLastRoomCode();
        setRoom(null);
      }
    } catch {
      setConnectionError("Impossible de restaurer le salon pour le moment.");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  const refreshRoomAvailability = useCallback(() => {
    socket.timeout(ACK_TIMEOUT_MS).emit(
      "room:availability",
      (error: Error | null, result: { canCreate: boolean }) => {
        if (!error) setCanCreateRoom(result.canCreate);
      },
    );
  }, []);

  const syncServerTime = useCallback(() => {
    const sentAt = Date.now();
    socket.timeout(ACK_TIMEOUT_MS).emit(
      "server:time",
      (error: Error | null, result: { now: number }) => {
        if (error) return;
        const receivedAt = Date.now();
        const estimatedClientTimeAtServerReply = (sentAt + receivedAt) / 2;
        setServerTimeOffsetMs(result.now - estimatedClientTimeAtServerReply);
      },
    );
  }, []);

  useEffect(() => {
    function onConnect() {
      setServerConnected(true);
      setConnectionError(null);
      syncServerTime();
      refreshRoomAvailability();
      void tryResume();
    }

    function onDisconnect() {
      setServerConnected(false);
    }

    function onConnectError() {
      setServerConnected(false);
      setConnectionError("Impossible de joindre le serveur MeloStival.");
      setBusy(false);
    }

    function onRoomState(nextRoom: PublicRoom) {
      setRoom(nextRoom);
    }

    function onRoomClosed() {
      clearLastRoomCode();
      setRoom(null);
    }

    function onRoomAvailability(result: { canCreate: boolean }) {
      setCanCreateRoom(result.canCreate);
    }

    function onCrosswordPrivateState(result: { letters: Record<string, string>; completed: boolean }) {
      setCrosswordPrivate({ letters: result.letters, completed: result.completed });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("room:state", onRoomState);
    socket.on("room:closed", onRoomClosed);
    socket.on("room:availability", onRoomAvailability);
    socket.on("crossword:private-state", onCrosswordPrivateState);

    if (!socket.connected) {
      socket.connect();
    } else {
      syncServerTime();
      refreshRoomAvailability();
      void tryResume();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("room:state", onRoomState);
      socket.off("room:closed", onRoomClosed);
      socket.off("room:availability", onRoomAvailability);
      socket.off("crossword:private-state", onCrosswordPrivateState);
    };
  }, [refreshRoomAvailability, syncServerTime, tryResume]);

  async function createRoom(nickname: string, avatarId: string) {
    setBusy(true);
    try {
      const result = await emitWithAck("room:create", { sessionId, nickname, avatarId });
      if (!result.ok) throw new Error(result.error);
      saveLastRoomCode(result.room.code);
      setRoom(result.room);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(roomCode: string, nickname: string, avatarId: string) {
    setBusy(true);
    try {
      const result = await emitWithAck("room:join", { sessionId, roomCode, nickname, avatarId });
      if (!result.ok) throw new Error(result.error);
      saveLastRoomCode(result.room.code);
      setRoom(result.room);
    } finally {
      setBusy(false);
    }
  }

  async function leaveRoom() {
    if (!room) return;

    const result = await emitWithAck("room:leave", {
      sessionId,
      roomCode: room.code,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    clearLastRoomCode();
    setRoom(null);
  }

  async function buzzerAction(
    action: "start" | "buzz" | "reset" | "award" | "next" | "end" | "return",
    options?: { oncePerQuestion?: boolean },
  ) {
    if (!room) return;
    const result = await emitWithAck(`buzzer:${action}`, {
      sessionId,
      roomCode: room.code,
      ...options,
    });
    if (!result.ok) throw new Error(result.error);
    setRoom(result.room);
  }

  async function genshinAction(action: "start" | "advance" | "end" | "return") {
    if (!room) return;
    const result = await emitWithAck(`genshin:${action}`, {
      sessionId,
      roomCode: room.code,
    });
    if (!result.ok) throw new Error(result.error);
    setRoom(result.room);
  }

  async function submitGenshinAnswer(answer: string, automatic = false) {
    if (!room) return;
    const result = await emitWithAck("genshin:submit", { sessionId, roomCode: room.code, answer, automatic });
    if (!result.ok) throw new Error(result.error);
    setRoom(result.room);
  }

  async function acceptGenshinAnswer(targetSessionId: string) {
    if (!room) return;
    const result = await emitWithAck("genshin:accept", {
      sessionId,
      roomCode: room.code,
      targetSessionId,
    });
    if (!result.ok) throw new Error(result.error);
    setRoom(result.room);
  }

  async function crosswordAction(action: "start" | "end" | "return") {
    if (!room) return;
    const result = await emitWithAck(`crossword:${action}`, { sessionId, roomCode: room.code });
    if (!result.ok) throw new Error(result.error);
    setRoom(result.room);
  }

  async function setCrosswordLetter(row: number, column: number, letter: string) {
    if (!room) return;
    const result = await emitWithAck("crossword:set-letter", {
      sessionId,
      roomCode: room.code,
      row,
      column,
      letter,
    });
    if (!result.ok) throw new Error(result.error);
    setRoom(result.room);
  }

  if (room) {
    if (room.currentTool === "buzzer" && room.buzzer) {
      return (
        <BuzzerScreen
          room={room}
          sessionId={sessionId}
          serverConnected={serverConnected}
          onAction={buzzerAction}
        />
      );
    }

    if (room.currentTool === "genshin-guesser" && room.genshin) {
      return (
        <GenshinGuesserScreen
          room={room}
          genshin={room.genshin}
          sessionId={sessionId}
          serverTimeOffsetMs={serverTimeOffsetMs}
          onSubmit={submitGenshinAnswer}
          onAction={genshinAction}
          onAcceptAnswer={acceptGenshinAnswer}
        />
      );
    }

    if (room.currentTool === "crossword" && room.crossword) {
      return (
        <CrosswordScreen
          room={room}
          crossword={room.crossword}
          privateLetters={crosswordPrivate.letters}
          completed={crosswordPrivate.completed}
          sessionId={sessionId}
          serverConnected={serverConnected}
          serverTimeOffsetMs={serverTimeOffsetMs}
          onLetter={setCrosswordLetter}
          onEnd={() => crosswordAction("end")}
          onReturn={() => crosswordAction("return")}
        />
      );
    }

    return (
      <LobbyScreen
        room={room}
        sessionId={sessionId}
        serverConnected={serverConnected}
        onLeave={leaveRoom}
        onStartBuzzer={(oncePerQuestion) => buzzerAction("start", { oncePerQuestion })}
        onStartGenshin={() => genshinAction("start")}
        onStartCrossword={() => crosswordAction("start")}
      />
    );
  }

  return (
    <HomeScreen
      busy={busy}
      canCreateRoom={canCreateRoom}
      connectionError={connectionError}
      onCreate={createRoom}
      onJoin={joinRoom}
    />
  );
}

export default App;
