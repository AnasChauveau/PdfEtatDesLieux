# État des Lieux Pro - Project Guide

## Stack Technique
- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend/Storage:** Supabase (Database + Storage)
- **PDF Generation:** jsPDF + jspdf-autotable
- **Icons:** Lucide React

## Conventions de Code
- **Langue:** Code en Anglais (variables, fonctions), UI en Français.
- **Composants:** React Server Components par défaut, 'use client' si nécessaire.
- **État:** Gestion via `formData` local et `useState` pour les étapes.

## Structure de Données & Storage
- **Bucket `photos-etats-des-lieux`:** Photos sources temporaires. Supprimées dès que le ZIP est uploadé (`zip_created`).
- **Bucket `edl-zips`:** ZIP des photos. Path : `{rapportId}/dossier-photos.zip`. Supprimé 48h après `email_delivered` (cron 5.ter).
- **Bucket `rapports-finaux`:** PDF générés. Conservés 9 ans.
- **Table `rapports`:** Métadonnées + colonnes `pdf_url`, `status`, `archive_expires_at`, `archive_json`.
- **Table `email_events`:** Log de tous les webhooks Resend et renvois manuels.

## Commandes Utiles
- `npm run dev` : Lancer le serveur local
- `npm run build` : Vérification de la compilation
- `npx supabase functions deploy send-edl-mail` : Déploiement des Edge Functions

## Stratégie "Zéro Déchet"
- Les photos ne sont PAS incluses dans le PDF pour optimiser le poids (cible < 300 ko).
- Les preuves visuelles sont envoyées par ZIP ou lien temporaire, puis supprimées de Supabase.




# Projet : Application d'État des Lieux (EDL) — Contexte Loi 2026

## 🎯 Vision produit

Générateur éphémère d'états des lieux immobiliers pour bailleurs privés et petites
agences, positionné sur le dispositif **Jeanbrun** (loi de finances 2026, applicable
depuis le 21 février 2026) qui attire un afflux de nouveaux bailleurs obligés de
documenter leurs locations.

**Philosophie "Zéro Déchet Numérique"** : on capture l'instant T, on produit un
document légal (PDF signé) + un dossier de preuves (ZIP photos), on livre par email
aux deux parties, puis on purge les données sources. L'utilisateur est propriétaire
de ses archives, pas nous.

**Positionnement** : pas un jouet rapide, un **outil métier sérieux, conforme Loi Alur**,
avec un workflow fluide de ~15 minutes. Avantage concurrentiel = vitesse de génération
+ propreté du flux de données + coûts d'infra proches de zéro.

## 📦 État actuel du code (MVP en cours)

- **Stack** : Next.js (App Router) + Supabase (DB + Storage + Edge Functions) +
  Resend (emailing transactionnel) + TypeScript + Tailwind CSS
- **Formulaire multi-étapes** fonctionnel : `components/EdlForm.tsx` (5 étapes :
  bien, parties, compteurs, pièces, signature)
- **Génération PDF** : `lib/pdfGenerator.ts` — **actuellement jsPDF, à migrer vers pdf-lib**
- **Icons:** Lucide React (actuellement, mais modifier si besoins)
- **Signatures** : capturées via Canvas HTML5, insérées en 60x30 dans le PDF
- **RLS Supabase** : configurée pour upload/delete en mode anon (à auditer avant prod)
- **Purge automatique** des photos après clôture : fonctionne mais doit devenir
  conditionnelle (cf. machine à états ci-dessous)

## ⚠️ Contraintes inviolables

1. **PDF final < 700 Ko** — compression images obligatoire avant intégration.
2. **Ne jamais modifier la structure de la table `rapports`** sans demander
   confirmation explicite à l'utilisateur.
3. **La purge des photos sources se déclenche immédiatement** dès que le ZIP est
   uploadé avec succès (`zip_created`). La purge du ZIP lui-même n'a lieu que 48 h
   après `email_delivered`, via le cron quotidien. Jamais avant.
