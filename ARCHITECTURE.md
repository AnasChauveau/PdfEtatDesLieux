# Architecture — Express EDL

Ce document décrit le fonctionnement réel du code de ce dépôt. Il est tenu à jour quand l'architecture change.

## Vue d'ensemble

Express EDL est une application web **mobile-first** qui produit un état des lieux (EDL) en PDF, l'envoie au bailleur et au locataire, puis supprime les photos sources.

Le principe : **le navigateur fait le travail lourd, le serveur orchestre**.

- **Navigateur** : saisie, compression des photos, calcul des empreintes SHA-256, génération du PDF.
- **Supabase** : base Postgres, authentification, stockage des fichiers, et trois Edge Functions (Deno) pour l'empaquetage ZIP, l'envoi des mails, le suivi de livraison et la purge.
- **Vercel** : hébergement de l'application Next.js et d'une route API (renvoi de mail).
- **Resend** : envoi des emails transactionnels.

```
Navigateur (Next.js)                Supabase                         Resend
 ├─ formulaire 5 étapes             ├─ Postgres (rapports, email_events)
 ├─ compression + SHA-256 photos ──▶├─ Storage (3 buckets)
 ├─ PDF (pdf-lib) + SHA-256  ──────▶│
 └─ appel zip-and-send ────────────▶├─ Edge Function zip-and-send ───▶ 2 emails
                                    ├─ Edge Function webhook-resend ◀── événements de livraison
                                    └─ Edge Function cron-purge (quotidienne)
```

## Stack

| Couche | Choix |
|---|---|
| Application | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Base de données | Supabase Postgres, données du rapport dans une colonne JSONB |
| Authentification | Supabase Auth, code OTP à 6 chiffres par email |
| Fichiers | Supabase Storage |
| Fonctions serveur | Supabase Edge Functions (Deno) |
| PDF | pdf-lib, côté navigateur |
| Photos | browser-image-compression, côté navigateur |
| Signatures | react-signature-canvas |
| ZIP | JSZip, dans l'Edge Function |
| Emails | Resend (API REST) + webhooks signés Svix |
| Hébergement | Vercel |

## Parcours utilisateur

Le formulaire (`components/EdlForm.tsx`) compte cinq étapes : **bien et parties**, **compteurs**, **pièces**, **signatures**, puis **envoi**.

1. **Pas de compte pour commencer.** Tout le formulaire se remplit sans connexion. Les données restent dans le state React, avec une sauvegarde automatique du brouillon dans `localStorage`. Les photos restent en mémoire (objets `File`) et sont affichées en aperçu sans être envoyées.
2. **Connexion juste avant la signature.** En passant à l'étape des signatures, une fenêtre demande l'email puis le code à 6 chiffres. L'utilisateur ne quitte pas la page, donc les photos en mémoire ne sont pas perdues.
3. **Clôture**, dans `saveRapport()` :
   1. Chaque photo est compressée (1600 px max, qualité 0,82, 0,8 Mo max, conversion en JPEG), puis son **empreinte SHA-256** est calculée sur les octets compressés, avant l'envoi dans le bucket `photos-etats-des-lieux`.
   2. Le rapport est inséré en base avec le statut `draft`, ce qui donne son identifiant.
   3. Le PDF est généré dans le navigateur avec pdf-lib : identifiant `EDL-AAAA-XXXXXX`, pagination, date et lieu de signature, mention contradictoire, annexe photographique avec l'empreinte de chaque photo.
   4. L'empreinte SHA-256 du PDF est calculée, puis imprimée en pied de dernière page.
   5. Le PDF est envoyé dans `rapports-finaux`, et le statut passe à `pdf_generated`.
   6. L'Edge Function `zip-and-send` est appelée avec le jeton de session de l'utilisateur.

## Machine à états

Chaque rapport porte un champ `status`. Les transitions vont dans un seul sens.

```
draft ─▶ pdf_generated ─▶ zip_created ─▶ email_sent ─▶ email_delivered ─▶ purged
                                             │
                                             └─▶ email_failed   (rebond ou plainte signalés par Resend)
```

