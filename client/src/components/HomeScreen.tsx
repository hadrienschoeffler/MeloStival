import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AVATARS } from "../lib/avatars";
import { AvatarPicker } from "./AvatarPicker";
import { Brand } from "./Brand";

interface HomeScreenProps {
  busy: boolean;
  canCreateRoom: boolean;
  connectionError: string | null;
  onCreate: (nickname: string, avatarId: string) => Promise<void>;
  onJoin: (roomCode: string, nickname: string, avatarId: string) => Promise<void>;
}

export function HomeScreen({ busy, canCreateRoom, connectionError, onCreate, onJoin }: HomeScreenProps) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [avatarId, setAvatarId] = useState(AVATARS[0]?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!canCreateRoom) setMode("join");
  }, [canCreateRoom]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const cleanNickname = nickname.trim();
    if (cleanNickname.length < 1) {
      setFormError("Un pseudo est requis.");
      return;
    }

    if (!avatarId) {
      setFormError("Aucun avatar n'est disponible.");
      return;
    }

    if (mode === "join" && roomCode.trim().length !== 6) {
      setFormError("Le code du salon doit contenir 6 caractères.");
      return;
    }

    try {
      if (mode === "create") {
        await onCreate(cleanNickname, avatarId);
      } else {
        await onJoin(roomCode.trim().toUpperCase(), cleanNickname, avatarId);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  }

  return (
    <main className="home-shell">
      <section className="home-panel app-panel">
        <Brand />

        <div className="mode-switch" role="tablist" aria-label="Mode de connexion">
          {canCreateRoom && (
            <button
              type="button"
              className={mode === "create" ? "active" : ""}
              onClick={() => setMode("create")}
              role="tab"
              aria-selected={mode === "create"}
            >
              Créer un salon
            </button>
          )}
          <button
            type="button"
            className={mode === "join" ? "active" : ""}
            onClick={() => setMode("join")}
            role="tab"
            aria-selected={mode === "join"}
          >
            Rejoindre
          </button>
        </div>

        <form className="join-form" onSubmit={submit}>
          {mode === "join" && (
            <label>
              <span className="field-label">Code du salon</span>
              <input
                type="password"
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z2-9]/g, "")
                      .slice(0, 6),
                  )
                }
                autoComplete="off"
                placeholder="ABC234"
                className="room-code-input room-code-input-masked"
              />
            </label>
          )}

          <label>
            <span className="field-label">Pseudo</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value.slice(0, 24))}
              autoComplete="nickname"
              placeholder="Pseudo"
              maxLength={24}
            />
          </label>

          <AvatarPicker value={avatarId} onChange={setAvatarId} />

          {(formError || connectionError) && (
            <div className="form-error" role="alert">
              {formError ?? connectionError}
            </div>
          )}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Connexion…" : mode === "create" ? "Créer" : "Rejoindre"}
          </button>
        </form>
      </section>
    </main>
  );
}
