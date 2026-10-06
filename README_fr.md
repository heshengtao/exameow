<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Exameow — Générateur de questions d'examen alimenté par l'IA : téléversez des supports d'étude, obtenez des questions d'examen en quelques secondes">
</p>

<p align="center">
  <a href="https://github.com/heshengtao/exameow/releases"><img src="https://img.shields.io/github/v/release/heshengtao/exameow?style=flat-square&color=1A6CFF" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-1A6CFF?style=flat-square" alt="Licence : Apache-2.0"></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20/%20macOS%20/%20Linux%20/%20Android%20/%20Web-1A6CFF?style=flat-square" alt="Plateformes : Windows, macOS, Linux, Android, Web">
  <a href="https://hub.docker.com/r/ailm32442/exameow"><img src="https://img.shields.io/docker/pulls/ailm32442/exameow?style=flat-square&color=1A6CFF" alt="Téléchargements Docker"></a>
</p>

<p align="center">
  <a href="README_zh.md"><b>简体中文</b></a> ·
  <a href="README_zh_TW.md"><b>繁體中文</b></a> ·
  <a href="README.md"><b>English</b></a> ·
  <a href="README_ja.md"><b>日本語</b></a> ·
  <a href="README_ko.md"><b>한국어</b></a> ·
  <a href="README_es.md"><b>Español</b></a> ·
  <a href="README_fr.md"><b>Français</b></a> ·
  <a href="README_de.md"><b>Deutsch</b></a> ·
  <a href="README_ru.md"><b>Русский</b></a> ·
  <a href="README_ar.md"><b>العربية</b></a>
</p>

<p align="center">
  <a href="https://exam.superagentparty.com/"><b>Démo en direct</b></a> ·
  <a href="https://github.com/heshengtao/exameow/releases">Télécharger</a> ·
  <a href="https://hub.docker.com/r/ailm32442/exameow">Docker Hub</a>
</p>

## Qu'est-ce qu'Exameow ?

**Exameow (过了喵)** est un **générateur de questions d'examen open-source alimenté par l'IA** qui transforme vos supports d'étude en questions d'examen de qualité professionnelle en quelques secondes. Téléversez des fichiers PDF, des documents Word, des présentations PowerPoint, des images ou du texte — l'IA lit le contenu et génère des questions à choix unique, choix multiple, vrai/faux, texte à trous et réponse courte adaptées à vos besoins.

Contrairement à d'autres générateurs de quiz IA qui nécessitent la création d'un compte, des abonnements payants ou l'envoi de vos données dans le cloud, Exameow est **conçu selon une approche locale et axée sur la confidentialité**. Vos banques de questions, vos historiques d'entraînement et le suivi de vos erreurs restent sur votre appareil. Les applications de bureau et mobiles fonctionnent **entièrement hors ligne** avec votre propre clé d'API compatible OpenAI (OpenAI, DeepSeek, Qwen, GLM ou tout modèle auto-hébergé).

Pour les enseignants et les formateurs, Exameow intègre un **système d'examen en ligne** complet — publiez des examens à partir de vos banques de questions locales, partagez un code à 6 chiffres, et les étudiants rejoignent la session depuis n'importe quel navigateur. Correction instantanée, tableau de bord enseignant et protections anti-abus inclus. Auto-hébergez l'ensemble de la pile avec une seule commande Docker.

<p align="center">
  <a href="https://exam.superagentparty.com/"><img src="screenshots/Cover.png" width="100%" alt="Interface bureau et mobile d'Exameow"></a>
</p>

## Démo en direct