- **Idempotence** : `zip-and-send` refuse de traiter un rapport qui n'est pas en `pdf_generated` (réponse 409). Un double clic n'envoie donc pas deux fois les mails.
- **Mises à jour conditionnelles** : le webhook ne passe un rapport en `email_delivered` que s'il est en `email_sent`, et en `email_failed` que s'il est en `email_sent` ou `zip_created`. Un événement en retard ne peut pas faire reculer un statut.
- **Paiement** : les statuts `payment_pending` et `paid` sont prévus pour Stripe, et le cron de purge sait déjà les traiter. Le paiement n'est pas encore branché.

## Edge Functions

### `zip-and-send` (appelée par le navigateur)

1. Vérifie le jeton de session (`auth.getUser`), puis que le rapport appartient bien à l'utilisateur (sinon 403).
2. Vérifie le statut `pdf_generated` (sinon 409).
3. Télécharge les photos, sans les recompresser, et les ajoute à un ZIP. Une photo introuvable n'arrête pas tout : elle est listée dans un fichier `ERREURS.txt` du ZIP.
4. Envoie le ZIP dans `edl-zips/{rapportId}/dossier-photos.zip`, passe le rapport en `zip_created`, puis **supprime aussitôt les photos sources**.
5. Crée un lien signé vers le ZIP.
6. Envoie deux emails via Resend, au bailleur et au locataire, avec le PDF en pièce jointe et le lien vers le ZIP.
7. Enregistre chaque envoi dans `email_events`, puis passe le rapport en `email_sent`. Si les deux envois échouent, le rapport reste en `zip_created` et le navigateur peut relancer.

### `webhook-resend` (appelée par Resend)

- Vérifie la signature Svix (HMAC SHA-256 via WebCrypto) et refuse les messages de plus de 5 minutes, pour éviter les rejeux.
- Retrouve le rapport grâce à l'identifiant d'email Resend, enregistre l'événement (`delivered`, `bounced`, `complained`) et met à jour le statut.
- Répond toujours 200, pour que Resend ne renvoie pas indéfiniment le même événement.

### `cron-purge` (déclenchée chaque jour à 3 h UTC par Supabase Cron)

Protégée par un secret envoyé dans l'en-tête `x-cron-secret`. Elle applique cinq règles :

| Règle | Condition | Action |
|---|---|---|
| R1 | `draft` créé il y a plus de 24 h | Suppression du rapport et de ses photos |
| R2 | `payment_pending` créé il y a plus d'1 h | Suppression du rapport et de ses photos |
| R3 | `email_delivered`, dernière livraison il y a plus de 48 h | Suppression du ZIP, statut `purged` |
| R4 | `zip_created` ou `email_failed` depuis plus de 72 h | Suppression du ZIP, statut `purged` |
| R5 | `email_sent`, dernier envoi il y a plus de 7 jours | Suppression du ZIP, statut `purged` (filet si le webhook ne vient jamais) |

Le PDF n'est jamais touché par cette fonction. Comme la table n'a pas de colonne « date du dernier changement de statut », les règles R3 et R5 lisent la date dans `email_events`.

## Côté Next.js

- **`middleware.ts`** : rafraîchit la session Supabase à chaque requête et redirige vers `/login` uniquement pour `/dashboard`. La page d'accueil reste accessible sans compte.
- **`/dashboard`** : liste les rapports de l'utilisateur, avec des liens signés valables 1 h vers le PDF et, tant qu'il existe, vers le ZIP.
- **`/api/resend-mail`** : bouton « Je n'ai pas reçu le mail ». Permet de corriger une adresse, applique un délai de 30 secondes entre deux renvois et enregistre un événement `resent`. Si les photos ont déjà été purgées, le mail ne contient que le PDF, avec une explication.

## Données

### Table `rapports` (colonnes utilisées par le code)

`id`, `created_at`, `user_id`, `status`, `type_edl`, `adresse_bien`, `bailleur_email`, `client_email`, `pdf_url`, `is_paid`, et **`data` (JSONB)** qui contient tout le contenu du rapport : métadonnées, compteurs, pièces, éléments, liens et empreintes des photos, signatures.

