import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { CrosswordGridId, CrosswordState, CrosswordWord, PublicRoom } from "../types/room";
import { avatarSrc } from "../lib/avatars";
import { Brand } from "./Brand";

interface CrosswordScreenProps {
  room: PublicRoom;
  crossword: CrosswordState;
  privateLetters: Record<string, string>;
  completed: boolean;
  selectedGridId: CrosswordGridId | null;
  activeGridId: CrosswordGridId | null;
  sessionId: string;
  serverConnected: boolean;
  serverTimeOffsetMs: number;
  onLetter: (row: number, column: number, letter: string) => Promise<void>;
  onSelectGrid: (gridId: CrosswordGridId) => Promise<void>;
  onStartHardcore: () => Promise<void>;
  onBegin: () => Promise<void>;
  onEnd: () => Promise<void>;
  onAdvance: () => Promise<void>;
  onReturn: () => Promise<void>;
}

interface CellDefinition {
  row: number;
  column: number;
  words: CrosswordWord[];
  number?: number;
}

function keyOf(row: number, column: number) {
  return `${row}:${column}`;
}

function cellsForWord(word: CrosswordWord) {
  return Array.from({ length: word.length }, (_, index) => ({
    row: word.row + (word.direction === "down" ? index : 0),
    column: word.column + (word.direction === "across" ? index : 0),
  }));
}