4. **Ne jamais employer "signature électronique certifiée"** dans le marketing
   ou l'UI tant qu'eIDAS n'est pas intégré (zone grise juridique).

## Structure de Données & Storage
- **Bucket `photos-etats-des-lieux`:** Photos sources temporaires. Supprimées dès que le ZIP est uploadé (`zip_created`).
- **Bucket `edl-zips`:** ZIP des photos. Path : `{rapportId}/dossier-photos.zip`. Supprimé 48h après `email_delivered` (cron 5.ter).
- **Bucket `rapports-finaux`:** PDF générés. Conservés 9 ans.
- **Table `rapports`:** Métadonnées + colonnes `pdf_url`, `status`, `archive_expires_at`, `archive_json`.
- **Table `email_events`:** Log de tous les webhooks Resend et renvois manuels.

## Commandes Utiles
- `npm run dev` : Lancer le serveur local
- `npm run build` : Vérification de la compilation

## 🏗️ Décisions d'architecture actées

### 1. Migration `jsPDF` → `pdf-lib` (priorité haute)

`pdf-lib` est préféré pour :
- contrôle fin de la mise en page
- incorporation propre d'images et polices
- **manipulation d'un PDF existant** (essentiel pour injecter le hash après coup
  et pour parser un EDL d'entrée lors de la génération d'un EDL de sortie)

Isoler toute la logique dans `lib/pdfGenerator.ts` derrière une interface stable
pour qu'un futur swap soit indolore.

### 2. Signature : abstraction pour futur eIDAS

Isoler la logique de signature dans `lib/signature.ts` avec une interface claire :

```ts
interface SignatureProvider {
  signDocument(pdf: Uint8Array, signers: Signer[]): Promise<Uint8Array>
}
```

Implémentation MVP : `CanvasSignatureProvider` (dessin manuel + hash).
Implémentation future : `YousignProvider` ou `DocaposteProvider` (eIDAS).
Le reste du code ne doit jamais connaître l'implémentation concrète.

### 3. Machine à états sur la table `rapports`

Champ `status` (enum) avec les transitions suivantes :

```
draft
  → payment_pending   ← Stripe Checkout initié
  → paid              ← webhook Stripe payment_intent.succeeded → déclenche génération PDF
  → pdf_generated
  → zip_created       ← ZIP uploadé sur Storage ; photos sources supprimées immédiatement
  → email_sent
  → email_delivered   ← via webhook Resend ; démarre le TTL 48h
  → purged            ← cron quotidien, 48h après email_delivered (ZIP supprimé)
```

**Règles de purge** (pilotées par le cron quotidien — voir §8) :
- `draft` depuis > 24 h → purge totale (ligne DB + photos sources)
- `payment_pending` depuis > 1 h → purge totale (paiement abandonné ou échoué)
- `email_delivered` depuis > 48 h → suppression du ZIP uploadé uniquement ; PDF et `archive_json` conservés 9 ans

Si le webhook Resend renvoie `bounced` ou `complained`, on NE PURGE PAS et on reste
en état `email_sent` (pas de transition vers `email_delivered`).

Table dédiée `email_events` pour logger tous les webhooks Resend et les renvois manuels
(assurance-vie juridique en cas de litige).

### 6. Modèle économique : paiement à l'acte via Stripe

**Principe** : paiement AVANT génération du PDF. Pas d'abonnement, pas de pay-after.
Le statut `paid` (déclenché par le webhook Stripe `payment_intent.succeeded`) est le
seul déclencheur autorisé de la transition `paid → pdf_generated`.

**Pricing cible** : 9–19 € par EDL pour bailleurs particuliers. Packs de crédits
envisagés pour les agences (volume).

Flux Stripe :
1. Formulaire complété → INSERT `status='draft'`
2. Redirect vers Stripe Checkout
3. Webhook Stripe `payment_intent.succeeded` → UPDATE `status='paid'`
4. Génération PDF déclenchée → `status='pdf_generated'`

