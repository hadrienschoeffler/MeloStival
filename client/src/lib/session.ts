const SESSION_KEY = "melostival.sessionId";
const ROOM_KEY = "melostival.roomCode";

export function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  return sessionId;
}

export function getLastRoomCode(): string | null {
  return localStorage.getItem(ROOM_KEY);
}

export function saveLastRoomCode(code: string): void {
  localStorage.setItem(ROOM_KEY, code);
}

export function clearLastRoomCode(): void {
  localStorage.removeItem(ROOM_KEY);
}
