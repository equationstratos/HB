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
3. **Le garde rejoint la cliente** (statut « en route »), puis démarre le suivi. Ils se reconnaissent grâce à un **mot de code**. La cliente connaît le prénom et l'initiale du nom de son garde ; le garde ne connaît que le prénom de la cliente, et seulement pendant la mission (voir [RGPD](#rgpd)).
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

### Gains des gardes et virements

Le garde suit son **solde disponible** dans l'onglet « Gains » de l'appli et le fait virer sur son compte bancaire. Pas de prestataire de paiement en v1 : **l'équipe fait les virements à la main**.

**Règles** (taux, minimum et seuil par défaut, réglables plus bas)

- **Gain par mission** : dès qu'une mission passe à « terminée », le garde assigné est crédité automatiquement, une seule fois par mission. Montant = taux horaire × minutes rémunérées / 60, arrondi au centime. Minutes rémunérées = durée entre le début du suivi (ou l'heure de départ prévue à défaut) et la fin, chaque minute commencée comptant, avec un minimum de 30 min et un **plafond** : le créneau réservé par la cliente plus 30 min de dépassement. Une mission oubliée « en cours » toute une nuit ne rapporte donc pas 12 h. Avec 20 €/h : 12 min → 10 €, 46 min 30 s → 47 min → 15,67 €.
- **Solde disponible** = gains − virements demandés ou payés. Un virement refusé rend son montant au solde.
- **Compte bancaire** : titulaire et IBAN, vérifiés dans l'appli et par l'API avec le même schéma (format, longueur selon le pays, clé de contrôle ISO 13616 modulo 97). L'IBAN est **chiffré** (AES-256-GCM) ; le garde ne le revoit que masqué (« FR76 •••• •••• 1234 ») et il n'apparaît jamais dans le journal d'audit.
- **Virement** : « Virer sur mon compte » demande **tout le solde**, à partir de 10 €, avec un compte enregistré et une seule demande en attente à la fois (verrou en base et index unique partiel : deux demandes simultanées n'en créent qu'une). Le compte de destination est figé sur la demande.
- Le garde voit pour chaque mission rémunérée la date, le début, la durée, la fin et le montant : **ni le nom ni la note de la cliente**.

**Traitement des virements par l'équipe** (page « Virements » de l'admin, avec le nombre de demandes à traiter et une alerte en temps réel à chaque demande) :

1. « Traiter » ouvre la demande avec l'**IBAN complet** à copier et les **missions couvertes** (début, fin, durée réelle et payée, montant ; « plafonnée » quand la mission a dépassé son créneau). Chaque consultation est tracée. Vérifiez que le titulaire est bien le garde. Un avertissement apparaît si le garde a changé d'IBAN moins de 48 h avant sa demande : confirmez avec lui par téléphone.
2. Faites le virement depuis la banque de la plateforme.
3. « Marquer comme payé », avec la référence du virement (facultative), ou « Refuser » avec un motif : le montant revient alors dans le solde du garde.
4. Le garde est prévenu par notification et son écran se met à jour.

Seule une demande « Demandé » peut être traitée, une seule fois. Sont tracés : `guard.earning_credited`, `guard.bank_account_updated`, `guard.payout_requested`, `admin.payout_viewed`, `payout.paid` et `payout.rejected`. Les virements automatiques (par exemple avec Stripe Connect) remplaceront plus tard l'étape 2.

**Réglages** (`apps/api/.env`) :

| Variable                     | Défaut | Rôle                                                        |
| ---------------------------- | ------ | ----------------------------------------------------------- |
| `GUARD_HOURLY_RATE_CENTS`    | `2000` | rémunération du garde, en centimes par heure (20 €)         |
| `GUARD_MIN_BILLED_MINUTES`   | `30`   | durée minimale rémunérée par mission, en minutes            |
| `GUARD_MAX_OVERTIME_MINUTES` | `30`   | dépassement rémunéré au-delà du créneau réservé, en minutes |
| `PAYOUT_MIN_CENTS`           | `1000` | montant minimal d'une demande de virement (10 €)            |

Côté code : `apps/api/src/wallet/` (routes `/api/guards/me/wallet`, `/api/guards/me/bank-account`, `/api/guards/me/payouts` et `/api/admin/payouts`), règle de calcul et validation de l'IBAN dans `packages/shared/src/wallet.ts`. Le seed crédite les missions terminées des gardes de démonstration ; relancé sur une base existante, il n'ajoute que les gains manquants.