Un rapport resté en `payment_pending` depuis plus de 1 h peut être considéré abandonné
(paiement échoué ou annulé) — le cron quotidien (voir roadmap) le purgera avec les
drafts expirés.

### 7. Livraison email : PDF en pièce jointe, ZIP via lien signé

**Contrainte découverte** : les limites des pièces jointes mail (Gmail 25 Mo, Outlook
20 Mo) sont incompatibles avec un ZIP de photos EDL réaliste (75–125 Mo pour 25 photos
de smartphone). Le ZIP ne doit **jamais** partir en pièce jointe.

**Logique d'envoi actée** :
- Le **PDF** est envoyé en pièce jointe (< 700 Ko, OK partout).
- Le **ZIP** est uploadé sur Supabase Storage (bucket `edl-zips`, path
  `{rapportId}/dossier-photos.zip`) → transition `zip_created`.
- Le mail contient un **lien signé** `createSignedUrl()` vers le ZIP, avec une
  expiration calée sur J+2 (48 h après `email_delivered`, même moment que la purge).
- Le corps du mail affiche explicitement la date d'expiration du lien, pour incarner
  la philosophie Zéro Déchet.
- Supabase logge les accès aux liens signés → preuve contradictoire en cas de litige
  ("Le ZIP a bien été téléchargé le [date]").

**Séquence de purge affinée** :
1. `zip_created` → photos sources individuelles supprimées immédiatement du bucket.
2. `email_delivered` + 48 h (cron) → fichier ZIP supprimé du bucket `edl-zips`.
3. PDF + `archive_json` : conservés 9 ans.

**Bouton "Je n'ai pas reçu le mail"** (voir Garde-fous UX) :
- Régénère un lien signé frais (valide jusqu'à la date de purge).
- Relance le mail complet via Resend (PDF en PJ + nouveau lien ZIP signé).
- Log dans `email_events` : `event_type = 'resent'`.
- Si le statut est déjà `purged` : le renvoi contient uniquement le PDF avec la
  mention "Les photos originales ont été supprimées conformément à notre politique
  Zéro Déchet. Le PDF reste votre document légal de référence."

### 4. Structure de données extensible : `elements[]` générique

Principe : **une seule table/structure générique `elements`** polymorphique, typée
par un champ `kind`. Le champ magique est `meta: Record<string, unknown>` qui
permet d'ajouter DPE, meublé, diagnostics, sans aucune migration de schéma.

```ts
type Rapport = {
  id: string
  type_edl: 'entree' | 'sortie'
  meuble: boolean
  bien: BienInfo
  parties: Parties
  compteurs: Compteur[]
  pieces: Piece[]
  signatures: Signatures
  status: RapportStatus
  created_at: string
  archive_expires_at: string  // created_at + 9 ans
}

type Piece = {
  id: string
  kind: 'cuisine' | 'salon' | 'chambre' | 'sdb' | 'wc' | 'entree'
      | 'cave' | 'parking' | 'balcon' | 'buanderie' | 'autre'
  label: string           // "Chambre 1", "WC du bas"
  ordre: number
  elements: Element[]
  photos: PhotoRef[]
}

type Element = {
  id: string
  kind: ElementKind
  label: string           // éditable
  obligatoire: boolean    // socle Alur, non supprimable
  etat: 'neuf' | 'tres_bon' | 'bon' | 'moyen' | 'mauvais' | 'hs' | null
  observations: string
  photos: PhotoRef[]
  meta: Record<string, unknown>  // 👈 joker extensibilité
}

type ElementKind =
  | 'sol' | 'mur_plafond' | 'menuiserie'
  | 'electricite' | 'plomberie' | 'chauffage'
  | 'volet' | 'placard' | 'clim' | 'cheminee'
  | 'equipement_meuble' | 'dpe' | 'custom'
```

**Stockage Supabase** : colonne `data JSONB` sur la table `rapports`. Un seul
SELECT/UPDATE, pas de jointures, vélocité maximale. On normalisera plus tard si
un vrai besoin apparaît (probablement jamais).

### 5. Templates de pièces = code, pas data

Fichier `lib/pieceTemplates.ts` : objet `Record<PieceKind, ElementTemplate[]>`.
Ajouter une pièce = 3 lignes dans un fichier, zéro migration DB.

```ts
export const pieceTemplates: Record<PieceKind, ElementTemplate[]> = {
  cuisine: [
    { kind: 'sol', label: 'Sols / Plinthes', obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond', obligatoire: true },
    { kind: 'menuiserie', label: 'Menuiseries / Vitres', obligatoire: true },
    { kind: 'electricite', label: 'Prises & Interrupteurs', obligatoire: true },
    { kind: 'plomberie', label: 'Évier & Robinetterie', obligatoire: true },
  ],
  wc: [
    { kind: 'sol', label: 'Sol', obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond', obligatoire: true },
    { kind: 'plomberie', label: "Cuvette & Chasse d'eau", obligatoire: true },
    { kind: 'electricite', label: 'Éclairage', obligatoire: true },
  ],
  // ... etc
}
```

**Priorité d'ajout des pièces** : WC en premier (le plus oublié, source #1 de
litiges), puis parking, puis cave, puis balcon.

