import { AVATARS } from "../lib/avatars";

interface AvatarPickerProps {
  value: string;
  onChange: (avatarId: string) => void;
}

export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  return (
    <fieldset className="avatar-fieldset">
      <legend>Choisis un avatar</legend>
      <div className="avatar-grid" role="radiogroup" aria-label="Choix de l'avatar">
        {AVATARS.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            className={`avatar-choice ${value === avatar.id ? "selected" : ""}`}
            onClick={() => onChange(avatar.id)}
            aria-pressed={value === avatar.id}
          >
            <img src={avatar.src} alt={avatar.label} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
