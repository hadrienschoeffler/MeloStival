import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { avatarSrc } from "../lib/avatars";
import type { PublicRoom } from "../types/room";
import { Brand } from "./Brand";
import { ZoomableImage } from "./ZoomableImage";

type GenshinAction = "advance" | "end" | "return";

interface GenshinGuesserScreenProps {
  room: PublicRoom;
  sessionId: string;
  serverTimeOffsetMs: number;
  onSubmit: (answer: string, automatic?: boolean) => Promise<void>;
  onAction: (action: GenshinAction) => Promise<void>;
  onAcceptAnswer: (targetSessionId: string) => Promise<void>;
}

const STAGE_COPY = [
  { title: "Dans quelle région ?" },
  { title: "Dans quelle sous-région ?" },
  { title: "Dans quelle case ?" },
] as const;

export function GenshinGuesserScreen({ room, sessionId, serverTimeOffsetMs, onSubmit, onAction, onAcceptAnswer }: GenshinGuesserScreenProps) {
  const genshin = room.genshin;
  const [answer, setAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const me = room.players.find((player) => player.sessionId === sessionId);
  const isHost = me?.role === "host";

  useEffect(() => {
    setAnswer("");
    setSubmittedAnswer("");
  }, [genshin?.location.id, genshin?.stage]);

  useEffect(() => {
    if (genshin?.phase !== "answering") return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [genshin?.phase, genshin?.responseDeadline]);

  const ranking = useMemo(
    () =>
      room.players
        .filter((player) => player.role === "participant")
        .map((player) => ({ player, score: genshin?.scores[player.sessionId] ?? 0 }))
        .sort((a, b) => b.score - a.score || a.player.joinedAt - b.player.joinedAt),
    [genshin?.scores, room.players],
  );

  if (!genshin) return null;

  const submitted = genshin.submittedSessionIds.includes(sessionId);
  const connectedParticipants = room.players.filter(
    (player) => player.role === "participant" && player.connected,
  );
  const everyoneSubmitted =
    connectedParticipants.length > 0 &&
    connectedParticipants.every((player) => genshin.submittedSessionIds.includes(player.sessionId));
  const stageCopy = STAGE_COPY[genshin.stage];
  const estimatedServerNow = now + serverTimeOffsetMs;
  const remainingSeconds = Math.max(0, Math.ceil((genshin.responseDeadline - estimatedServerNow) / 1000));
  const timerExpired = estimatedServerNow >= genshin.responseDeadline;
  const image = [genshin.location.povImage, genshin.location.regionMapImage, genshin.location.gridImage][genshin.stage];
  const recapImage = genshin.stage === 2 ? genshin.location.answerGridImage : image;
  const questionImages = [
    { src: genshin.location.povImage, alt: "Vue d'origine" },
    { src: image, alt: `Illustration pour ${stageCopy.title.toLocaleLowerCase("fr")}` },
  ];

  useEffect(() => {
    if (isHost || submitted || genshin.phase !== "answering") return;
    const delay = Math.max(0, genshin.responseDeadline - (Date.now() + serverTimeOffsetMs));
    const timeout = window.setTimeout(() => {
      const cleanAnswer = answer.trim();
      if (!cleanAnswer) return;
      setBusy(true);
      setError(null);
      setSubmittedAnswer(cleanAnswer);
      void onSubmit(cleanAnswer, true)
        .then(() => {
          setAnswer("");
        })
        .catch((submitError) => {
          setSubmittedAnswer("");
          setError(submitError instanceof Error ? submitError.message : "Une erreur est survenue.");
        })
        .finally(() => setBusy(false));
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [answer, genshin.phase, genshin.responseDeadline, isHost, onSubmit, serverTimeOffsetMs, submitted]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanAnswer = answer.trim();
    if (!cleanAnswer) return;
    void run(async () => {
      await onSubmit(cleanAnswer);
      setSubmittedAnswer(cleanAnswer);
      setAnswer("");
    });
  }

  if (genshin.phase === "results") {
    return (
      <main className="guesser-shell guesser-results-shell">
        <Brand compact />
        <section className="results-panel">
          <p className="buzzer-eyebrow">Genshin Guesser terminé</p>
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
          {isHost ? (
            <button className="primary-button" type="button" disabled={busy} onClick={() => void run(() => onAction("return"))}>
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

  if (genshin.phase === "recap") {
    return (
      <main className="guesser-shell">
        <Brand compact />
        <section className="guesser-recap">
          <p className="guesser-progress">Localisation {genshin.locationIndex + 1} / {genshin.locationCount}</p>
          <h1 className="page-title">Réponses — {stageCopy.title.toLocaleLowerCase("fr")}</h1>
          <div className="recap-image-wrap">
            <ZoomableImage src={recapImage} alt={`Correction pour ${stageCopy.title.toLocaleLowerCase("fr")}`} />
          </div>
          <p className="recap-correct-answer">
            Bonne réponse : <strong>{genshin.correctAnswer}</strong>
          </p>
          <div className="recap-players-grid">
            {genshin.recap?.map((entry) => {
              const player = room.players.find((candidate) => candidate.sessionId === entry.sessionId);
              if (!player) return null;
              return (
                <article className="recap-player" key={entry.sessionId}>
                  <img src={avatarSrc(player.avatarId)} alt="" />
                  <strong>{player.nickname}</strong>
                  <span className={entry.adjacent ? "adjacent" : entry.correct ? "correct" : "incorrect"}>
                    {entry.answer ?? "—"}
                  </span>
                  {isHost && !entry.correct && entry.answer && (
                    <button
                      className="accept-answer-button"
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => onAcceptAnswer(entry.sessionId))}
                    >
                      Accepter
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {isHost ? (
            <div className="guesser-recap-actions">
              <button className="primary-button" type="button" disabled={busy} onClick={() => void run(() => onAction("advance"))}>
                {genshin.stage < 2
                  ? "Passer à l'étape suivante"
                  : genshin.locationIndex + 1 < genshin.locationCount
                    ? "Localisation suivante"
                    : "Voir le classement"}
              </button>
              <button className="ghost-button danger" type="button" disabled={busy} onClick={() => void run(() => onAction("end"))}>
                Terminer la partie
              </button>
            </div>
          ) : (
            <p className="results-waiting">En attente de l'Host…</p>
          )}
          {error && <div className="form-error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="guesser-shell">
      <header className="guesser-header">
        <div>
          <Brand compact />
          <p className="guesser-progress">Localisation {genshin.locationIndex + 1} / {genshin.locationCount} · Étape {genshin.stage + 1} / 3</p>
          <h1 className="page-title">{stageCopy.title}</h1>
        </div>
        {isHost && (
          <button className="ghost-button danger" type="button" disabled={busy} onClick={() => void run(() => onAction("end"))}>
            Fin de partie
          </button>
        )}
      </header>

      <div className="guesser-layout">
        <section className="guesser-main">
          <div className={`guesser-images ${!isHost && genshin.stage > 0 ? "with-pov-reminder" : ""}`}>
            {!isHost && genshin.stage > 0 && (
              <div className="guesser-image-wrap">
                <ZoomableImage src={genshin.location.povImage} alt="Vue d'origine" gallery={questionImages} initialIndex={0} />
              </div>
            )}
            <div className="guesser-image-wrap">
              <ZoomableImage
                src={image}
                alt={`Illustration pour ${stageCopy.title.toLocaleLowerCase("fr")}`}
                gallery={!isHost && genshin.stage > 0 ? questionImages : undefined}
                initialIndex={!isHost && genshin.stage > 0 ? 1 : 0}
              />
            </div>
          </div>
          <div className="guesser-timer-row">
            <span className={`guesser-timer ${remainingSeconds <= 10 ? "ending" : ""}`} aria-live="polite">
              Timer : {remainingSeconds} s
            </span>
          </div>
          {!isHost && (
            submitted ? (
              <div className="answer-form answer-form-submitted">
                <input value={submittedAnswer || answer} readOnly aria-label="Réponse envoyée" />
              </div>
            ) : (
              <form
                className={`answer-form ${timerExpired ? "answer-form-expired" : ""} ${timerExpired && !answer.trim() ? "answer-form-empty" : ""}`}
                onSubmit={submit}
              >
                <input
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value.slice(0, 80))}
                  autoFocus
                  autoComplete="off"
                  readOnly={timerExpired}
                />
                {!timerExpired && (
                  <button className="primary-button" type="submit" disabled={busy || !answer.trim()}>
                    Valider
                  </button>
                )}
              </form>
            )
          )}
          {isHost && (
            <div className="guesser-host-controls">
              <p>
                <strong>{genshin.submittedSessionIds.length}</strong> / {connectedParticipants.length} réponse(s)
              </p>
              <button
                className="primary-button"
                type="button"
                disabled={busy || (!everyoneSubmitted && remainingSeconds > 0)}
                onClick={() => void run(() => onAction("advance"))}
              >
                Afficher le récapitulatif
              </button>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
        </section>

        <aside className="guesser-players">
          <h2 className="panel-title">Réponses</h2>
          {connectedParticipants.map((player) => (
            <div className="guesser-player" key={player.sessionId}>
              <img src={avatarSrc(player.avatarId)} alt="" />
              <strong>{player.nickname}</strong>
              <span className={genshin.submittedSessionIds.includes(player.sessionId) ? "submitted" : ""}>
                {genshin.submittedSessionIds.includes(player.sessionId) ? "Répondu" : "En attente"}
              </span>
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
