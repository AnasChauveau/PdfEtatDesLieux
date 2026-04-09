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
- **Bucket `photos-etats-des-lieux`:** Stockage temporaire des photos durant l'EDL. **DOIT ÊTRE PURGÉ** après la génération du rapport via la fonction `cleanupPhotos`.
- **Bucket `rapports-finaux`:** Stockage permanent des PDF générés.
- **Table `rapports`:** Contient les métadonnées et la colonne `pdf_url`.

## Commandes Utiles
- `npm run dev` : Lancer le serveur local
- `npm run build` : Vérification de la compilation
- `npx supabase functions deploy send-edl-mail` : Déploiement des Edge Functions

## Stratégie "Zéro Déchet"
- Les photos ne sont PAS incluses dans le PDF pour optimiser le poids (cible < 300 ko).
- Les preuves visuelles sont envoyées par ZIP ou lien temporaire, puis supprimées de Supabase.