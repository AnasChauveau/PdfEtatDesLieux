// ── Types pièces & éléments (Étape 5) ────────────────────────────────────────

export type ElementKind =
  | 'sol' | 'mur_plafond' | 'menuiserie'
  | 'electricite' | 'plomberie' | 'chauffage'
  | 'volet' | 'placard' | 'clim' | 'cheminee'
  | 'equipement_meuble' | 'dpe' | 'custom';

export type PieceKind =
  | 'cuisine' | 'salon' | 'chambre' | 'sdb' | 'wc'
  | 'entree' | 'cave' | 'parking' | 'balcon' | 'buanderie' | 'autre';

export type EtatElement = 'neuf' | 'tres_bon' | 'bon' | 'moyen' | 'mauvais' | 'hs';

export interface PieceElement {
  id: string;
  kind: ElementKind;
  label: string;
  obligatoire: boolean;
  etat: EtatElement | null;
  observations: string;
  photo_url?: string;
  photo_hash?: string;
  meta: Record<string, unknown>;
}

export interface Piece {
  id: string;
  kind: PieceKind;
  nom: string;         // label affiché ("Chambre 1", "WC du bas")
  photo_url?: string;
  photo_hash?: string;
  elements: PieceElement[];
}

export interface ElementTemplate {
  kind: ElementKind;
  label: string;
  obligatoire: boolean;
}

// ── Machine à états rapports ──────────────────────────────────────────────────

export type RapportStatus =
  | 'draft'
  | 'pdf_generated'
  | 'zip_created'
  | 'email_sent'
  | 'email_delivered'
  | 'email_failed'
  | 'purged';

export interface EmailEvent {
  id: string;
  rapport_id: string;
  event_type: 'sent' | 'delivered' | 'bounced' | 'complained' | 'resent';
  resend_email_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}
