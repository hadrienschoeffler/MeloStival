import { avatarSrc } from "../lib/avatars";
import type { PublicPlayer } from "../types/room";

interface PlayerCardProps {
  player: PublicPlayer;
  isCurrentUser: boolean;
}

export function PlayerCard({ player, isCurrentUser }: PlayerCardProps) {
  return (
    <article className={`player-card ${player.connected ? "" : "offline"}`}>
      <div className="player-avatar-wrap">
        <img className="player-avatar" src={avatarSrc(player.avatarId)} alt="" />
        <span
          className={`presence-dot ${player.connected ? "online" : ""}`}
          title={player.connected ? "Connecté" : "Déconnecté"}
        />
      </div>

      <div className="player-name" title={player.nickname}>
        {player.nickname}
      </div>

      <div className="player-badges">
        {player.role === "host" && <span className="badge host-badge">Host</span>}
        {isCurrentUser && <span className="badge you-badge">Vous</span>}
        {!player.connected && <span className="badge offline-badge">Déconnecté</span>}
      </div>
    </article>
  );
}