### RGPD

- Consentement explicite au partage de position, demandé avant toute réservation ou mission.
- Partage limité aux missions actives, puis arrêt automatique.
- Positions **supprimées 30 jours** après la fin de la mission (tâche quotidienne, elle-même tracée).
- Minimisation des données entre la cliente et le garde.
- **Ce que le garde voit de la cliente**, appliqué par l'API (vues, temps réel et notifications), pas seulement par l'appli :
  - jamais son nom de famille ;
  - son prénom uniquement sur la fiche d'une mission active (attribuée, en route ou en cours), pour l'aborder avec le mot de code ;
  - aucun nom dans les propositions, la liste des missions, les missions terminées ou annulées, ni dans les notifications : seulement la date, le début, la durée, la fin, le mode et le trajet.
- **Le garde ne voit pas les notes** que lui donnent les clientes : ni étoiles, ni commentaires, ni moyenne (pas de `GET /guards/me/ratings`, aucun champ de note dans ses réponses). Elles restent visibles de la cliente qui les a laissées et de l'équipe (fiche du garde, page « Notes »).

---

## Démarrage rapide (développement)

Prérequis : Node.js 22+, pnpm 10, Docker (ou PostgreSQL 16 et Redis en local).

```bash
docker compose up -d   # PostgreSQL + Redis
pnpm run bootstrap     # dépendances, .env avec secrets aléatoires, migrations, données de démo
pnpm dev               # API (http://localhost:3000) + admin (http://localhost:5173)
```

La documentation interactive de l'API est servie sur <http://localhost:3000/docs>.

### Mettre à jour une installation existante

Arrêtez le serveur (`Ctrl+C`), puis :

```bash
git pull
pnpm run update:server
pnpm dev
```

`update:server` fait tout le nécessaire, sans rien perdre (comptes, missions, réglages) :

