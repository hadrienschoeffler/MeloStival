export type BackgroundMode = "color" | "image";

export const THEME = {
  background: {
    // "color" = fond uni inspiré de l'icône MeloStival.
    // "image" = utilise l'image indiquée dans imageUrl avec un voile pour garder l'interface lisible.
    mode: "color" as BackgroundMode,
    imageUrl: "/backgrounds/background.webp",
  },
};

export function applyTheme() {
  const root = document.documentElement;
  root.dataset.background = THEME.background.mode;
  root.style.setProperty("--app-background-image", `url("${THEME.background.imageUrl}")`);
}
