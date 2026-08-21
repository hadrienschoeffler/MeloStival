# MeloStival

MeloStival est une application web temps réel conçue pour organiser des quiz entre amis, notamment pendant des sessions vocales ou des streams.

Un Host crée un salon temporaire, partage son code avec les participants, puis lance l’un des outils de quiz disponibles. Aucun compte n’est nécessaire : chaque joueur choisit simplement un pseudo et un avatar.

## Fonctionnalités

### Salons

- création et connexion par code à six caractères ;
- identification sans compte avec pseudo et avatar ;
- synchronisation en temps réel avec Socket.IO ;
- restauration automatique de la session après une déconnexion ;
- un seul salon actif à la fois ;
- fermeture du salon et expulsion des participants lorsque l’Host le quitte ;
- délai de reconnexion configurable en cas de perte de connexion involontaire.

### Buzzer

- verrouillage sur le premier participant qui buzze ;
- déclenchement par clic ou avec la barre espace ;
- affichage immédiat du pseudo et de l’avatar ;
- attribution d’un point par l’Host ;
- remise en jeu sans attribution de point ;
- option limitant chaque participant à un buzz par question ;
- passage manuel à la question suivante ;
- scores en direct et classement final.

### Genshin Guesser

Chaque localisation se déroule en trois questions :

1. retrouver la région à partir d’une capture POV ;
2. retrouver la sous-région à partir de sa carte ;
3. retrouver une case sur une grille.

Le mode inclut également :

- un timer synchronisé avec le serveur : 30 secondes pour les deux premières questions et 45 secondes pour la grille ;
- l’envoi automatique de la réponse présente dans le champ à la fin du timer ;
- un récapitulatif après chaque question ;
- l’image de correction, les avatars, les pseudos et les réponses colorées ;
- une validation manuelle par l’Host en cas de faute d’orthographe ;
- 1 point par bonne région ou sous-région ;
- 2 points pour la case exacte et 1 point pour une case adjacente ;
- une galerie plein écran avec zoom, déplacement et navigation entre les images ;
- un classement final avant le retour au salon.

Les bonnes réponses restent côté serveur pendant la saisie et ne sont révélées aux clients qu’au moment du récapitulatif.

## Technologies

- React 19
- TypeScript
- Vite
- Node.js et Express
- Socket.IO
- npm workspaces

## Installation locale

### Prérequis

- Node.js 20 ou supérieur
- npm

Depuis la racine du dépôt :

```bash
npm install
npm run dev
```

L’application est alors disponible sur :

- frontend : `http://localhost:5173`
- serveur : `http://localhost:3001`
- contrôle de santé : `http://localhost:3001/health`

Le serveur, le client et la surveillance des avatars sont lancés simultanément.

### Build de production

```bash
npm run build
```

Pour démarrer uniquement le serveur compilé :

```bash
npm start
```

## Variables d’environnement

Les valeurs locales par défaut permettent de lancer directement le projet. Les variables disponibles sont documentées dans `.env.example` :

| Variable | Valeur locale | Description |
| --- | --- | --- |
| `PORT` | `3001` | Port HTTP du serveur. Render le fournit automatiquement. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Origine autorisée par CORS. |
| `ROOM_DISCONNECT_GRACE_MS` | `1800000` | Délai avant la suppression d’un joueur déconnecté. |
| `VITE_SERVER_URL` | `http://localhost:3001` | Adresse publique du serveur utilisée par le client. |

## Ajouter des avatars

Place les fichiers dans :

```text
client/public/avatars/
```

Formats acceptés : `.webp`, `.png`, `.jpg`, `.jpeg` et `.svg`.

La liste TypeScript est générée automatiquement au lancement et pendant le développement. Pour forcer sa régénération :

```bash
npm run avatars
```

Il ne faut pas modifier manuellement `client/src/generated/avatars.ts`.

## Configurer le Genshin Guesser

Les images publiques se placent dans :

```text
client/public/genshin/
```

Le catalogue et les réponses se configurent exclusivement dans :

```text
server/src/genshin-content.ts
```

Exemple de localisation :

```ts
{
  id: "1",
  title: "Entrée d'Enkanomiya",
  povImage: "/genshin/Lieu_1.png",
  regionMapImage: "/genshin/Enkanomiya.PNG",
  gridImage: "/genshin/entree.PNG",
  answerGridImage: "/genshin/entree-reponse.PNG",
  answers: [
    ["Enkanomiya"],
    ["Entrée", "Entree"],
    ["F15", "F 15"],
  ],
}
```

Chaque localisation utilise quatre images :

- `povImage` : capture du lieu ;
- `regionMapImage` : carte de la région ;
- `gridImage` : grille affichée pendant la question ;
- `answerGridImage` : grille de correction affichée au récapitulatif.

Le tableau `answers` contient respectivement les réponses acceptées pour la région, la sous-région et la case. Plusieurs variantes peuvent être indiquées. Les comparaisons ignorent la casse, les accents et les espaces superflus.

Attention à respecter exactement la casse des noms de fichiers : Render utilise un environnement Linux sensible aux majuscules et minuscules.

## Déploiement sur Render

Le frontend et le serveur doivent être créés comme deux services séparés depuis le même dépôt GitHub.

### Serveur — Web Service

Laisse le champ **Root Directory** vide.

Build Command :

```bash
npm ci && npm run build -w server
```

Start Command :

```bash
npm run start -w server
```

Health Check Path :

```text
/health
```

Variables :

```text
CLIENT_ORIGIN=https://ADRESSE-DU-FRONTEND.onrender.com
ROOM_DISCONNECT_GRACE_MS=1800000
```

Ne définis pas `PORT` sur Render.

### Frontend — Static Site

Laisse également **Root Directory** vide.

Build Command :

```bash
npm ci && npm run avatars && npm run build -w client
```

Publish Directory :

```text
client/dist
```

Variable :

```text
VITE_SERVER_URL=https://ADRESSE-DU-SERVEUR.onrender.com
```

Déploie d’abord le serveur pour obtenir son adresse, puis le frontend. Une fois l’adresse du frontend connue, renseigne-la dans `CLIENT_ORIGIN` sans `/` final et redéploie le serveur.

## Architecture

```text
MeloStival/
├── client/
│   ├── public/
│   │   ├── avatars/
│   │   └── genshin/
│   └── src/
│       ├── components/
│       ├── generated/
│       ├── lib/
│       └── types/
├── server/
│   └── src/
│       ├── genshin-content.ts
│       ├── index.ts
│       ├── rooms.ts
│       └── types.ts
├── scripts/
├── package.json
└── README.md
```

Le serveur est la source de vérité pour les salons, les timers, les buzzers, les réponses et les scores. Le client ne fait qu’afficher l’état public reçu et envoyer les actions des joueurs.

## Limites actuelles

- Les salons et les parties sont conservés uniquement en mémoire.
- Un redémarrage ou un nouveau déploiement du serveur ferme donc la partie active.
- L’application doit rester sur une seule instance serveur tant qu’aucun stockage partagé n’est ajouté.
- Le contenu du Genshin Guesser est ajouté manuellement dans le catalogue TypeScript.

## Commandes utiles

| Commande | Action |
| --- | --- |
| `npm run dev` | Lance le client, le serveur et la surveillance des avatars. |
| `npm run build` | Compile le serveur et génère le client de production. |
| `npm start` | Démarre le serveur compilé. |
| `npm run avatars` | Régénère la liste des avatars. |
| `npm run check` | Vérifie que les dépendances indispensables sont installées. |