Essayez-le en ligne : **[exam.superagentparty.com](https://exam.superagentparty.com/)**

La démo fonctionne sur Cloudflare Workers avec l'offre gratuite Workers AI :

- ⏳ **Quota quotidien limité** — L'allocation d'IA gratuite de Cloudflare est réinitialisée chaque jour
- 📄 **Limite de la fenêtre de contexte** — Les grands documents seront tronqués pour s'adapter à la fenêtre de contexte du modèle

Pour une utilisation illimitée, auto-hébergez l'application avec Docker ou utilisez les applications de bureau/mobiles avec votre propre clé d'API.

## Fonctionnalités

### ✨ Génération de questions par IA — Téléversez des fichiers, obtenez des questions d'examen

Exameow analyse les supports d'étude dans **plus de 10 formats de fichiers** — PDF, DOCX, XLSX, PPTX, EPUB, ODT, TXT, CSV, HTML et images (PNG/JPG/WEBP/GIF/BMP). Téléversez un fichier ou glissez-déposez plusieurs fichiers à la fois. L'IA génère des questions dans **5 types de questions** : choix unique, choix multiple, vrai/faux, texte à trous et réponse courte. Contrôlez le nombre de questions par type, le niveau de difficulté (facile/moyen/difficile), la langue de sortie et le filtrage par sujet ou chapitre. Les grands documents sont automatiquement découpés et générés par lots avec déduplication. Compatible avec n'importe quelle API compatible OpenAI — OpenAI, DeepSeek, Qwen, GLM, etc. ; ou utilisez l'IA gratuite Cloudflare intégrée sur le site de démo. Exportez les résultats au format XLSX ou CSV.

- **Formats d'entrée riches** — PDF, DOCX, XLSX, PPTX, EPUB, ODT, TXT, CSV, HTML, images (PNG/JPG/WEBP/GIF/BMP) et tout fichier texte/code ; téléversement de fichiers multiples par glisser-déposer
- **5 types de questions** — Choix unique, choix multiple, vrai/faux, texte à trous, réponse courte, avec contrôle du nombre par type
- **Contrôle précis** — Difficulté (facile/moyen/difficile), langue de sortie et filtrage par sujet/chapitre
- **Lotissement intelligent** — Les grands documents sont automatiquement découpés et générés par lots avec déduplication
- **Compatible avec toute API OpenAI** — OpenAI, DeepSeek, Qwen, GLM, etc. ; ou utilisez l'IA gratuite Cloudflare intégrée sur la démo
- **Exportation** — Téléchargez les résultats au format XLSX ou CSV

### 📚 Modes d'entraînement — Étudiez plus intelligemment, pas plus durement

Transformez les questions générées en sessions d'étude interactives. Entraînez-vous dans l'ordre, mélangez aléatoirement les questions et les options, ou passez un examen blanc chronométré avec des épreuves générées automatiquement. Les erreurs sont automatiquement suivies et révisées — répondez correctement à une question plusieurs fois de suite pour la retirer de la liste des erreurs. Basculez librement entre le mode examen (répondre à l'aveugle) et le mode cartes mémoire (réponses visibles). Les questions à réponse courte sont évaluées par l'IA par rapport aux réponses de référence, avec possibilité de réévaluation manuelle. Importez et exportez vos banques de questions au format XLSX/CSV avec correspondance intelligente des colonnes.

- **Entraînement séquentiel** — Parcourez la banque de questions dans l'ordre
- **Entraînement aléatoire** — Questions et options mélangées pour une meilleure mémorisation
- **Examen blanc** — Générez automatiquement une épreuve d'examen aléatoire à partir de n'importe quelle banque avec configuration des types
- **Révision des erreurs** — Enregistrez les erreurs, entraînez-vous uniquement sur vos erreurs et observez-les disparaître au fur et à mesure de vos progrès
- **Modes Examen / Cartes mémoire** — Répondez à l'aveugle ou parcourez les questions avec réponses visibles
- **Correction par IA** — Questions à réponse courte évaluées par l'IA par rapport aux réponses de référence avec commentaires ; correction manuelle prise en charge
- **Gestion des banques de questions** — Importez des banques depuis XLSX/CSV avec correspondance intelligente des colonnes ; exportez à tout moment

### 📝 Examens en ligne — Publiez et invitez des étudiants

Composez des examens à partir de plusieurs banques de questions locales avec configuration du nombre de questions et de la valeur des points par type. Définissez un titre, une heure de début et une durée. Partagez un **code à 6 chiffres** ou un lien d'examen — les étudiants rejoignent la session depuis le navigateur de n'importe quel appareil, sans aucune installation d'application. Un compte à rebours local avec soumission automatique garantit l'équité ; la progression est conservée en cas de rafraîchissement de la page. Les questions objectives sont corrigées côté serveur lors de la soumission avec affichage instantané des réponses et des explications. Le tableau de bord enseignant affiche les résultats triés par score avec le détail question par question. Les données d'examen sont automatiquement supprimées après 7 jours pour préserver la confidentialité. Anti-abus : 20 publications par IP par jour, le signalement en un clic par les étudiants suspend automatiquement l'examen dès 3 signalements provenant d'IP distinctes. L'**image Docker est entièrement autonome** — le relais d'examen fonctionne sur SQLite sans aucune dépendance envers le site de démo.

- **Lancement d'examens depuis des banques** — Composez des examens à partir de plusieurs banques locales avec nombre de questions et points par type ; définissez le titre, l'heure de début et la durée
- **Code à 6 chiffres + Lien d'examen** — Les étudiants rejoignent depuis n'importe quel navigateur d'appareil, sans installation d'application
- **Sessions chronométrées** — Compte à rebours local avec soumission automatique ; la progression survit au rafraîchissement de la page
- **Notation instantanée** — Questions objectives corrigées côté serveur avec réponses et explications lors de la soumission ; résultats enregistrés localement
- **Tableau de bord enseignant** — Résultats triés par score avec détail question par question ; mis en cache localement pour n'être récupérés qu'une seule fois à la fin de l'examen ; les enseignants peuvent supprimer un examen à tout moment (bloque immédiatement les étudiants et efface les résultats)
- **Confidentialité prioritaire** — Les données d'examen restent sur Cloudflare D1 pendant 7 jours maximum avant suppression automatique ; les réponses ne sont jamais envoyées avant la soumission
- **Mécanisme anti-abus** — Limite de 20 publications par IP par jour ; le signalement étudiant suspend automatiquement à partir de 3 IP distinctes ; les administrateurs examinent, restaurent ou suppriment depuis la page `#/admin`
- **Entièrement auto-hébergé** — L'image Docker intègre le même relais d'examen (SQLite) sans aucune dépendance envers le site de démo ; définissez `ADMIN_TOKEN` pour sécuriser la page d'administration (par défaut `pass`, modification obligatoire lors de la première visite sur `#/admin`)

### 🔍 Modes de recherche — Trouvez des réponses rapidement

Recherchez dans vos banques de questions locales en saisissant ou en collant une question — la résolution par IA optionnelle fournit des explications. La **recherche par photo** utilise un OCR local pour reconnaître les questions à partir de votre caméra ou d'images téléversées (le traitement s'effectue localement dans votre navigateur, aucun téléversement). La **recherche en direct par caméra** oriente votre caméra vers un écran ou une feuille et l'IA recherche les questions correspondantes en temps réel. La **recherche par capture d'écran** vous permet de dessiner une zone de capture sur n'importe quelle fenêtre — l'IA la surveille et affiche les réponses dans une superposition flottante (Windows/macOS/Linux/Android ; indisponible sur iOS en raison de restrictions système).

- **Recherche textuelle** — Saisissez ou collez une question pour trouver des correspondances dans vos banques locales, avec réponses IA optionnelles
- **Recherche par photo** — Prenez ou téléversez une photo de question ; OCR intégré au navigateur (aucun téléversement)
- **Recherche en direct par caméra** — Orientez votre caméra vers l'écran ou le papier ; l'IA surveille et associe les questions en temps réel
- **Recherche par capture d'écran** — Dessinez un cadre de capture sur n'importe quelle fenêtre ; l'IA surveille et associe les questions en direct avec une superposition flottante d'affichage des réponses (Windows / macOS / Linux / Android ; non disponible sur iOS en raison de restrictions système)

### 🌐 Multiplateforme et confidentialité — Vos données, votre appareil

Exameow fonctionne sur **Windows, macOS, Linux, Android et Web** (iOS via génération autonome). Déployez la version web avec **une seule commande Docker**. Toutes les banques de questions, les historiques d'entraînement et le suivi des erreurs sont stockés localement — rien n'est téléversé sur un serveur sauf si vous choisissez d'utiliser le relais d'examen en ligne. Les clés d'API sont chiffrées avec **AES-256-GCM** sur bureau. L'interface détecte automatiquement la langue du système avec basculement rapide.

- **Bureau & Mobile** — Windows, macOS, Linux, Android (iOS via génération autonome)
- **Web auto-hébergé** — Déploiement en une commande Docker
- **Local-first** — Les banques de questions et les historiques restent sur votre appareil ; clés d'API chiffrées avec AES-256-GCM sur bureau
- **Interface bilingue / multilingue** — Détection automatique de la langue du système, changement rapide

## Installation

Les paquets pré-compilés pour toutes les plateformes sont disponibles sur la page [GitHub Releases](https://github.com/heshengtao/exameow/releases).

### Prise en charge des plateformes

| Plateforme | Statut | Téléchargement |
|------------|--------|----------------|
| Windows | ✅ Pris en charge | Installateur `.msi` / `.zip` portable |
| macOS (Apple Silicon / Intel) | ✅ Pris en charge | `.dmg` (voir notes de version pour retirer la quarantaine) |
| Linux (x86_64 / ARM64) | ✅ Pris en charge | `.AppImage` / `.deb` |
| Android (ARM64) | ✅ Pris en charge | `.apk` |
| iOS | ⚠️ Compilation autonome requise | Voir note ci-dessous |
| Web / Docker (auto-hébergé) | ✅ Pris en charge | Image Docker |

> **À propos d'iOS :** Un certificat développeur Apple coûte 99 $/an. Aucun paquet iOS pré-compilé n'est donc fourni pour l'instant — vous devrez le compiler vous-même avec Xcode (`pnpm tauri ios build`). Si de futurs dons couvrent le coût du certificat, une version officielle signée sera publiée sur GitHub Releases.

### Docker (Auto-hébergé)

```bash
git clone https://github.com/heshengtao/exameow.git
cd exameow

# Construire le frontend
cd frontend && pnpm install && pnpm build && cd ..

# Configurer le fournisseur d'IA
export AI_ENDPOINT=https://api.openai.com/v1
export AI_API_KEY=sk-votre-cle-ici
export AI_MODEL=gpt-4o

# Construire et exécuter
docker compose up -d --build
```

Ouvrez `http://localhost:3000`.

> **🔐 Jeton d'administration (requis pour l'administration des examens en ligne) :** la page d'administration `http://localhost:3000/#/admin` est protégée par `ADMIN_TOKEN`. Si vous ne le définissez pas, il prend par défaut la valeur **`pass`** et vous serez **forcé de le modifier lors de votre première connexion** avant de pouvoir faire quoi que ce soit. Pour éviter cela, définissez-le au démarrage :
>
> ```bash
> ADMIN_TOKEN=votre-jeton-securise docker compose up -d --build
> ```
>
> Le jeton modifié persiste dans le volume `exameow-data` (`/app/data/admin_token.txt`) à travers les redémarrages du conteneur. Les données d'examen (SQLite) sont stockées dans le même volume.

### Docker (Image pré-compilée)

```bash
docker pull ailm32442/exameow:latest
docker run -d -p 3000:3000 \
  -e AI_ENDPOINT=https://api.openai.com/v1 \
  -e AI_API_KEY=sk-votre-cle-ici \
  -e AI_MODEL=gpt-4o \
  -e ADMIN_TOKEN=votre-jeton-securise \
  -v exameow-data:/app/data \
  ailm32442/exameow:latest
```

Si `ADMIN_TOKEN` n'est pas défini, la valeur par défaut est `pass` et doit être modifiée lors de la première visite sur `/#/admin`.

## Variables d'environnement

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| `AI_ENDPOINT` | `https://api.openai.com/v1` | Point de terminaison d'API compatible OpenAI |
| `AI_API_KEY` | — | Votre clé d'API IA |
| `AI_MODEL` | `gpt-4o` | Modèle par défaut à utiliser |
| `PORT` | `3000` | Port d'écoute du serveur |
| `STATIC_DIR` | `/app/static` | Répertoire des fichiers statiques |
| `ADMIN_TOKEN` | `pass` | Jeton de la page d'administration ; `pass` force la modification lors de la première visite sur `/#/admin` |
| `EXAM_DB_PATH` | `/app/data/exameow.db` | Chemin SQLite pour le relais d'examen en ligne |
| `ADMIN_TOKEN_FILE` | `/app/data/admin_token.txt` | Emplacement de persistance du jeton d'administration modifié |
| `RUST_LOG` | `info` | Niveau de journalisation (log) |

## Points de terminaison de l'API

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `GET` | `/api/models` | Lister les modèles d'IA disponibles |
| `POST` | `/api/generate` | Téléverser un fichier et générer des questions d'examen |
| `GET` | `/api/export` | Exporter les questions au format CSV |
| `POST` | `/api/export/xlsx` | Exporter les questions au format XLSX |
| `POST` | `/api/config/save` | Enregistrer la configuration d'IA |
| `GET` | `/api/config/load` | Charger la configuration d'IA enregistrée |

### Générer des questions d'examen (Exemple)

```bash
curl -X POST http://localhost:3000/api/generate \
  -F "file=@support-etude.pdf" \
  -F 'params={"question_types":["single_choice","multi_choice"],"count":10,"difficulty":"medium","language":"French"}'
```

## Architecture

Exameow repose sur une **architecture à trois backends** partageant un même frontend Vue 3. La même SPA détecte automatiquement la plateforme au moment de l'exécution et s'oriente vers le backend approprié :

- **Tauri (bureau/mobile)** : Les commandes Rust dans `src-tauri/` invoquent directement la bibliothèque centrale en Rust.
- **Cloudflare Workers** : Le code TypeScript dans `workers/` fait appel à Cloudflare AI + D1 pour le relais d'examen en ligne.
- **Axum (auto-hébergé/Docker)** : Serveur HTTP Rust dans `packages/server/` avec SQLite pour le relais d'examen.

La logique principale (analyse de fichiers, client IA, génération d'examens, exportation) réside dans le crate Rust partagé `packages/core/`, dupliqué en TypeScript pour le parcours Workers.

## Foire Aux Questions (FAQ)

### Comment générer des questions d'examen à partir d'un PDF ?

Téléversez votre PDF par glisser-déposer sur le [site de démo](https://exam.superagentparty.com/) ou dans l'application de bureau. Sélectionnez les types de questions (choix unique, choix multiple, vrai/faux, texte à trous, réponse courte), définissez le nombre de questions et la difficulté, puis cliquez sur Générer. L'IA lit votre document et produit des questions en quelques secondes. Les résultats peuvent être exportés au format XLSX ou CSV.

### Exameow est-il vraiment gratuit ?

Oui. Exameow est open source sous licence Apache 2.0 et 100 % gratuit. Aucun forfait payant, aucune version entreprise, aucune fonctionnalité restreinte. Le site de démo offre la génération IA gratuite (dans la limite des quotas quotidiens de l'offre gratuite de Cloudflare). Les applications de bureau/mobiles nécessitent votre propre clé d'API IA, payée directement à votre fournisseur — Exameow ne vous facturera jamais.

### Puis-je utiliser Exameow hors ligne ?

Oui. Les applications bureau et mobiles fonctionnent entièrement hors ligne. Les banques de questions, les historiques d'entraînement et le suivi des erreurs sont stockés localement. Vous n'avez besoin d'une connexion Internet que lors de l'appel à l'API IA pour générer des questions.

### Quels modèles d'IA Exameow prend-il en charge ?

Toute API compatible OpenAI fonctionne : OpenAI (GPT-4o, GPT-4, GPT-3.5), DeepSeek, Qwen, GLM et les modèles auto-hébergés via Ollama ou équivalent. Vous pouvez également utiliser l'IA gratuite Cloudflare intégrée sur le site de démo.

### Comment fonctionne la fonctionnalité d'examen en ligne ?

Les enseignants publient des examens à partir de banques de questions locales en générant un code à 6 chiffres. Les étudiants rejoignent la session depuis n'importe quel navigateur via ce code ou un lien partagé. L'examen est chronométré avec soumission automatique. Les questions objectives sont notées instantanément. Les données sont supprimées automatiquement après 7 jours. Les utilisateurs Docker bénéficient du même système de relais.

### Mes données sont-elles protégées ?

Oui. Par défaut, toutes les données (banques de questions, historiques d'entraînement, clés d'API) restent sur votre appareil. Les clés d'API sont chiffrées avec AES-256-GCM. La seule exception concerne les données d'examen en ligne, temporairement stockées sur Cloudflare D1 (suppression automatique après 7 jours) ou votre instance SQLite auto-hébergée.

## Développement

```bash
# Serveur Rust
cargo run -p exameow-server

# Serveur de développement frontend
cd frontend && pnpm dev

# Application de bureau Tauri
pnpm tauri dev
```

### Structure du projet

```
exameow/
├── frontend/          # Vue 3 SPA
├── packages/
│   ├── core/          # Bibliothèque partagée Rust (IA, analyseur, exportation, configuration)
│   ├── server/        # Serveur HTTP Axum
│   └── shared/        # Types partagés TypeScript
├── src-tauri/         # Application de bureau + mobile Tauri
├── workers/           # Cloudflare Workers (Hono)
├── scripts/           # Scripts de compilation et de déploiement
├── Dockerfile
└── docker-compose.yml
```

## Avertissement

- Ce projet est un **outil d'apprentissage open source**, destiné uniquement à l'étude personnelle, à l'enseignement et à la formation interne.
- **La précision du contenu généré par l'IA n'est pas garantie.** Les questions et explications peuvent contenir des erreurs — vérifiez-les avant utilisation. Les auteurs déclinent toute responsabilité quant aux conséquences découlant de l'utilisation du contenu généré.
- **Le contenu généré par les utilisateurs (UGC) relève de la seule responsabilité de son éditeur.** N'utilisez pas la fonction d'examen en ligne pour stocker ou distribuer du matériel illicite, contrefait ou sensible. L'opérateur se réserve le droit de supprimer tout contenu enfreignant les règles sans préavis. Canaux de signalement : ① Le bouton **Signaler** intégré sur chaque page d'examen — lorsque 3 IP distinctes ou plus signalent un même examen, son lien est **automatiquement verrouillé et rendu inaccessible** dans l'attente d'un examen par l'administrateur ; ② GitHub Issues. Les infractions vérifiées sont supprimées ; les examens suspendus à tort peuvent être restaurés par l'administrateur.
- Le site de démo (exam.superagentparty.com) est un service public gratuit **sans garantie de disponibilité ni de persistance des données** (les données d'examen sont conservées 7 jours au maximum). Sauvegardez tout contenu important.
- En utilisant ce projet, vous acceptez tous les risques associés et vous vous engagez à respecter les lois de votre jurisdiction.

## Support

### Laissez-nous une étoile !
⭐ Votre soutien est notre moteur pour continuer à avancer !

### Dons bienvenus !
<div align="center" style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/agentparty)
[![爱发电](https://img.shields.io/badge/爱发电-支持我们-946ce6?style=for-the-badge&logo=affine&logoColor=white)](https://afdian.com/a/agentparty)

</div>

### Suivez-nous
<div align="center">
  <a href="https://space.bilibili.com/26978344">
    <img src="screenshots/B.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="bilibili"/>
  </a>
  <a href="https://www.youtube.com/@agentParty">
    <img src="screenshots/YT.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="youtube"/>
  </a>
</div>

### Rejoignez la communauté
Si vous avez des questions ou des problèmes avec le projet, vous êtes invités à rejoindre notre communauté.

1. Groupe QQ : `931057213` (Complet) / `902882342` (Groupe 2)

2. Discord : [Lien Discord](https://discord.gg/f2dsAKKr2V)

## Contributeurs

<a href="https://github.com/heshengtao/exameow/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=heshengtao/exameow" alt="Contributeurs de heshengtao/exameow" />
</a>

## Licence

Apache-2.0

## Licences tierces

Ce projet utilise des logiciels open source tiers. Une liste complète des dépendances, de leurs licences et des URL de licence se trouve dans [THIRD_PARTY_LICENSES.csv](THIRD_PARTY_LICENSES.csv).
