import type { ElementTemplate, PieceKind } from './types';

// Templates de pièces conformes au socle Loi Alur.
// Règles :
//   - Toutes les pièces habitables    : sol, mur_plafond, menuiserie, electricite
//   - Pièces humides (cuisine/sdb/wc) : + plomberie
//   - Toutes sauf cave/parking/balcon : + chauffage
//
// Ces templates couvrent les 11 kinds définis dans PieceKind.
// Les pièces WC/cave/parking/buanderie ne sont pas encore dans le sélecteur UI
// (ajout prévu étape suivante) mais leurs templates sont prêts.

export const pieceTemplates: Record<PieceKind, ElementTemplate[]> = {
  cuisine: [
    { kind: 'sol',        label: 'Sols / Plinthes',          obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',          obligatoire: true },
    { kind: 'menuiserie', label: 'Menuiseries / Vitres',      obligatoire: true },
    { kind: 'electricite', label: 'Prises & Interrupteurs',   obligatoire: true },
    { kind: 'plomberie',  label: 'Évier & Robinetterie',      obligatoire: true },
    { kind: 'chauffage',  label: 'Radiateur / Chauffage',     obligatoire: true },
  ],
  salon: [
    { kind: 'sol',        label: 'Sols / Plinthes',          obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',          obligatoire: true },
    { kind: 'menuiserie', label: 'Menuiseries / Vitres',      obligatoire: true },
    { kind: 'electricite', label: 'Prises & Interrupteurs',   obligatoire: true },
    { kind: 'chauffage',  label: 'Radiateur / Chauffage',     obligatoire: true },
  ],
  chambre: [
    { kind: 'sol',        label: 'Sols / Plinthes',          obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',          obligatoire: true },
    { kind: 'menuiserie', label: 'Menuiseries / Vitres',      obligatoire: true },
    { kind: 'electricite', label: 'Prises & Interrupteurs',   obligatoire: true },
    { kind: 'chauffage',  label: 'Radiateur / Chauffage',     obligatoire: true },
  ],
  sdb: [
    { kind: 'sol',        label: 'Sols / Plinthes',              obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',              obligatoire: true },
    { kind: 'menuiserie', label: 'Menuiseries / Vitres',          obligatoire: true },
    { kind: 'electricite', label: 'Éclairage / Prises',           obligatoire: true },
    { kind: 'plomberie',  label: 'Lavabo, Douche & Robinetterie', obligatoire: true },
    { kind: 'chauffage',  label: 'Radiateur / Sèche-serviette',   obligatoire: true },
  ],
  wc: [
    { kind: 'sol',        label: 'Sol',                      obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',          obligatoire: true },
    { kind: 'plomberie',  label: "Cuvette & Chasse d'eau",   obligatoire: true },
    { kind: 'electricite', label: 'Éclairage',               obligatoire: true },
  ],
  entree: [
    { kind: 'sol',        label: 'Sols / Plinthes',          obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',          obligatoire: true },
    { kind: 'menuiserie', label: 'Porte Entrée / Interphone', obligatoire: true },
    { kind: 'electricite', label: 'Éclairage / Prises',       obligatoire: true },
  ],
  balcon: [
    { kind: 'sol',        label: 'Sol (revêtement)',          obligatoire: true },
    { kind: 'mur_plafond', label: 'Garde-corps / Parois',     obligatoire: true },
    { kind: 'menuiserie', label: 'Porte-fenêtre / Accès',     obligatoire: true },
  ],
  cave: [
    { kind: 'sol',        label: 'Sol',                      obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',          obligatoire: true },
    { kind: 'menuiserie', label: 'Porte / Accès',             obligatoire: true },
  ],
  parking: [
    { kind: 'sol',        label: 'Sol',                           obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',               obligatoire: true },
    { kind: 'menuiserie', label: 'Portail / Porte de garage',      obligatoire: true },
  ],
  buanderie: [
    { kind: 'sol',        label: 'Sol',                      obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',          obligatoire: true },
    { kind: 'plomberie',  label: 'Arrivée & Évacuation eau', obligatoire: true },
    { kind: 'electricite', label: 'Prises (norme 16A)',       obligatoire: true },
  ],
  autre: [
    { kind: 'sol',        label: 'Sol',                       obligatoire: true },
    { kind: 'mur_plafond', label: 'Murs & Plafond',           obligatoire: true },
    { kind: 'menuiserie', label: 'Menuiseries / Accès',        obligatoire: true },
  ],
};

// Déduit le PieceKind à partir du nom affiché (insensible aux accents)
export function getPieceKind(nom: string): PieceKind {
  const n = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.startsWith('chambre')) return 'chambre';
  if (n === 'cuisine') return 'cuisine';
  if (n === 'salon' || n === 'sejour') return 'salon';
  if (n === 'sdb' || n.includes('salle de bain')) return 'sdb';
  if (n === 'wc' || n === 'toilettes') return 'wc';
  if (n === 'entree' || n === 'hall') return 'entree';
  if (n === 'balcon' || n === 'terrasse') return 'balcon';
  if (n === 'cave') return 'cave';
  if (n === 'parking' || n === 'garage' || n.startsWith('parking')) return 'parking';
  if (n === 'buanderie') return 'buanderie';
  return 'autre';
}
