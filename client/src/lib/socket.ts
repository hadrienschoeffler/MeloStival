import { io } from "socket.io-client";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export const socket = io(serverUrl, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});