### 8. Purge automatique — cron quotidien Supabase (3 TTL)

Un seul cron quotidien (pg_cron ou Edge Function planifiée) gère les 3 règles :

| Condition | Action |
|---|---|
| `status = 'draft'` depuis > 24 h | Purge totale : suppression ligne DB + photos sources dans `photos-etats-des-lieux` |
| `status = 'payment_pending'` depuis > 1 h | Purge totale : paiement abandonné ou échoué |
| `status = 'email_delivered'` depuis > 48 h | Suppression du ZIP dans `edl-zips` uniquement → `status = 'purged'` |

PDF (`rapports-finaux`) et `archive_json` ne sont jamais touchés par ce cron.
Ils restent jusqu'à `archive_expires_at` (created_at + 9 ans), purgés par un cron séparé.

## 📜 Conformité Loi Alur — éléments obligatoires

Chaque pièce doit inclure **par défaut et de manière non supprimable** (socle Alur) :
- Sols / plinthes
- Murs & plafond
- Menuiseries / vitres
- **Électricité** (prises & interrupteurs) pour toutes les pièces intérieures habitables
- **Plomberie / sanitaires** pour les pièces humides (cuisine, SDB, WC)
- **Chauffage / radiateurs** si présents

Badge UI "✓ Conforme Loi Alur" affiché quand tous les éléments obligatoires sont
remplis. Rassure le novice, c'est gratuit à implémenter.

Stratégie "Élément Fantôme" : au-delà du socle obligatoire, l'utilisateur peut
ajouter des éléments optionnels via un gros bouton "+ Ajouter un équipement"
(volets, placards, clim, cheminée...).

## 🔒 Mentions légales obligatoires dans le PDF

Le PDF actuel manque les éléments suivants. **À ajouter avant tout lancement** :

1. **Date et heure précises** de l'état des lieux
2. **Lieu de signature**
3. **Pagination** "Page X / Y" en pied de page
4. **Identifiant unique** visible en en-tête (format `EDL-2026-XXXXXX`, UUID court)
5. **Mention légale** : "Le présent état des lieux a été établi contradictoirement
   entre les parties, qui reconnaissent en avoir reçu un exemplaire."
6. **Hash SHA-256 du PDF** imprimé en pied de page de la dernière page (preuve
   de non-altération). Workflow : générer le PDF, calculer son hash, réinjecter
   le hash dans le PDF, sauvegarder.