Le contenu tient dans une seule colonne JSONB : un seul `SELECT` ou `UPDATE` par rapport, sans jointure. Les pièces suivent une structure générique : chaque élément a un `kind`, un `etat`, des `observations` et un champ `meta` libre, pour ajouter de nouveaux types d'éléments sans migration.

### Table `email_events`

`rapport_id`, `event_type` (`sent`, `delivered`, `bounced`, `complained`, `resent`), `resend_email_id`, `payload`, `created_at`. C'est l'historique de tous les envois et événements de livraison.

### Buckets

| Bucket | Contenu | Durée de vie |
|---|---|---|
| `photos-etats-des-lieux` | Photos compressées | Supprimées dès que le ZIP est créé |
| `edl-zips` | ZIP des photos | Supprimé par le cron (règles R3 à R5) |
| `rapports-finaux` | PDF finaux | Conservés (pas de suppression automatique) |

Les tables utilisent la Row Level Security de Postgres, avec des règles limitées à `auth.uid() = user_id`.

### Modèles de pièces

`lib/pieceTemplates.ts` définit les éléments de chaque type de pièce. Les éléments du socle de la loi Alur (sols, murs et plafond, menuiseries, électricité, plomberie pour les pièces humides…) sont obligatoires et ne peuvent pas être retirés. Ajouter un type de pièce revient à ajouter quelques lignes dans ce fichier, sans toucher à la base.

## Intégrité des fichiers

- **Photos** : l'empreinte SHA-256 est calculée sur les octets compressés, ceux-là mêmes qui sont envoyés, puis copiés tels quels dans le ZIP. L'empreinte imprimée dans l'annexe du PDF correspond donc au fichier que le destinataire extrait du ZIP.
- **PDF** : l'empreinte est calculée sur le PDF généré, puis imprimée en pied de dernière page. Elle correspond donc au document **avant** l'ajout de cette ligne, ce que le PDF précise.

## Décisions et raisons

- **PDF généré dans le navigateur** : toutes les données sont déjà côté client, il n'y a aucun temps de calcul serveur à payer, et l'empreinte porte sur le document que l'utilisateur vient de valider.
- **Code OTP plutôt que lien magique** : sur mobile, le lien magique ouvre souvent un autre navigateur, et les photos gardées en mémoire seraient perdues. Avec un code, on reste sur la même page.
- **Connexion au moment de la signature** : on peut découvrir et remplir tout le formulaire avant de créer un compte.
- **Edge Functions plutôt que routes Vercel** : elles s'exécutent à côté de la base et des fichiers, ont accès aux secrets Supabase, et le webhook de Resend écrit directement en base.
- **Pas de ZIP en pièce jointe** : un dossier de photos dépasse vite les limites des messageries (20 à 25 Mo). Le mail contient seulement un lien.
- **Purge pilotée par des règles de durée de vie** : la suppression ne dépend pas d'une action de l'utilisateur, et les cas bloqués (webhook jamais reçu, envoi échoué) finissent aussi par être nettoyés.

## Limites connues et prochaines étapes

- **Paiement** : l'intégration de Stripe Checkout reste à faire (statuts `payment_pending` puis `paid`, avant la génération du PDF).
- **Archivage longue durée** : les colonnes `archive_json` et `archive_expires_at` existent mais ne sont pas encore alimentées. Il n'y a pas encore de règle de fin de conservation des PDF.
- **Empreinte du PDF** : stocker côté serveur l'empreinte du fichier final, pour qu'un destinataire puisse la vérifier directement sur le fichier reçu.
- **Schéma versionné** : le schéma et les règles RLS sont gérés dans le tableau de bord Supabase. Il faut les exporter en migrations dans `supabase/migrations`.
- **Tests automatisés** : il n'y en a pas encore. Les priorités sont les règles du cron, la machine à états de `zip-and-send` et la vérification de signature du webhook.
- **Photos remplacées** : quand l'utilisateur remplace une photo, l'ancienne reste dans le bucket jusqu'à la purge.
