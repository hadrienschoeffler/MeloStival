# MeloStival

## Installation

Prérequis : Node.js 20 ou supérieur.

À la racine du projet :

```bash
npm install
npm run dev
```

- interface : http://localhost:5173
- serveur : http://localhost:3001

Pour créer la version de production :

```bash
npm run build
```

`npm install` doit être exécuté au moins une fois avant `npm run dev` ou `npm run build`.

## Avatars

Dossier :

```text
client/public/avatars/
```

Formats acceptés :

```text
.webp
.png
.jpg
.jpeg
.svg
```

Les noms de fichiers sont libres, par exemple :

```text
furina.webp
nahida.webp
venti.png
avatar-01.svg
```

La liste des avatars est générée automatiquement. Il ne faut plus modifier `client/src/lib/avatars.ts`.

Pendant `npm run dev`, les changements du dossier `client/public/avatars/` sont détectés automatiquement.

Pour forcer manuellement la régénération :

```bash
npm run avatars
```

## Build : erreur `tsc n'est pas reconnu`

Cette erreur signifie que les dépendances npm, notamment TypeScript, ne sont pas installées dans le projet.

Exécuter depuis la racine :

```bash
npm install
npm run build
```

Le projet vérifie maintenant la présence de TypeScript avant le lancement et affiche une erreur explicite si les dépendances manquent.

## Structure

```text
melostival/
├─ client/
│  ├─ public/avatars/
│  └─ src/
├─ server/
├─ scripts/
└─ package.json
```

## Thème MeloStival

Le thème est centralisé dans `client/src/styles.css` et reprend la palette de `icone_melo.png`. L’icône est également utilisée comme favicon et repère visuel de la marque.

### Choisir le fond

Le comportement du fond se règle dans `client/src/theme.ts` :

```ts
mode: "color"
```

utilise le fond beige du thème. Pour utiliser une image :

1. ajoute `client/public/backgrounds/background.webp` ;
2. remplace `mode: "color"` par `mode: "image"`.

Le mode image ajoute automatiquement un voile beige afin de préserver la lisibilité. Tu peux changer le chemin de l’image via `imageUrl` dans le même fichier.


## Contenu du Genshin Guesser

Les localisations du quiz sont configurées côté serveur dans :

```text
server/src/genshin-content.ts
```

Chaque localisation contient quatre images publiques : la POV, la carte de région, la grille de question et la grille de correction. Elle contient également les réponses acceptées pour la région, la sous-région et la case. Les réponses ne sont envoyées aux participants qu'au moment du récapitulatif.

Place les images dans :

```text
client/public/genshin/
```

Une localisation de démonstration et trois visuels neutres sont fournis. Ils peuvent être remplacés dès que les images définitives sont disponibles.