export function CrosswordScreen({ room, crossword, privateLetters, selectedGridId, activeGridId, sessionId, serverConnected, serverTimeOffsetMs, onLetter, onSelectGrid, onStartHardcore, onBegin, onEnd, onAdvance, onReturn }: CrosswordScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(new Map<string, string>());
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [optimisticLetters, setOptimisticLetters] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showHardcoreChoice, setShowHardcoreChoice] = useState(false);
  const me = room.players.find((player) => player.sessionId === sessionId);
  const isHost = me?.role === "host";
  const displayedGridId = crossword.phase === "review" ? crossword.reviewGridId : activeGridId;
  const grid = crossword.grids.find((candidate) => candidate.id === displayedGridId) ?? null;

  useEffect(() => {
    if (crossword.phase !== "playing") return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [crossword.phase]);

  useEffect(() => {
    setSelectedCell(null);
    setSelectedWordId(null);
    setOptimisticLetters({});
    pendingRef.current.clear();
    setShowHardcoreChoice(false);
  }, [displayedGridId]);

  const cells = useMemo(() => {
    const result = new Map<string, CellDefinition>();
    for (const word of grid?.words ?? []) {
      for (const position of cellsForWord(word)) {
        const key = keyOf(position.row, position.column);
        const existing = result.get(key);
        if (existing) existing.words.push(word);
        else result.set(key, { ...position, words: [word] });
      }
      const startKey = keyOf(word.row, word.column);
      const start = result.get(startKey);
      if (start) start.number = Math.min(start.number ?? word.number, word.number);
    }
    return result;
  }, [grid]);

  const highlightedWordId = crossword.phase === "review" ? crossword.activeWordId : selectedWordId;
  const selectedWord = grid?.words.find((word) => word.id === highlightedWordId) ?? null;
  const selectedWordCells = useMemo(
    () => new Set(selectedWord ? cellsForWord(selectedWord).map(({ row, column }) => keyOf(row, column)) : []),
    [selectedWord],
  );
  const displayedLetters = crossword.phase === "review"
    ? crossword.correctionLetters
    : { ...privateLetters, ...optimisticLetters };
  const remainingSeconds = Math.max(0, Math.ceil((crossword.responseDeadline - (now + serverTimeOffsetMs)) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  const canWrite = !isHost && Boolean(grid) && crossword.phase === "playing" && remainingSeconds > 0;
  const acrossWords = (grid?.words ?? [])
    .filter((word) => word.direction === "across")
    .sort((left, right) => left.number - right.number);
  const downWords = (grid?.words ?? [])
    .filter((word) => word.direction === "down")
    .sort((left, right) => left.number - right.number);
  const reviewWords = [...(grid?.words ?? [])]
    .sort((left, right) => left.number - right.number || left.direction.localeCompare(right.direction));
  const nextReviewWord = reviewWords[crossword.reviewWordIndex];
  const reviewGridPosition = crossword.reviewGridId
    ? crossword.grids.findIndex((candidate) => candidate.id === crossword.reviewGridId)
    : -1;
  const nextReviewGrid = crossword.grids[reviewGridPosition + 1];
  const hardcoreGrid = crossword.grids.find((candidate) => candidate.id === "hardcore");
  const connectedParticipants = room.players.filter(
    (player) => player.role === "participant" && player.connected,
  );
  const selectedParticipantCount = connectedParticipants.filter(
    (player) => crossword.selectedSessionIds.includes(player.sessionId),
  ).length;
  const everyoneSelected = connectedParticipants.length > 0 && selectedParticipantCount === connectedParticipants.length;
  const ranking = useMemo(
    () => room.players
      .filter((player) => player.role === "participant")
      .map((player) => ({ player, score: crossword.scores[player.sessionId] ?? 0 }))
      .sort((left, right) => right.score - left.score || left.player.joinedAt - right.player.joinedAt),
    [crossword.scores, room.players],
  );

  function selectCell(cell: CellDefinition) {
    if (!canWrite) return;
    const key = keyOf(cell.row, cell.column);
    let nextWord = cell.words.find((word) => word.id === selectedWordId) ?? cell.words[0];
    if (selectedCell === key && cell.words.length > 1) {
      const currentIndex = cell.words.findIndex((word) => word.id === selectedWordId);
      nextWord = cell.words[(currentIndex + 1) % cell.words.length];
    }
    setSelectedCell(key);
    setSelectedWordId(nextWord.id);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function moveInWord(offset: number, fromKey = selectedCell) {
    if (!selectedWord || !fromKey) return;
    const positions = cellsForWord(selectedWord);
    const index = positions.findIndex(({ row, column }) => keyOf(row, column) === fromKey);
    const next = positions[index + offset];
    if (!next) return;
    setSelectedCell(keyOf(next.row, next.column));
  }

  function sendLetter(row: number, column: number, letter: string) {
    const key = keyOf(row, column);
    pendingRef.current.set(key, letter);
    setOptimisticLetters((current) => ({ ...current, [key]: letter }));
    setError(null);
    void onLetter(row, column, letter)
      .then(() => {
        if (pendingRef.current.get(key) !== letter) return;
        pendingRef.current.delete(key);
        setOptimisticLetters((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      })
      .catch((actionError) => {
        if (pendingRef.current.get(key) === letter) pendingRef.current.delete(key);
        setOptimisticLetters((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setError(actionError instanceof Error ? actionError.message : "Impossible de modifier la grille.");
      });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!selectedCell || !canWrite) return;
    const cell = cells.get(selectedCell);
    if (!cell) return;

    if (/^[a-zA-ZÀ-ÿ]$/.test(event.key)) {
      event.preventDefault();
      const letter = event.key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      sendLetter(cell.row, cell.column, letter);
      moveInWord(1);
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (displayedLetters[selectedCell]) sendLetter(cell.row, cell.column, "");
      else {
        const positions = selectedWord ? cellsForWord(selectedWord) : [];
        const index = positions.findIndex(({ row, column }) => keyOf(row, column) === selectedCell);
        const previous = positions[index - 1];
        if (previous) {
          setSelectedCell(keyOf(previous.row, previous.column));
          sendLetter(previous.row, previous.column, "");
        }
      }
      return;
    }

    const movements: Record<string, [number, number]> = {
      ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
    };
    const movement = movements[event.key];
    if (movement) {
      event.preventDefault();
      const target = cells.get(keyOf(cell.row + movement[0], cell.column + movement[1]));
      if (target) selectCell(target);
    }
  }

  async function returnToLobby() {
    if (returning) return;
    setReturning(true);
    setError(null);
    try { await onReturn(); }
    catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de revenir au salon.");
      setReturning(false);
    }
  }

  async function endGame() {
    if (returning) return;
    setReturning(true);
    setError(null);
    try {
      await onEnd();
      setReturning(false);
    }
    catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de terminer la partie.");
      setReturning(false);
    }
  }

  async function advanceReview() {
    if (returning) return;
    setReturning(true);
    setError(null);
    try {
      await onAdvance();
      setReturning(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de poursuivre la correction.");
      setReturning(false);
    }
  }

  async function chooseGrid(gridId: CrosswordGridId) {
    if (returning) return;
    setReturning(true);
    setError(null);
    try {
      await onSelectGrid(gridId);
      setReturning(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de choisir cette grille.");
      setReturning(false);
    }
  }

  async function beginGame() {
    if (returning) return;
    setReturning(true);
    setError(null);
    try {
      await onBegin();
      setReturning(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de démarrer la partie.");
      setReturning(false);
    }
  }

  async function startHardcore() {
    if (returning) return;
    setReturning(true);
    setError(null);
    try {
      await onStartHardcore();
      setReturning(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de lancer la grille Hardcore.");
      setReturning(false);
    }
  }

  if (crossword.phase === "results") {
    return (
      <main className="crossword-shell results-shell">
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
          {ranking.length === 0 && <p className="empty-ranking">Aucun participant.</p>}
          {isHost ? (
            <button className="primary-button" type="button" disabled={returning} onClick={() => void returnToLobby()}>
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
    <main className="crossword-shell">
      <header className="guesser-header crossword-header">
        <div>
          <Brand compact />
          <h1 className="page-title">Mots croisés</h1>
        </div>
        <div className="header-actions">
          {!serverConnected && <span className="status-banner warning">Reconnexion…</span>}
          {isHost && <button className="ghost-button danger" type="button" disabled={returning} onClick={() => void returnToLobby()}>Quitter le jeu</button>}
        </div>
      </header>

      {crossword.phase === "playing" && (
        <div className={`crossword-timer ${remainingSeconds <= 60 ? "urgent" : ""}`} role="timer">
          Temps restant : {minutes}:{seconds}
        </div>
      )}
      {isHost && crossword.phase === "playing" && (
        <div className="crossword-end-action">
          <button className="primary-button" type="button" disabled={returning} onClick={() => void endGame()}>
            Terminer la partie
          </button>
        </div>
      )}
      {crossword.phase === "review" && (
        <h2 className="crossword-review-title">Correction{grid ? ` — ${grid.label}` : ""}</h2>
      )}
      {isHost && crossword.phase === "review" && (
        <div className="crossword-end-action">
          <button className="primary-button" type="button" disabled={returning} onClick={() => void advanceReview()}>
            {nextReviewWord
              ? `Afficher le mot ${nextReviewWord.number} ${nextReviewWord.direction === "across" ? "horizontal" : "vertical"}`
              : nextReviewGrid
                ? `Passer à la correction ${nextReviewGrid.label}`
                : "Voir le classement"}
          </button>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      {isHost && crossword.phase === "setup" && (
        <section className="crossword-level-picker app-panel">
          <h2>Choix des grilles</h2>
          <p className="crossword-selection-count">
            <strong>{selectedParticipantCount}</strong> / {connectedParticipants.length} participant(s) prêt(s)
          </p>
          <button className="primary-button" type="button" disabled={returning || !everyoneSelected} onClick={() => void beginGame()}>
            Démarrer la partie
          </button>
        </section>
      )}

      {!isHost && crossword.phase === "setup" && (
        <section className="crossword-level-picker app-panel">
          <h2>Choisis ta grille</h2>
          <div className="crossword-level-options">
            {crossword.grids.filter((candidate) => candidate.id !== "hardcore").map((candidate) => (
              <button
                key={candidate.id}
                className={selectedGridId === candidate.id ? "selected" : ""}
                type="button"
                disabled={returning}
                onClick={() => void chooseGrid(candidate.id)}
              >
                <strong>{candidate.label}</strong>
                <span>{candidate.pointsPerWord} point{candidate.pointsPerWord > 1 ? "s" : ""} par mot</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {grid && (crossword.phase === "playing" && !isHost || crossword.phase === "review") && (
      <div className="crossword-layout">
        <aside className="crossword-clues crossword-clues-across app-panel">
          <h2 className="panel-title">Horizontal</h2>
          <div className="crossword-clue-list">
            {acrossWords.map((word) => (
              <button key={word.id} type="button" className={`crossword-clue ${highlightedWordId === word.id ? "selected" : ""}`} onClick={() => {
                if (!canWrite) return;
                setSelectedWordId(word.id);
                setSelectedCell(keyOf(word.row, word.column));
                window.requestAnimationFrame(() => inputRef.current?.focus());
              }}>
                <strong>{word.number}.</strong>{" "}<span>{word.clue}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="crossword-board-panel app-panel" aria-disabled={!canWrite}>
          <div
            className="crossword-grid"
            style={{ gridTemplateColumns: `repeat(${grid.columns}, 36px)` }}
            aria-label="Grille de mots croisés"
          >
            {Array.from({ length: grid.rows * grid.columns }, (_, index) => {
              const row = Math.floor(index / grid.columns);
              const column = index % grid.columns;
              const key = keyOf(row, column);
              const cell = cells.get(key);
              if (!cell) return <span className="crossword-cell blocked" key={key} />;
              return (
                <button
                  key={key}
                  className={`crossword-cell playable ${selectedWordCells.has(key) ? "word-selected" : ""} ${selectedCell === key ? "selected" : ""}`}
                  type="button"
                  onClick={() => selectCell(cell)}
                  disabled={!canWrite}
                  aria-label={`Case ${row + 1}, ${column + 1}`}
                >
                  {cell.number && <span className="crossword-cell-number">{cell.number}</span>}
                  <span className="crossword-letter">{displayedLetters[key] ?? ""}</span>
                </button>
              );
            })}
          </div>
          <input ref={inputRef} className="crossword-keyboard-input" onKeyDown={handleKeyDown} aria-label="Saisir une lettre" autoComplete="off" />
        </section>

        <aside className="crossword-clues crossword-clues-down app-panel">
          <h2 className="panel-title">Vertical</h2>
          <div className="crossword-clue-list">
            {downWords.map((word) => (
              <button key={word.id} type="button" className={`crossword-clue ${highlightedWordId === word.id ? "selected" : ""}`} onClick={() => {
                if (!canWrite) return;
                setSelectedWordId(word.id);
                setSelectedCell(keyOf(word.row, word.column));
                window.requestAnimationFrame(() => inputRef.current?.focus());
              }}>
                <strong>{word.number}.</strong>{" "}<span>{word.clue}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
      )}

      {!isHost && crossword.phase === "playing" && activeGridId && activeGridId !== "hardcore" && (
        <div className="crossword-hardcore-action">
          {!showHardcoreChoice ? (
            <button className="primary-button" type="button" onClick={() => setShowHardcoreChoice(true)}>
              J'ai terminé
            </button>
          ) : (
            <div className="crossword-hardcore-choice app-panel">
              <strong>Passer à la grille Hardcore ?</strong>
              <span>Chaque mot correct y rapporte {hardcoreGrid?.pointsPerWord ?? 5} points. Tu ne pourras pas revenir à ta première grille.</span>
              <div>
                <button className="ghost-button" type="button" disabled={returning} onClick={() => setShowHardcoreChoice(false)}>Continuer cette grille</button>
                <button className="primary-button" type="button" disabled={returning} onClick={() => void startHardcore()}>Passer en Hardcore</button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
