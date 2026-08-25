import { useEffect, useMemo, useRef, useState } from "react";
import { avatarSrc } from "../lib/avatars";
import type { PublicRoom } from "../types/room";
import { Brand } from "./Brand";

interface BuzzerScreenProps {
  room: PublicRoom;
  sessionId: string;
  serverConnected: boolean;
  onAction: (action: "buzz" | "reset" | "award" | "next" | "end" | "return") => Promise<void>;
}

export function BuzzerScreen({ room, sessionId, serverConnected, onAction }: BuzzerScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionStarted = useRef(false);
  const buzzer = room.buzzer;
  const me = room.players.find((player) => player.sessionId === sessionId);
  const isHost = me?.role === "host";
  const buzzedPlayer = room.players.find((player) => player.sessionId === buzzer?.buzzedSessionId);
  const connectedParticipants = room.players.filter(
    (player) => player.role === "participant" && player.connected,
  );
  const everyoneAnswered = Boolean(
    buzzer?.oncePerQuestion &&
      buzzer.phase === "open" &&
      connectedParticipants.length > 0 &&
      connectedParticipants.every((player) => buzzer.excludedSessionIds.includes(player.sessionId)),
  );

  const ranking = useMemo(
    () =>
      room.players
        .filter((player) => player.role === "participant")
        .map((player) => ({ player, score: buzzer?.scores[player.sessionId] ?? 0 }))
        .sort((a, b) => b.score - a.score || a.player.joinedAt - b.player.joinedAt),
    [buzzer?.scores, room.players],
  );

  const isExcluded = buzzer?.excludedSessionIds.includes(sessionId) ?? false;
  const canBuzz = Boolean(!isHost && !isExcluded && buzzer?.phase === "open" && serverConnected);

  useEffect(() => {
    function handleSpacebar(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat || !canBuzz || busy) return;
      event.preventDefault();
      void act("buzz");
    }

    window.addEventListener("keydown", handleSpacebar);
    return () => window.removeEventListener("keydown", handleSpacebar);
  }, [busy, canBuzz]);

  if (!buzzer) return null;

  async function act(action: "buzz" | "reset" | "award" | "next" | "end" | "return") {
    if (actionStarted.current) return;
    actionStarted.current = true;
    setBusy(true);
    setError(null);
    try {
      await onAction(action);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Une erreur est survenue.");
    } finally {
      actionStarted.current = false;
      setBusy(false);
    }
  }

  if (buzzer.phase === "results") {
    return (
      <main className="buzzer-shell results-shell">
        <Brand compact />
        <section className="results-panel">
          <p className="buzzer-eyebrow">Fin de partie</p>
          <h1 className="page-title">Classement</h1>
          <ol className="ranking-list">
            {ranking.map(({ player, score }, index) => (
              <li className="ranking-row" key={player.sessionId}>
                <span className="ranking-position">{index + 1}</span>
                <img src={avatarSrc(player.avatarId)} alt="" />
                <strong>{player.nickname}</strong>
                <span className="ranking-score">{score} pt{score > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ol>
          {ranking.length === 0 && <p className="empty-ranking">Aucun participant n'a marqué de point.</p>}
          {isHost ? (
            <button className="primary-button" type="button" disabled={busy} onClick={() => void act("return")}>
              Retourner au salon
            </button>
          ) : (
            <p className="results-waiting">L'Host va vous ramener au salon.</p>
          )}
          {error && <div className="form-error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="buzzer-shell">
      <header className="buzzer-header">
        <div>
          <Brand compact />
          <h1 className="page-title">Buzzer</h1>
          <p className="question-number">Question {buzzer.questionNumber}</p>
        </div>
        {!serverConnected && <div className="connection-chip">Reconnexion…</div>}
      </header>

      <div className="buzzer-layout">
        <section className={`buzzer-stage ${buzzer.phase === "buzzed" ? "has-winner" : ""}`}>
          {buzzer.phase === "buzzed" && buzzedPlayer ? (
            <div className="buzz-winner" aria-live="assertive">
              <img src={avatarSrc(buzzedPlayer.avatarId)} alt="" />
              <h2>{buzzedPlayer.nickname}</h2>
            </div>
          ) : isHost && everyoneAnswered ? (
            <div className="everyone-answered" aria-live="polite">
              <span>Question terminée</span>
              <h2>Tout le monde a répondu</h2>
              <p>Personne n'a trouvé la bonne réponse.</p>
            </div>
          ) : isHost ? (
            <div className="host-waiting">
              <span className="buzzer-pulse" />
              <h2>Buzzer ouvert</h2>
              <p>En attente du premier participant…</p>
            </div>
          ) : (
            <button
              className={`big-buzzer ${isExcluded ? "excluded" : ""}`}
              type="button"
              aria-label={isExcluded ? "Buzzer indisponible pour cette question" : "Buzzer"}
              disabled={!canBuzz || busy}
              onClick={() => void act("buzz")}
            >
              <span>BUZZ</span>
            </button>
          )}

          {isHost && (
            <div className={`host-controls ${everyoneAnswered ? "question-complete" : ""}`}>
              {!everyoneAnswered && (
                <>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={busy || buzzer.phase !== "buzzed"}
                    onClick={() => void act("reset")}
                  >
                    Mauvaise réponse
                  </button>
                  <button
                    className="primary-button award-button"
                    type="button"
                    disabled={busy || buzzer.phase !== "buzzed"}
                    onClick={() => void act("award")}
                  >
                    Valider +1
                  </button>
                </>
              )}
              <button className="ghost-button" type="button" disabled={busy} onClick={() => void act("next")}>
                Question suivante
              </button>
              <button className="ghost-button danger" type="button" disabled={busy} onClick={() => void act("end")}>
                Fin de partie
              </button>
            </div>
          )}
          {error && <div className="form-error buzzer-error">{error}</div>}
        </section>

        <aside className="score-panel">
          <h2 className="panel-title">Scores</h2>
          <div className="score-list">
            {ranking.map(({ player, score }, index) => (
              <div className="score-row" key={player.sessionId}>
                <span>{index + 1}</span>
                <img src={avatarSrc(player.avatarId)} alt="" />
                <strong>{player.nickname}</strong>
                <b>{score}</b>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
