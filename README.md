# Express EDL

> **États des lieux immobiliers dématérialisés, conformes à la Loi Alur 2026 (dispositif Jeanbrun).**
> Pour bailleurs privés et petites agences. Philosophie "Zéro Déchet Numérique" : on capture, on livre, on purge.

[![Deployed on Vercel](https://img.shields.io/badge/deployed-vercel-black)](https://express-edl.fr)
[![Next.js](https://img.shields.io/badge/next.js-15-black)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/backend-supabase-3ECF8E)](https://supabase.com)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red)](./LICENSE)

---

## 🎯 En 30 secondes

Express EDL permet à un bailleur privé de réaliser un état des lieux complet **en 15 minutes depuis son téléphone**, puis de recevoir :

- Un **PDF juridiquement conforme à la Loi Alur**, avec mentions légales obligatoires, pagination, horodatage précis, identifiant unique et empreinte cryptographique SHA-256
- Un **ZIP de preuves photographiques**, chaque photo accompagnée de son empreinte SHA-256 individuelle
- **Les deux envoyés automatiquement** au bailleur et au locataire par email

Après 48h, **les photos sont automatiquement purgées** des serveurs. Le client reste propriétaire de ses archives. Nous ne les conservons pas.

## 🌱 Pourquoi ce projet est différent

**1. Zéro stockage long terme.** Les photos haute définition sont supprimées 48h après livraison. Seul un JSON structuré (5-20 Ko) est conservé 9 ans — durée d'engagement fiscal Jeanbrun — pour permettre les EDL de sortie comparatifs. Aucune dette de stockage, aucun risque RGPD lié à une conservation excessive.

**2. Preuve cryptographique.** Chaque photo porte un hash SHA-256 imprimé dans l'annexe photographique du PDF. Le PDF lui-même est scellé par un hash global. En cas de litige, il est mathématiquement prouvable qu'aucun document n'a été modifié depuis sa création.

**3. Paiement à l'acte.** Pas d'abonnement. 9 à 19€ par EDL via Stripe. Adapté aux bailleurs qui font 2 à 4 états des lieux par an.

**4. Mobile-first vraiment.** L'app a été conçue et testée pour un usage terrain sur smartphone, pas adaptée depuis un desktop. Caméra directe, signature tactile, auto-sauvegarde brouillon.

## 📦 Stack technique

| Couche | Technologie | Rôle |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind | Interface web mobile-first |
| Base de données | Supabase Postgres | Rapports, utilisateurs, événements email |
| Storage | Supabase Storage | Photos temporaires, ZIP, PDF finaux |
| Authentification | Supabase Auth (OTP email 6 chiffres) | Connexion sans mot de passe |
| Génération PDF | pdf-lib (client-side) | PDF A4 pagination, tableaux, hash |
| Traitement photos | browser-image-compression | Redimensionnement + conversion JPEG |
| Emails transactionnels | Resend + domaine `express-edl.fr` | Envoi bailleur + locataire |
| Fonctions serveur | Supabase Edge Functions (Deno) | ZIP, envoi mail, webhook, purge cron |
| Hébergement | Vercel | Déploiement continu via Git |
| Paiement | Stripe Checkout (post-MVP) | Pay-per-use |

## 🚀 Démarrage local

```bash
git clone https://github.com/AnasChauveau/PdfEtatDesLieux.git
cd PdfEtatDesLieux
npm install

cp .env.local.example .env.local
# Éditer .env.local avec les credentials Supabase et Resend

npm run dev
```

Pour les Edge Functions :

```bash
supabase login
supabase link --project-ref <ref>
supabase functions deploy zip-and-send
supabase functions deploy webhook-resend
supabase functions deploy cron-purge
```

## 📖 Documentation
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Architecture détaillée, plus d'information sur le projet

## 📄 Licence

Propriétaire. Tous droits réservés. Code publié pour inspection uniquement.

## 👤 Contact

Anas Chauveau - [express-edl.fr](https://express-edl.fr) - contact@express-edl.fr