- installe les dépendances et recompile le code partagé ;
- applique les nouvelles tables à la base (gains des gardes, virements…) ;
- complète `apps/api/.env` avec les nouveaux réglages et passe les itinéraires en `ROUTING_PROVIDER=osrm` (trajets qui suivent les rues ; l'ancien fichier est gardé en `.env.bak`) ;
- crédite aux gardes les missions terminées avant l'arrivée de la cagnotte.

Le PC doit avoir accès à internet (fond de carte, itinéraires). Réinstallez ensuite les applis depuis les liens en haut de cette page. Tant que le serveur n'est pas à jour, les applis l'indiquent par un encadré « Serveur à mettre à jour ».

**« Erreur 500 » à la connexion à l'admin** : l'API ne tourne pas (dans la fenêtre de `pnpm dev`, l'admin affiche `ECONNREFUSED 127.0.0.1:3000`). Cherchez plus haut la ligne `@hb/api:dev` qui explique pourquoi : base de données arrêtée (`docker compose up -d`), migrations manquantes (`pnpm run update:server`)…

**« Clé de chiffrement du serveur changée » (ou `Unsupported state or unable to authenticate data`)** : `apps/api/.env` a été recréé, par exemple dans un nouveau dossier après un nouveau téléchargement, alors que la base de données est restée la même. Les données chiffrées avec l'ancienne clé (double authentification des admins, IBAN des gardes) ne se relisent plus. Au démarrage, l'API l'indique dans sa console. Deux solutions :

1. Reprendre la ligne `DATA_ENCRYPTION_KEY=…` dans le `apps/api/.env` de l'installation précédente, puis relancer `pnpm dev` ;
2. ou réinitialiser la double authentification : `pnpm --filter @hb/api run admin:reset-mfa admin@hb.local`, puis se reconnecter et scanner le nouveau QR code dans l'application d'authentification (les gardes ressaisiront leur IBAN si besoin).

Pour éviter que cela se reproduise, les secrets de l'API sont désormais gardés dans `~/.hb/api-secrets.env` et repris par toute nouvelle installation sur le même ordinateur. Pour mettre à jour, le plus simple reste de cloner le dépôt une fois (`git clone https://github.com/equationstratos/HB.git`) puis de faire `git pull` à chaque nouvelle version, au lieu de retélécharger le ZIP.

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

5. Se connecter avec un compte de démonstration, par exemple `camille@hb.local` pour l’appli cliente et `karim@hb.local` pour l’appli garde, ou créer un compte.

   Sans Twilio, aucun SMS n'est envoyé : à l'inscription, l'appli affiche le code de vérification dans un encadré « Mode test » et le saisit d'elle-même. Après un redémarrage de l'appli, ou pour un compte créé avant cette version, touchez « Renvoyer le code » pour l'afficher. Il apparaît aussi dans la console de l'API.

À savoir :

- Ces APK sont des **versions de test**. Elles sont signées avec la clé de développement et acceptent un serveur en HTTP sur le réseau local, ce que la version de production interdit.
- La carte ne demande aucune clé dans l'appli : les tuiles (OpenStreetMap par défaut) passent par le serveur choisi, voir [Fond de carte](#fond-de-carte).
- Pour intégrer directement l'adresse d'un serveur hébergé, renseignez la variable de dépôt `HB_API_URL` (Settings → Secrets and variables → Actions → Variables) puis relancez le workflow.
- **iPhone** : pas d'APK possible. Une appli iOS installable demande un compte Apple Developer et une compilation EAS. En attendant, utilisez Expo Go (ci-dessous).

### Notifications des messages et du statut de la protection

**Statut de la protection** : la cliente et le garde sont prévenus à chaque étape (garde trouvé, en route, protection en cours, terminée, annulée), chacun avec son texte, sauf la personne qui vient de faire l'action. Les propositions de mission, alertes et virements suivent le même chemin. Toucher la notification ouvre la mission, l'accueil (proposition) ou les gains (virement). Sur l'écran verrouillé, le texte reste masqué (mot de code…).

**Messages** : quand la cliente ou le garde écrit, l'autre personne est prévenue :

- **appli ouverte**, quel que soit l'écran : notification dès l'arrivée du message, sauf si la conversation est déjà affichée ;
- **appli en arrière-plan pendant une mission en cours** (garde en route ou protection en cours) : le suivi GPS garde l'appli active, et elle relève les nouveaux messages toutes les 15 s environ ;
- toucher la notification ouvre la conversation. En mode discret, elle n'affiche ni l'auteur ni le texte et ne sonne pas.

Dans les APK de test, ces notifications sont **locales** : c'est l'appli qui les crée. Autorisez les notifications au premier lancement (Android 13 et plus le demandent). L'API envoie aussi une notification push, sans le texte du message (« Nouveau message — Votre garde vous a écrit. »), mais elle n'arrive que dans une appli compilée avec un projet EAS et Firebase.

Pour être prévenu **appli complètement fermée**, il faut ces notifications push :

1. Lier chaque appli à un projet EAS (compte Expo gratuit) : `cd apps/client && npx eas-cli@latest init`, puis la même chose dans `apps/guard`. Le `projectId` ajouté à `app.json` (`extra.eas.projectId`) permet à l'appli d'obtenir son jeton push.
2. Créer un projet Firebase avec deux applis Android, `fr.hb.client` et `fr.hb.guard`. Placer leurs fichiers `google-services.json` dans `apps/client` et `apps/guard`, et les déclarer dans `app.json` : `"android": { "googleServicesFile": "./google-services.json" }`. Pour le workflow GitHub, versionnez ces fichiers ou recréez-les depuis un secret.
3. Dans Firebase (Paramètres du projet → Comptes de service), générer une clé de compte de service et la confier à EAS : `npx eas-cli@latest credentials` → Android → Google Service Account → « Push Notifications (FCM V1) ».
4. Recompiler les APK.
5. Côté API, dans `apps/api/.env` : `PUSH_PROVIDER=expo`, et `EXPO_ACCESS_TOKEN` si l'accès sécurisé aux push est activé sur le compte Expo.

### Applis mobiles avec Expo Go (développement)

1. Installez **Expo Go** sur le téléphone, connecté au même Wi-Fi que l'ordinateur.
2. Lancez l'appli :
   ```bash
   pnpm --filter @hb/client start   # appli cliente (port 8081)
   pnpm --filter @hb/guard start    # appli garde (port 8082)
   ```
3. Scannez le QR code affiché.

L'appli trouve l'API toute seule sur l'ordinateur qui sert le bundle (port 3000). Pour une autre adresse, copiez `apps/client/.env.example` en `.env` et renseignez `EXPO_PUBLIC_API_URL`.

En développement, les SMS (codes de vérification, alertes) et les appels masqués s'affichent dans la console de l'API. Les applis affichent aussi le code de vérification du téléphone, puisqu'aucun SMS ne part ; la production, qui exige Twilio, ne le renvoie jamais.

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
| `map/`                                | fond de carte : tuiles relayées et mises en cache, fournisseur réglable sur le serveur      |
| `jobs/`                               | tâches différées : vagues d'offres, retards, escalades, perte de signal, purge RGPD         |
| `integrations/`                       | adaptateurs SMS, téléphonie, push, stockage, itinéraires                                    |

### Services externes

Chaque service passe par un adaptateur, choisi par variable d'environnement (voir `apps/api/.env.example`). Le mode par défaut fonctionne sans aucun compte.

| Service                         | Développement  | Production                                       |
| ------------------------------- | -------------- | ------------------------------------------------ |
| SMS (codes, contacts d'urgence) | console        | Twilio (`SMS_PROVIDER=twilio`)                   |
| Appel masqué                    | console        | Twilio Voice, mise en relation par la plateforme |
| Notifications push              | console        | Expo Push (`PUSH_PROVIDER=expo`)                 |
| Itinéraires                     | OSRM (FOSSGIS) | OSRM auto-hébergé ou OpenRouteService (`ors`)    |
| Pièces justificatives           | disque local   | stockage S3 compatible, chiffré (`s3`)           |
| Fond de carte                   | OpenStreetMap  | fournisseur avec clé (`MAP_TILE_URL`)            |

### Fond de carte

Les cartes des applis et de l'admin ne contactent aucun fournisseur de tuiles : l'API les relaie (`GET /api/map/tiles/{z}/{x}/{y}.png`, route publique) et les garde en cache jusqu'à 7 jours, en mémoire sur le serveur (1 000 tuiles au plus) comme sur les téléphones. Le fournisseur et son éventuelle clé se règlent donc sur le serveur, sans recompiler les applis. Les tuiles CARTO sans clé, utilisées auparavant par les applis, portent désormais la mention « API KEY REQUIRED ».

- **Par défaut** : les tuiles d'OpenStreetMap, sans clé. Elles suffisent pour les tests, mais leur [politique d'usage](https://operations.osmfoundation.org/policies/tiles/) exclut un usage intensif : l'API s'identifie auprès d'OpenStreetMap (`MAP_TILE_USER_AGENT`) et garde les tuiles en cache.
- **En production** : un fournisseur avec clé, par exemple CARTO :

  ```bash
  MAP_TILE_URL=https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=VOTRE_CLE
  MAP_TILE_ATTRIBUTION="© OpenStreetMap © CARTO"
  ```

  `{s}` (sous-domaines a, b ou c) et `{r}` (ignoré) sont aussi acceptés. L'attribution, en texte simple, s'affiche en bas des cartes ; `GET /api/map/config` la fournit aux applis.

Une carte charge des dizaines de tuiles d'un coup : cette route a sa propre limite, 1 200 requêtes par minute et par adresse IP. Pour un essai ponctuel, `EXPO_PUBLIC_TILE_URL` (applis) et `VITE_TILE_URL` (admin) imposent une autre adresse de tuiles à la compilation.

**Itinéraires dans les rues.** Par défaut (`ROUTING_PROVIDER=osrm`), les trajets suivent les rues grâce au serveur OSRM public de FOSSGIS (`routing.openstreetmap.de`), sans compte ni clé, avec les profils piéton, vélo et voiture. En transports en commun, chaque tronçon d'un arrêt au suivant est tracé à pied dans les rues ; la durée est estimée à la vitesse moyenne des transports.

- **L'ordinateur qui fait tourner l'API doit avoir accès à internet.** Sinon, ou si le service ne répond pas, l'API trace des lignes droites : l'appli cliente affiche « Itinéraire approximatif : le service d’itinéraires est indisponible. » et l'admin marque le tracé « approximatif ».
- **Installation existante** : les versions précédentes écrivaient `ROUTING_PROVIDER=straight` (lignes droites, « à vol d'oiseau ») dans `apps/api/.env`. Remplacez-le par `ROUTING_PROVIDER=osrm`, puis relancez l'API ; `pnpm run bootstrap` le rappelle. Les trajets déjà enregistrés gardent leur tracé.
- Ce serveur public est gratuit mais réservé à un **usage modéré** (politique d'usage de FOSSGIS : pas d'usage intensif, application identifiée par son User-Agent). En production, hébergez votre propre OSRM (`OSRM_URL`, où `{profile}` désigne le serveur `foot`, `bike` ou `car`) ou utilisez OpenRouteService (`ROUTING_PROVIDER=ors` et `ORS_API_KEY`).
- `ROUTING_PROVIDER=straight` reste possible pour travailler hors ligne ; les tests l'utilisent.

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