7. **Annexe photographique** en fin de PDF :
   - liste numérotée `Photo #001 — Cuisine — Menuiseries`
   - hash SHA-256 de chaque photo
   - renvoi explicite au ZIP : "Photos consultables dans le dossier ZIP joint"

## 💾 Stratégie d'archivage 9 ans

Durée légale d'engagement Jeanbrun = 9 ans. Pendant cette période on conserve :

- **Le PDF signé** (immuable, avec hash)
- **Le JSON structuré** du rapport (`archive_json`, colonne JSONB, 5-20 Ko,
  permet de régénérer un EDL de sortie comparatif)

On PURGE en revanche :
- Les photos haute définition (livrées dans le ZIP aux deux parties)
- Les fichiers temporaires de travail

Champ `archive_expires_at` calculé automatiquement = `created_at + 9 ans`.
Cron Supabase quotidien qui purge tout ce qui dépasse (RGPD-propre by design).

## 🔁 Workflow EDL entrée → sortie

- Si l'EDL d'entrée a été fait sur l'app : le JSON structuré est conservé,
  la génération de l'EDL de sortie pré-remplit tous les éléments avec leur état
  d'origine, l'utilisateur n'a qu'à comparer et noter les évolutions.
- Si l'EDL d'entrée vient d'une autre app : bouton **"Importer un EDL d'entrée"**
  qui accepte un PDF. Implémentation différée (post-MVP), mais le bouton doit
  exister en "Bientôt disponible" dès le MVP (argument commercial).

## 🛡️ Garde-fous UX critiques

1. **Double livraison email** : le PDF (PJ) + lien ZIP signé partent simultanément
   au bailleur ET au locataire. Deux copies dans la nature = preuve contradictoire.

