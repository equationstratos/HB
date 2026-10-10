# HB — Accompagnement furtif des trajets

Plateforme pour sécuriser les trajets des femmes, d'abord en France. Une cliente réserve un
accompagnateur professionnel qui suit discrètement **un trajet défini à la commande**. Le
trajet est surveillé en temps réel et l'équipe de supervision garde la main à tout moment.

| Appli         | Pour qui                                                       | Technologie               |
| ------------- | -------------------------------------------------------------- | ------------------------- |
| `apps/client` | Les clientes : réserver, être suivie, SOS, noter               | Expo (React Native)       |
| `apps/guard`  | Les gardes : candidature, missions, suivi de la cliente        | Expo (React Native)       |
| `apps/admin`  | L'équipe : supervision en direct, validation des gardes, audit | React + Vite (web)        |
| `apps/api`    | Serveur commun aux trois applis                                | NestJS, PostgreSQL, Redis |

## Télécharger les applis de test (Android)

|                                                                        Appli cliente (HB)                                                                         |                                                                    Appli garde (HB Garde)                                                                     |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------: |
| [<img src="docs/qr/hb-client.svg" width="180" alt="QR code de l'appli cliente">](https://github.com/equationstratos/HB/releases/download/apps-test/hb-client.apk) | [<img src="docs/qr/hb-guard.svg" width="180" alt="QR code de l'appli garde">](https://github.com/equationstratos/HB/releases/download/apps-test/hb-guard.apk) |
|                         **[Télécharger hb-client.apk](https://github.com/equationstratos/HB/releases/download/apps-test/hb-client.apk)**                          |                        **[Télécharger hb-guard.apk](https://github.com/equationstratos/HB/releases/download/apps-test/hb-guard.apk)**                         |

Depuis le téléphone Android, touchez le lien de téléchargement. Depuis un ordinateur, scannez le
QR code avec le téléphone. Ouvrez ensuite le fichier (environ 60 Mo) et autorisez l'installation.
Pour régler le serveur et trouver les comptes de démo, voir
[Applis de test Android](#applis-de-test-android-apk-prêtes-à-installer).

---

## Ce que fait la plateforme

### Parcours d'une protection

1. **La cliente définit son trajet** :
   - départ (sa position ou une adresse), étapes facultatives, arrivée ;
   - mode de déplacement (à pied, vélo, voiture/VTC, transports en commun) ;
   - l'appli affiche l'itinéraire, la distance, la durée et l'heure d'arrivée prévue ;
   - elle choisit « maintenant » ou un créneau, une protection ponctuelle ou décomptée de son abonnement.
2. **Attribution automatique.** La mission est proposée par vagues de 5 aux gardes validés, disponibles et proches, triés par distance puis par note. Le premier qui accepte l'obtient. Si personne n'accepte, l'admin est alerté et attribue à la main.
3. **Le garde rejoint la cliente** (statut « en route »), puis démarre le suivi. Ils se reconnaissent grâce à un **mot de code** et ne connaissent l'un de l'autre que le prénom et l'initiale du nom.
4. **Surveillance du trajet en temps réel.** La position de la cliente est comparée au tracé prévu. Une alerte part au garde et à l'équipe dans quatre cas :
   - **écart de trajet** : hors de la tolérance pendant plus de 60 s ;
   - **arrêt prolongé** hors d'une étape ;
   - **retard** sur l'heure d'arrivée prévue ;
   - **perte de signal**.

   La cliente reçoit « Tout va bien ? ». Sans réponse au bout de 2 minutes, l'alerte est **escaladée en SOS**.

5. **SOS** par appui long :
   - le garde et l'équipe sont alertés (son et notification critique) ;
   - les contacts d'urgence de la cliente reçoivent un SMS avec sa dernière position.
6. **Arrivée** : la cliente ou le garde clôt la mission, puis la cliente note son garde.

Pendant la mission :

- messagerie et **appel masqué** : aucun vrai numéro n'est jamais exposé ;
- la cliente peut **modifier son trajet** ; le garde est prévenu et la surveillance repart sur le nouveau tracé.

### Sécurité « AAA »

|                      | Mise en œuvre                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentification** | Mots de passe argon2id. Jeton d'accès JWT de 15 min. Jeton de rafraîchissement à rotation : un jeton déjà utilisé qui revient révoque toute la session, avec une tolérance de quelques secondes pour les requêtes simultanées légitimes. Verrouillage après 5 échecs. Téléphone vérifié par code SMS. **Double authentification TOTP obligatoire pour les admins**, avec anti-rejeu, facultative pour les autres. |
| **Autorisation**     | Rôles cliente, garde et admin. Une session admin sans 2FA est refusée. Contrôles de propriété : une cliente ne voit que ses missions ; un garde ne voit que les siennes ; les positions ne sont lisibles que pendant la protection. Salles temps réel filtrées de la même façon. Suspension immédiate : sessions révoquées et connexions coupées.                                                                 |
| **Traçabilité**      | Journal d'audit **en ajout seul** : un trigger PostgreSQL refuse toute modification ou suppression. Chaque entrée garde qui, quoi, quand, l'IP et l'appareil. Sont tracés : connexions et échecs, chaque étape des missions, SOS, écarts, validation des gardes, **consultation des pièces justificatives, des positions et des coordonnées par un admin**.                                                       |

Autres protections :

- limitation de débit (stricte sur l'authentification, jamais sur le SOS) ;
- secrets 2FA chiffrés en AES-256-GCM ;
- type réel des fichiers vérifié par leurs premiers octets ;
- en-têtes HTTP durcis (helmet) ;
- jeton de l'admin web dans un cookie `httpOnly; SameSite=Strict`.

### RGPD

- Consentement explicite au partage de position, demandé avant toute réservation ou mission.
- Partage limité aux missions actives, puis arrêt automatique.
- Positions **supprimées 30 jours** après la fin de la mission (tâche quotidienne, elle-même tracée).
- Minimisation des données entre la cliente et le garde.

---

## Démarrage rapide (développement)

Prérequis : Node.js 22+, pnpm 10, Docker (ou PostgreSQL 16 et Redis en local).

```bash
docker compose up -d   # PostgreSQL + Redis
pnpm run bootstrap     # dépendances, .env avec secrets aléatoires, migrations, données de démo
pnpm dev               # API (http://localhost:3000) + admin (http://localhost:5173)
```

La documentation interactive de l'API est servie sur <http://localhost:3000/docs>.

### Comptes de démonstration

Mot de passe commun : `Demo-HB-2026!`

| Rôle             | Email                                                       |
| ---------------- | ----------------------------------------------------------- |
| Admin            | `admin@hb.local` (2FA, voir ci-dessous)                     |
| Clientes         | `camille@hb.local` (abonnement Essentiel), `sarah@hb.local` |
| Gardes validés   | `karim@`, `julien@`, `aicha@`, `thomas@`, `sofia@hb.local`  |
| Gardes à valider | `mehdi@`, `lucas@hb.local`                                  |

**2FA de l'admin de démo** : ajoutez la clé `KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD` dans une
application d'authentification (Google Authenticator, Authy, 1Password…) et saisissez le code
affiché. Ces identifiants ne servent qu'en développement.

### Voir la supervision s'animer

Avec l'API et l'admin lancés :

```bash
pnpm --filter @hb/api simulate              # protection complète, écart de trajet puis « tout va bien »
pnpm --filter @hb/api simulate --no-answer  # la cliente ne répond pas : escalade en SOS
SIM_CLIENT=sarah@hb.local pnpm --filter @hb/api simulate --keep  # laisse la mission en cours
```

### Applis de test Android (APK prêtes à installer)

Les applis cliente et garde sont compilées automatiquement par GitHub Actions
(`.github/workflows/android-apk.yml`) et publiées sur la page
**[Releases → Applis de test (Android)](https://github.com/equationstratos/HB/releases/tag/apps-test)** :

- [`hb-client.apk`](https://github.com/equationstratos/HB/releases/download/apps-test/hb-client.apk) : appli cliente ;
- [`hb-guard.apk`](https://github.com/equationstratos/HB/releases/download/apps-test/hb-guard.apk) : appli garde.

Les QR codes en haut de cette page mènent aux mêmes fichiers.

1. **Lancer le serveur** sur un ordinateur : `docker compose up -d`, `pnpm run bootstrap`, `pnpm dev`.
2. **Trouver l'adresse IP de l'ordinateur** sur le Wi-Fi :
   - Windows : `ipconfig` ;
   - macOS : Réglages → Wi-Fi → Détails ;
   - Linux : `hostname -I`.

   L'adresse ressemble à `192.168.1.20`.

3. **Installer l'APK** : ouvrir le lien ci-dessus depuis le téléphone Android, télécharger le fichier, puis autoriser l'installation depuis cette source.
4. **Choisir le serveur** : sur l'écran d'accueil de l'appli, toucher « Serveur », saisir l'adresse IP, puis « Tester la connexion » et « Enregistrer ».

   Le téléphone doit être sur le même Wi-Fi, et le pare-feu de l'ordinateur doit autoriser le port 3000.

5. Se connecter avec un compte de démonstration, par exemple `camille@hb.local` pour l’appli cliente et `karim@hb.local` pour l’appli garde. Les codes SMS s'affichent dans la console de l'API.

À savoir :

- Ces APK sont des **versions de test**. Elles sont signées avec la clé de développement et acceptent un serveur en HTTP sur le réseau local, ce que la version de production interdit.
- La carte utilise OpenStreetMap et ne demande aucune clé.
- Pour intégrer directement l'adresse d'un serveur hébergé, renseignez la variable de dépôt `HB_API_URL` (Settings → Secrets and variables → Actions → Variables) puis relancez le workflow.
- **iPhone** : pas d'APK possible. Une appli iOS installable demande un compte Apple Developer et une compilation EAS. En attendant, utilisez Expo Go (ci-dessous).

### Applis mobiles avec Expo Go (développement)

1. Installez **Expo Go** sur le téléphone, connecté au même Wi-Fi que l'ordinateur.
2. Lancez l'appli :
   ```bash
   pnpm --filter @hb/client start   # appli cliente (port 8081)
   pnpm --filter @hb/guard start    # appli garde (port 8082)
   ```
3. Scannez le QR code affiché.

L'appli trouve l'API toute seule sur l'ordinateur qui sert le bundle (port 3000). Pour une autre adresse, copiez `apps/client/.env.example` en `.env` et renseignez `EXPO_PUBLIC_API_URL`.

En développement, les SMS (codes de vérification, alertes) et les appels masqués s'affichent dans la console de l'API.

> **Suivi en arrière-plan.** Expo Go ne permet pas le suivi GPS écran éteint : l'appli prévient alors de la garder ouverte. Pour le suivi en arrière-plan et les notifications push, installez une version de développement :
>
> ```bash
> cd apps/client && npx eas-cli@latest build --profile development --platform android
> ```

---

## Architecture

```
apps/
  api/          NestJS + Prisma (PostgreSQL) + BullMQ (Redis) + Socket.IO
  admin/        React 19 + Vite + TanStack Query + Leaflet
  client/       Expo SDK 57 + expo-router (appli cliente)
  guard/        Expo SDK 57 + expo-router (appli garde)
packages/
  shared/       énumérations, schémas zod, machine d'états, géométrie, surveillance du trajet, libellés FR
  api-client/   client HTTP typé, session et rafraîchissement, client temps réel
  mobile-core/  briques communes aux deux applis mobiles (carte, chat, SOS, suivi GPS, écrans d'auth)
```

Organisation de l'API (`apps/api/src`) :

| Dossier                               | Contenu                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `auth/`                               | inscription, connexion, jetons, 2FA, vérification SMS, gardes d'authentification et de rôle |
| `audit/`                              | journal d'audit (décorateur `@Audit`, service, consultation)                                |
| `missions/`, `matching/`              | réservation, machine d'états, attribution par vagues                                        |
| `tracking/`                           | positions, surveillance du trajet, écarts, retards, perte de signal                         |
| `sos/`, `chat/`, `calls/`, `ratings/` | alertes, messagerie, appel masqué, notation                                                 |
| `guard-profiles/`, `plans/`, `admin/` | candidatures des gardes, abonnements, supervision                                           |
| `realtime/`                           | passerelle Socket.IO authentifiée, adaptateur Redis multi-instance                          |
| `jobs/`                               | tâches différées : vagues d'offres, retards, escalades, perte de signal, purge RGPD         |
| `integrations/`                       | adaptateurs SMS, téléphonie, push, stockage, itinéraires                                    |

### Services externes

Chaque service passe par un adaptateur, choisi par variable d'environnement (voir `apps/api/.env.example`). Le mode par défaut fonctionne sans aucun compte.

| Service                         | Développement  | Production                                       |
| ------------------------------- | -------------- | ------------------------------------------------ |
| SMS (codes, contacts d'urgence) | console        | Twilio (`SMS_PROVIDER=twilio`)                   |
| Appel masqué                    | console        | Twilio Voice, mise en relation par la plateforme |
| Notifications push              | console        | Expo Push (`PUSH_PROVIDER=expo`)                 |
| Itinéraires                     | lignes droites | OpenRouteService (`ors`) ou OSRM (`osrm`)        |
| Pièces justificatives           | disque local   | stockage S3 compatible, chiffré (`s3`)           |

---

## Qualité

```bash
pnpm lint        # ESLint sur tout le monorepo
pnpm typecheck   # TypeScript strict partout
pnpm test        # tests unitaires + e2e (PostgreSQL et Redis requis)
pnpm build       # API, admin, paquets partagés
```

Tests :

- 31 tests unitaires sur la géométrie, la surveillance du trajet, la machine d'états et les schémas ;
- 4 tests du client HTTP ;
- 12 tests unitaires de l'API (chiffrement, 2FA, validation, fichiers) ;
- **34 tests e2e** sur une vraie base, dont le parcours complet d'une protection : inscription, validation du garde, offre par socket, suivi, écart de 60 s, modification du trajet, SOS, escalade automatique, notation, journal d'audit, et toutes les vérifications de droits.

Le dossier de test utilise sa propre base (`hb_test`) : la base de développement n'est jamais touchée.

La CI GitHub Actions (`.github/workflows/ci.yml`) enchaîne formatage, lint, typecheck, tests avec PostgreSQL et Redis, puis build.

---

## Mise en production : à prévoir

**Côté technique**

- Domaine unique pour l'admin et l'API derrière un reverse proxy (`/api` vers l'API, le reste vers l'admin) : le cookie de session de l'admin reste `SameSite=Strict`. Activez `TRUST_PROXY=true`.
- Secrets forts et uniques (`pnpm --filter @hb/api init:env` en génère).
- Hébergement **dans l'UE** pour la base, Redis et les fichiers.
- Comptes Twilio (SMS et voix), Expo / EAS (builds et push), OpenRouteService, stockage S3.
- Builds des applis avec EAS : profils `development`, `preview` et `production` dans `eas.json`. Renseignez l'URL de l'API et le `projectId` EAS.
- Remplacer le nom provisoire « HB » (`APP_NAME` dans `packages/shared/src/constants.ts`, `app.json`) et les icônes générées.

**Côté légal**

- **Autorisation d'exercer du CNAPS** pour la société (activité privée de sécurité, Livre VI du Code de la sécurité intérieure), contrats et assurances des gardes.
- **RGPD** : analyse d'impact (AIPD) obligatoire pour la géolocalisation, registre des traitements, mentions d'information, DPO si nécessaire.

**Évolutions prévues**

- Paiement Stripe : abonnements et protections ponctuelles, versements aux gardes via Connect. Les formules et quotas sont déjà en place.
- Horaires des transports en commun (Navitia) pour un tracé exact en bus et métro.
- Traductions supplémentaires : l'infrastructure i18n est prête.
- Signalement d'une cliente par un garde, et historique des alertes dans l'appli cliente.
