import { useMemo, useRef, useState } from "react";
import type { PublicRoom } from "../types/room";
import { Brand } from "./Brand";
import { PlayerCard } from "./PlayerCard";

interface LobbyScreenProps {
  room: PublicRoom;
  sessionId: string;
  serverConnected: boolean;
  onLeave: () => Promise<void>;
  onStartBuzzer: (oncePerQuestion: boolean) => Promise<void>;
  onStartGenshin: () => Promise<void>;
}

export function LobbyScreen({ room, sessionId, serverConnected, onLeave, onStartBuzzer, onStartGenshin }: LobbyScreenProps) {
  const me = room.players.find((player) => player.sessionId === sessionId);
  const host = room.players.find((player) => player.sessionId === room.hostSessionId);
  const isHost = me?.role === "host";
  const [codeCopied, setCodeCopied] = useState(false);
  const [showBuzzerSetup, setShowBuzzerSetup] = useState(false);
  const [oncePerQuestion, setOncePerQuestion] = useState(false);
  const [startingBuzzer, setStartingBuzzer] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startingGenshin, setStartingGenshin] = useState(false);
  const toolLaunchStarted = useRef(false);

  const participants = useMemo(
    () =>
      room.players
        .filter((player) => player.role === "participant")
        .sort((a, b) => {
          if (a.connected !== b.connected) return a.connected ? -1 : 1;
          return a.joinedAt - b.joinedAt;
        }),
    [room.players],
  );

  async function copyRoomCode() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(room.code);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = room.code;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1800);
  }

  async function startBuzzer() {
    if (toolLaunchStarted.current) return;
    toolLaunchStarted.current = true;
    setStartingBuzzer(true);
    setStartError(null);
    try {
      await onStartBuzzer(oncePerQuestion);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Impossible de lancer le buzzer.");
    } finally {
      toolLaunchStarted.current = false;
      setStartingBuzzer(false);
    }
  }

  async function startGenshin() {
    if (toolLaunchStarted.current) return;
    toolLaunchStarted.current = true;
    setStartingGenshin(true);
    setStartError(null);
    try {
      await onStartGenshin();
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Impossible de lancer le Genshin Guesser.");
    } finally {
      toolLaunchStarted.current = false;
      setStartingGenshin(false);
    }
  }

  return (
    <main className="lobby-shell">
      <header className="lobby-header">
        <div className="lobby-title-block">
          <Brand compact />
          <h1 className="page-title">Le salon</h1>
        </div>

        <div className="header-actions">
          <div className="room-code-copy-wrap">
            <button
              className={`room-code-pill ${isHost ? "" : "participant-code"}`}
              type="button"
              onClick={copyRoomCode}
              aria-label="Copier le code du salon"
            >
              <strong>{room.code}</strong>
            </button>
            <span
              className={`copy-feedback ${codeCopied ? "visible" : ""}`}
              role="status"
              aria-live="polite"
            >
              Code copié
            </span>
          </div>
          <button className="ghost-button danger" type="button" onClick={onLeave}>
            Quitter
          </button>
        </div>
      </header>

      {!serverConnected && (
        <div className="status-banner warning">
          Connexion perdue. Reconnexion en cours…
        </div>
      )}

      {host && !host.connected && host.sessionId !== sessionId && (
        <div className="status-banner warning">Host déconnecté.</div>
      )}

      <section className="lobby-grid">
        <div className="participants-section app-panel">
          <div className="section-heading">
            <div>
              <h2 className="panel-title">Participants</h2>
            </div>
            <span className="count-pill" aria-label={`${participants.length} participant(s)`}>
              {participants.length}
            </span>
          </div>

          <div className="players-grid">
            {participants.map((player) => (
              <PlayerCard
                key={player.sessionId}
                player={player}
                isCurrentUser={player.sessionId === sessionId}
              />
            ))}
          </div>
        </div>

        <aside className="tools-panel app-panel">
          {isHost ? (
            <>
              <h2 className="panel-title">Outils de l'Host</h2>
              <div className="tool-list">
                <button className="tool-card" type="button" onClick={() => setShowBuzzerSetup(true)}>
                  <span className="tool-icon">01</span>
                  <strong>Buzzer</strong>
                </button>
                <button className="tool-card" type="button" disabled={startingGenshin} onClick={() => void startGenshin()}>
                  <span className="tool-icon">02</span>
                  <strong>Genshin Guesser</strong>
                </button>
              </div>
              {startError && !showBuzzerSetup && <div className="form-error tool-error">{startError}</div>}
            </>
          ) : (
            <div className="waiting-block minimal-waiting">
              <span className="waiting-indicator" />
              <h2 className="panel-title">En attente</h2>
            </div>
          )}
        </aside>
      </section>

      {showBuzzerSetup && (
        <div className="setup-backdrop" role="presentation" onMouseDown={() => setShowBuzzerSetup(false)}>
          <section
            className="setup-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="buzzer-setup-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="setup-label">Configuration de la partie</p>
            <h2 id="buzzer-setup-title">Lancer le Buzzer ?</h2>
            <p className="setup-description">
              Tous les participants seront envoyés vers le buzzer dès le lancement.
            </p>
            <label className="setup-checkbox">
              <input
                type="checkbox"
                checked={oncePerQuestion}
                onChange={(event) => setOncePerQuestion(event.target.checked)}
              />
              <span>
                <strong>Un seul buzz par question</strong>
                <small>Après une mauvaise réponse, le participant ne pourra plus buzzer jusqu'à la suivante.</small>
              </span>
            </label>
            {startError && <div className="form-error">{startError}</div>}
            <div className="setup-actions">
              <button className="ghost-button" type="button" disabled={startingBuzzer} onClick={() => setShowBuzzerSetup(false)}>
                Annuler
              </button>
              <button className="primary-button" type="button" disabled={startingBuzzer} onClick={() => void startBuzzer()}>
                {startingBuzzer ? "Lancement…" : "Lancer la partie"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