2. **Écran de succès final — automatisé, sans bouton "Purger"** :
   La purge est désormais entièrement pilotée par le cron (TTL). L'utilisateur ne
   porte plus cette responsabilité technique. L'écran final affiche simplement :

   > ✅ Votre EDL a été envoyé
   >
   > Le PDF et les photos ont été envoyés à :
   > — [email_bailleur]
   > — [email_locataire]
   >
   > Vos photos seront automatiquement supprimées dans 48h, conformément à notre
   > politique Zéro Déchet. Le PDF reste votre document légal de référence.
   >
   > [🔄 Je n'ai pas reçu le mail — renvoyer]   [➕ Créer un nouveau rapport]

   Le bouton "Je n'ai pas reçu le mail" ouvre une modale permettant de corriger
   une éventuelle faute de frappe dans les adresses, puis redéclenche l'envoi
   complet (nouveau lien signé ZIP + PDF en PJ). Voir §7 pour la logique de renvoi.

3. **Fallback sans email** : le lien signé ZIP (J+2) peut être partagé par
   SMS/WhatsApp/papier pour les locataires sans adresse mail.

4. **Mode brouillon offline** : service worker + localStorage pour conserver
   la saisie en cours. Les caves/parkings/combles n'ont pas toujours de 4G.
   Non-négociable avant lancement public.

## 📋 Roadmap priorisée

Ordre d'implémentation recommandé :

1. ~~**Machine à états `status`**~~ ✅ FAIT — machine à états + écran de confirmation manuelle
2. ~~**Migration `jsPDF` → `pdf-lib`**~~ ✅ FAIT — contrôle fin de la mise en page, images, word wrap
3. **ZIP + Resend + écran de succès** (1 j) — PDF en PJ, ZIP via lien signé Supabase J+2 ;
    inclut l'écran final "EDL envoyé" (remplace les sous-états A/B/C) avec bouton
    "Je n'ai pas reçu le mail" et mention de la date de purge automatique
4. **Refonte PDF** : mentions légales + hash + annexe photos numérotées (1 j)
5. **Structure `elements[]` + templates de pièces** (1-2 j) — AVANT d'ajouter WC/parking
5.ter. **Cron de purge automatique — 3 TTL** (2 h) — règles draft/24h, payment_pending/1h,
    email_delivered/48h ; remplace l'écran de confirmation manuelle ; voir §8
6. **AUTH** (Supabase Magic Link + user_id sur rapports + migration RLS anon→authenticated)
7. **Dashboard "Mes EDL"** (page /dashboard, liste des rapports du user connecté)
8. **Mode brouillon localStorage** (0.5 j) — discret mais critique
9. **Ajout pièces WC, parking, cave, balcon** (2 h chacune grâce aux templates)
10. **Badge "Conforme Loi Alur"** (2 h)
11. **Intégration Stripe Checkout** (1 j) — statuts `payment_pending` et `paid` ; le webhook
    `payment_intent.succeeded` devient le déclencheur de la génération PDF à la place de
    l'INSERT direct. À faire après la refonte PDF (#4) pour ne pas payer un PDF bancal.
    ⚠️ L'app utilisera Supabase Auth (Magic Link email). Pour l'instant on continue en mode
    anon. L'auth sera intégrée à l'étape Auth (#6) de la roadmap. Ne crée aucune dépendance
    à l'authentification dans cette étape.
12. **Cron Supabase quotidien — archivage 9 ans** (2 h) — supprime les rapports dont
    `archive_expires_at` est dépassé (PDF + archive_json). Distinct du cron de purge 5.ter.
13. **Page landing + exemple PDF statique** — page publique de présentation avec un PDF
    d'exemple téléchargeable (argument commercial, confiance utilisateur)

Post-MVP : import EDL d'entrée externe, intégration DPE, mode meublé avancé,
eIDAS via Yousign, PWA offline complète.

## ✅ Checklist avant prod

- [ ] **Auditer et durcir toutes les policies RLS** (actuellement permissives en mode anon pour INSERT/UPDATE/DELETE)
- [ ] **Supprimer les photos orphelines** lors du remplacement d'une photo par l'utilisateur : quand une nouvelle photo est uploadée à la place d'une existante, l'ancienne URL est écrasée dans le state mais le fichier reste dans le bucket `photos-etats-des-lieux`. À corriger avant prod.
- [ ] **Rédiger CGU/CGV** incluant la clause sur le délai de téléchargement des photos (48h) et la valeur probante exclusive du PDF après purge. Clause type : "Le client reconnaît que les photos sont mises à disposition via un lien temporaire de 48h et qu'il lui incombe de les télécharger et archiver dans ce délai. Passé ce délai, seul le PDF fait foi comme document contradictoire."
- [ ] **Acheter un nom de domaine** et le brancher sur Vercel (Settings → Domains).
- [ ] **Vérifier le domaine dans Resend** (Domains → Add Domain → copier les DNS records) et mettre à jour `RESEND_FROM_EMAIL` dans Vercel ET dans les secrets Supabase (`supabase secrets set RESEND_FROM_EMAIL=...`).
- [ ] **Configurer Supabase Auth** → Site URL & Redirect URLs avec l'URL Vercel de production au moment de l'étape 6 (Auth Magic Link).

## 🤝 Conventions de travail avec Claude Code

- **Toujours demander avant** de modifier la structure de la table `rapports`
  ou de supprimer des fichiers de `lib/`.
- **Toujours expliquer le "pourquoi"** d'un changement d'architecture avant de
  coder, pas juste le "quoi".
- **Tester la génération PDF** après toute modification de `pdfGenerator.ts`
  en vérifiant que le fichier de sortie reste < 700 Ko.
- **Préférer les petits commits atomiques** plutôt que les gros refactors d'un
  coup — Raphaël veut pouvoir suivre et apprendre, pas juste valider.
- **Parler français** dans les réponses, les commentaires de code peuvent rester
  en anglais (convention standard).
- Raphaël est à un moment émotionnellement sensible sur ce projet : encourager
  les bonnes décisions déjà prises, être pédagogue, éviter de tout remettre en
  question sans raison forte.