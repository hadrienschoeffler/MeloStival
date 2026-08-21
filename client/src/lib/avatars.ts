import { AVATARS } from "../generated/avatars";

export { AVATARS };

export function avatarSrc(avatarId: string): string {
  return AVATARS.find((avatar) => avatar.id === avatarId)?.src ?? AVATARS[0]?.src ?? "";
}
