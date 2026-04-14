"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, ImageIcon, User, MapPin, Calendar, ArrowRight, CheckCircle2, Trash2, Lock, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import imageCompression from 'browser-image-compression';
import SignatureCanvas from 'react-signature-canvas';
import { generateEDL_PDF, injectHashIntoPDF } from '@/lib/pdfGenerator';
import type { RapportStatus, PieceElement, ElementKind, ElementTemplate } from '@/lib/types';
import { pieceTemplates, getPieceKind } from '@/lib/pieceTemplates';

// ── Constantes éléments ──────────────────────────────────────────────────────

const ETAT_LABELS: Record<string, string> = {
  neuf: 'Neuf',
  tres_bon: 'Très bon état',
  bon: 'Bon état',
  moyen: 'Usure normale',
  mauvais: 'Mauvais état',
  hs: 'Hors service',
};

const OPTIONAL_ELEMENTS: Array<{ kind: ElementKind; label: string }> = [
  { kind: 'volet',           label: 'Volet / Store' },
  { kind: 'placard',         label: 'Placard / Rangement' },
  { kind: 'clim',            label: 'Climatisation' },
  { kind: 'cheminee',        label: 'Cheminée / Poêle' },
  { kind: 'equipement_meuble', label: 'Équipement (meublé)' },
  { kind: 'custom',          label: 'Autre (texte libre)' },
];

function makeElement(t: ElementTemplate): PieceElement {
  return {
    id: crypto.randomUUID(),
    kind: t.kind,
    label: t.label,
    obligatoire: t.obligatoire,
    etat: null,
    observations: '',
    meta: {},
  };
}

// À câbler lors de l'implémentation "reprendre un brouillon draft" (roadmap étape 6 — Auth).
// Convertit un élément ancien { nom, etat (label FR), observations } en PieceElement typé.
// Note : les anciens etat ("Bon état", "Très bon état") resteront en string brut dans
// etat — une table de mapping inverse sera nécessaire au moment du câblage.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function normalizeElement(el: any): PieceElement {
  return {
    id: el.id ?? crypto.randomUUID(),
    kind: el.kind ?? ('custom' as ElementKind),
    label: el.label ?? el.nom ?? '',
    obligatoire: el.obligatoire ?? false,
    etat: el.etat ?? null,
    observations: el.observations ?? '',
    photo_url: el.photo_url,
    photo_hash: el.photo_hash,
    meta: el.meta ?? {},
  };
}

// Composant sélecteur d'équipement optionnel — une instance par pièce
function AddEquipmentRow({ onAdd }: { onAdd: (kind: ElementKind, label: string) => void }) {
  const [kind, setKind] = useState<ElementKind>('volet');
  const [customLabel, setCustomLabel] = useState('');

  return (
    <div className="flex gap-2 items-center flex-wrap">
      <select
        value={kind}
        onChange={e => { setKind(e.target.value as ElementKind); setCustomLabel(''); }}
        className="flex-1 min-w-0 p-2 rounded-lg border border-slate-200 text-xs bg-white"
      >
        {OPTIONAL_ELEMENTS.map(e => <option key={e.kind} value={e.kind}>{e.label}</option>)}
      </select>
      {kind === 'custom' && (
        <input
          value={customLabel}
          onChange={e => setCustomLabel(e.target.value)}
          placeholder="Nom de l'équipement"
          className="flex-1 min-w-0 p-2 rounded-lg border border-slate-200 text-xs"
        />
      )}
      <button
        type="button"
        onClick={() => {
          const label = kind === 'custom'
            ? (customLabel.trim() || 'Équipement')
            : OPTIONAL_ELEMENTS.find(e => e.kind === kind)!.label;
          onAdd(kind, label);
          setCustomLabel('');
        }}
        className="shrink-0 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition"
      >
        + Ajouter
      </button>
    </div>
  );
}

// ── Composant PhotoSelector ───────────────────────────────────────────────────

function PhotoSelector({ onPhotoSelected, isUploading, hasPhoto, compact = false, onPhotoDeleted }: {
  onPhotoSelected: (file: File) => Promise<void>;
  isUploading: boolean;
  hasPhoto: boolean;
  compact?: boolean;
  onPhotoDeleted?: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await onPhotoSelected(file);
    e.target.value = '';
    setShowMenu(false);
  };

  const hiddenInputs = (
    <>
      <input ref={cameraRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleChange} />
      <input ref={galleryRef} type="file" className="hidden" accept="image/*" onChange={handleChange} />
    </>
  );

  // ── MODE COMPACT (Step 3) ──
  if (compact) {
    if (isUploading) return (
      <div className="flex items-center justify-center w-8 h-8 bg-slate-100 rounded-lg shrink-0">
        <div className="w-3 h-3 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );

    if (hasPhoto) return (
      <div className="flex items-center gap-1 shrink-0">
        {hiddenInputs}
        <button type="button" onClick={() => cameraRef.current?.click()}
          title="Remplacer (caméra)"
          className="w-8 h-8 flex items-center justify-center bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          <Camera size={15} />
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()}
          title="Remplacer (galerie)"
          className="w-8 h-8 flex items-center justify-center bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition">
          <ImageIcon size={15} />
        </button>
        {onPhotoDeleted && (
          <button type="button" onClick={onPhotoDeleted}
            title="Supprimer la photo"
            className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition">
            <X size={14} />
          </button>
        )}
      </div>
    );

    return (
      <div className="flex items-center gap-1 shrink-0">
        {hiddenInputs}
        <button type="button" onClick={() => cameraRef.current?.click()}
          title="Caméra"
          className="w-8 h-8 flex items-center justify-center bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition">
          <Camera size={15} />
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()}
          title="Galerie"
          className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition">
          <ImageIcon size={15} />
        </button>
      </div>
    );
  }

  // ── MODE NORMAL (Step 2) — popup vers le haut ──
  const popupMenu = (
    <div className="absolute right-0 bottom-full mb-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 w-44">
      <button type="button" onClick={() => cameraRef.current?.click()}
        className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
        <Camera size={16} className="text-slate-500" /> Caméra
      </button>
      <div className="h-px bg-slate-100" />
      <button type="button" onClick={() => galleryRef.current?.click()}
        className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
        <ImageIcon size={16} className="text-slate-500" /> Galerie
      </button>
    </div>
  );

  if (isUploading) return (
    <div className="flex items-center justify-center w-12 h-12 bg-slate-100 rounded-xl shrink-0">
      <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  if (hasPhoto) return (
    <div ref={containerRef} className="relative shrink-0">
      {hiddenInputs}
      <button type="button" onClick={() => setShowMenu(prev => !prev)}
        className="flex items-center gap-2 px-3 h-12 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition">
        <CheckCircle2 size={15} /> Modifier ?
      </button>
      {showMenu && popupMenu}
    </div>
  );

  return (
    <div ref={containerRef} className="relative shrink-0">
      {hiddenInputs}
      <button type="button" onClick={() => setShowMenu(prev => !prev)}
        className="flex items-center gap-2 px-3 h-12 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition">
        <Camera size={15} /> Photo
      </button>
      {showMenu && popupMenu}
    </div>
  );
}

// Extrait le chemin relatif depuis une URL publique Supabase Storage
function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    const marker = '/object/public/photos-etats-des-lieux/';
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

export default function EdlForm() {
    const [step, setStep] = useState(1);
    const [rapportId, setRapportId] = useState<string | null>(null);
    // 'idle' = avant envoi, 'sending' = Edge Function en cours (ZIP + email),
    // 'success' = email envoyé, 'emailFailed' = ZIP ok mais email échoué, 'error' = erreur critique
    const [sendState, setSendState] = useState<'idle' | 'sending' | 'success' | 'emailFailed' | 'error'>('idle');
    const [sendError, setSendError] = useState<string | null>(null);
    // Modale "Je n'ai pas reçu le mail"
    const [resendModalOpen, setResendModalOpen] = useState(false);
    const [resendBailleurEmail, setResendBailleurEmail] = useState('');
    const [resendLocataireEmail, setResendLocataireEmail] = useState('');
    const [resendSent, setResendSent] = useState(false);
    const [isResending, setIsResending] = useState(false);
    // Clé de l'emplacement photo en cours d'upload (ex: 'c0', 'c1', 'p2', 'e1-0')
    const [uploadingKey, setUploadingKey] = useState<string | null>(null);
    // Modale revert photo (état qui redevient "non dégradé" alors qu'une photo existe)
    const [photoRevertModal, setPhotoRevertModal] = useState<{
      pIndex: number; eIndex: number; newEtat: string | null; elementId: string;
    } | null>(null);
    // IDs des éléments déjà alertés dans cette session (une seule alerte par élément)
    const [alertedPhotoElements, setAlertedPhotoElements] = useState<Set<string>>(new Set());
    // Modale non-conformité Alur avant étape 5
    const [showAlurModal, setShowAlurModal] = useState(false);

    // États pour stocker les aperçus des photos
    // const [elecPhoto, setElecPhoto] = useState<string | null>(null);
    // const [eauPhoto, setEauPhoto] = useState<string | null>(null);

    const [formData, setFormData] = useState({
      metadata: {
        type: "Entrée",
        date: new Date().toISOString().split('T')[0],
        adresse_bien: "",
        lieu_signature: "",
        isJeanbrun: false,
        cles: "",
        autres_acces: "",
        chauffage: "",
        cadastre: "",
        bailleur: { nom: "", adresse: "", email: "" },
        locataire: { nom: "", email: "" },
        mandataire: { nom: "", entreprise: "" } // Optionnel pour les agences
      },
      compteurs: [
        { type: "Électricité", index: "", photo_url: "", photo_hash: "" },
        { type: "Eau Froide", index: "", photo_url: "", photo_hash: "" }
      ],
      pieces: [] as any[],
      signatureBailleur: "",
      signatureLocataire: ""
    });

    const [currentRoom, setCurrentRoom] = useState({
        nom: "",
        elements: [
            { nom: "Murs", etat: "Bon état", observations: "" },
            { nom: "Sol", etat: "Bon état", observations: "" },
            { nom: "Plafond", etat: "Bon état", observations: "" }
        ]
    });

    const sigBailleur = useRef<any>(null);
    const sigLocataire = useRef<any>(null);

    // 1. FONCTION UNIVERSELLE D'UPLOAD (Côté Supabase)
    // Retourne { url, hash } où hash = SHA-256 hex du fichier compressé (même octets que dans le ZIP)
    const uploadToSupabase = async (file: File, folder: string): Promise<{ url: string; hash: string } | null> => {
      const options = {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: 'image/jpeg',   // force JPEG en sortie — WebP/HEIC/PNG normalisés
        initialQuality: 0.82,
      };

      try {
        const compressedFile = await imageCompression(file, options);

        // Hash SHA-256 du fichier compressé (avant upload)
        const arrayBuf = await compressedFile.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuf);
        const hash = Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        const fileName = `${Math.random()}.jpg`;   // toujours .jpg — cohérent avec fileType
        const filePath = `${folder}/${fileName}`;

        const { error } = await supabase.storage
          .from('photos-etats-des-lieux')
          .upload(filePath, compressedFile);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('photos-etats-des-lieux')
          .getPublicUrl(filePath);

        return { url: publicUrl, hash };
      } catch (error) {
        console.error("Erreur compression/upload:", error);
        return null;
      }
    };

    // 2. SAUVEGARDE DU RAPPORT — machine à états : draft → pdf_generated → email_sent
    const saveRapport = async (data: any) => {
      // Capturer le timestamp exact de clôture (heure de signature)
      const updatedData = {
        ...data,
        metadata: {
          ...data.metadata,
          datetime: new Date().toISOString(),
        },
      };

      try {
        // 1. INSERT brouillon en DB pour obtenir l'ID tôt
        const { data: insertData, error: insertError } = await supabase
          .from('rapports')
          .insert([{
            data: updatedData,
            client_email: updatedData.metadata.locataire.email,
            bailleur_email: updatedData.metadata.bailleur.email,
            adresse_bien: updatedData.metadata.adresse_bien,
            type_edl: updatedData.metadata.type,
            is_paid: false,
            status: 'draft' satisfies RapportStatus,
          }])
          .select('id')
          .single();

        if (insertError) throw new Error("Erreur BDD (draft): " + insertError.message);
        const id = insertData.id as string;
        setRapportId(id);

        // 2. GÉNÉRER LE PDF — première passe, avec rapport_id injecté dans les métadonnées
        console.log("Génération du PDF en cours...");
        const finalData = {
          ...updatedData,
          metadata: { ...updatedData.metadata, rapport_id: id },
        };
        const pdfBlob = await generateEDL_PDF(finalData);

        // 2b. Calculer le SHA-256 du PDF et l'injecter dans le pied de page
        const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
        const hashBuf = await crypto.subtle.digest('SHA-256', pdfBytes);
        const pdfHash = Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        const finalPdfBytes = await injectHashIntoPDF(pdfBytes, pdfHash);
        console.log(`PDF SHA-256 : ${pdfHash} — taille finale : ${finalPdfBytes.length} octets`);

        // 3. UPLOADER LE PDF (avec hash injecté)
        const fileName = `rapport_${id}.pdf`;
        const { error: storageError } = await supabase.storage
          .from('rapports-finaux')
          .upload(fileName, finalPdfBytes, { contentType: 'application/pdf', upsert: true });

        if (storageError) throw new Error("Erreur Storage: " + storageError.message);

        // 4. TRANSITION → pdf_generated
        const { error: updateError } = await supabase
          .from('rapports')
          .update({
            pdf_url: fileName,
            status: 'pdf_generated' satisfies RapportStatus,
          })
          .eq('id', id);

        if (updateError) throw new Error("Erreur mise à jour status: " + updateError.message);

        // 5. Passer en step 5 (écran de chargement) et appeler zip-and-send
        setStep(5);
        setSendState('sending');

        const functionsUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const efRes = await fetch(`${functionsUrl}/zip-and-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ rapportId: id }),
        });

        if (efRes.ok) {
          setSendState('success');
        } else {
          const body = await efRes.json().catch(() => ({})) as { error?: string; canRetry?: boolean };
          if (body.canRetry) {
            setSendState('emailFailed');
          } else {
            setSendState('error');
            setSendError(body.error ?? 'Erreur lors de la génération du dossier.');
          }
        }

      } catch (error: any) {
        console.error("Échec du processus :", error);
        setSendState('error');
        setSendError(error.message ?? 'Erreur inattendue.');
        setStep(5);
      }
    };

    // Crée une petite variable de validation pour Step 1
    const isStep1Valid = () => {
      const m = formData.metadata;
      const basicInfo = 
      m.adresse_bien.length > 5 && 
      m.bailleur.nom.length > 2 &&
      m.bailleur.email.includes('@') && 
      m.locataire.nom.length > 2 &&
      m.locataire.email.includes('@') &&
      m.cles && 
      m.chauffage;
      
      // Si c'est Jeanbrun, le cadastre est obligatoire. Sinon, non.
      if (m.isJeanbrun) {
        return basicInfo && m.cadastre.length > 0;
      }

      return basicInfo;
    };

      // Crée une petite variable de validation pour Step 2
    const isStep2Valid = () => {
      const m = formData.metadata;
      const basicInfo =
      m.adresse_bien.length > 5 &&
      m.bailleur.nom.length > 2 &&
      m.bailleur.email.includes('@') &&
      m.locataire.nom.length > 2 &&
      m.locataire.email.includes('@') &&
      m.cles &&
      m.chauffage;

      // Si c'est Jeanbrun, le cadastre est obligatoire. Sinon, non.
      if (m.isJeanbrun) {
        return basicInfo && m.cadastre.length > 0;
      }

      return basicInfo;
    };

    // ── Handlers Step 3 ──────────────────────────────────────────────────────

    const addOptionalElement = (pIndex: number, kind: ElementKind, label: string) => {
      const newEl: PieceElement = {
        id: crypto.randomUUID(),
        kind,
        label,
        obligatoire: false,
        etat: null,
        observations: '',
        meta: {},
      };
      const newPieces = [...formData.pieces];
      newPieces[pIndex] = {
        ...newPieces[pIndex],
        elements: [...newPieces[pIndex].elements, newEl],
      };
      setFormData({ ...formData, pieces: newPieces });
    };

    const deleteElement = (pIndex: number, eIndex: number) => {
      const newPieces = [...formData.pieces];
      newPieces[pIndex] = {
        ...newPieces[pIndex],
        elements: newPieces[pIndex].elements.filter((_: any, i: number) => i !== eIndex),
      };
      setFormData({ ...formData, pieces: newPieces });
    };

    // Badge affiché quand tous les éléments obligatoires ont un état renseigné
    const isAlurCompliant = () =>
      formData.pieces.length > 0 &&
      formData.pieces.every((piece: any) =>
        (piece.elements ?? [])
          .filter((el: any) => el.obligatoire)
          .every((el: any) => el.etat !== null && el.etat !== undefined)
      );

    // Liste des éléments obligatoires non renseignés (pour la modale d'avertissement)
    const getMissingAlurElements = (): Array<{ pieceName: string; elementLabel: string }> => {
      const missing: Array<{ pieceName: string; elementLabel: string }> = [];
      formData.pieces.forEach((piece: any) => {
        (piece.elements ?? []).forEach((el: any) => {
          if (el.obligatoire && (el.etat === null || el.etat === undefined)) {
            missing.push({ pieceName: piece.nom, elementLabel: el.label ?? el.nom ?? '?' });
          }
        });
      });
      return missing;
    };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
      {/* Progress Bar */}
      <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Étape {step} sur 5</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-1.5 w-7 rounded-full ${step >= i ? 'bg-blue-600' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* ÉTAPE 1 : INFOS LOGEMENT */}
        {step === 1 && (


          <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
  
            {/* Header */}
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2 mb-1">
                <MapPin className="text-blue-600" size={20} />
                Le Logement
              </h2>
              <p className="text-sm text-slate-500">Détails du bien concerné par l'état des lieux.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:gap-4">
              
              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Type d'acte</label>
                  <select 
                    className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 font-medium"
                    value={formData.metadata.type}
                    onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, type: e.target.value}})}
                  >
                    <option>Entrée</option>
                    <option>Sortie</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Date du constat</label>
                  <input 
                    type="date" 
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50"
                    value={formData.metadata.date}
                    onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, date: e.target.value}})}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Adresse du bien loué</label>
                <input
                  type="text"
                  placeholder="15 rue de Rivoli, 75001 Paris"
                  className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.metadata.adresse_bien}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, adresse_bien: e.target.value}})}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Lieu de signature</label>
                <input
                  type="text"
                  placeholder="15 rue de Rivoli, 75001 Paris"
                  className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.metadata.lieu_signature}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, lieu_signature: e.target.value}})}
                />
              </div>
            </div>

            <hr className="border-slate-100" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
                  <User size={16} className="text-blue-600" /> Bailleur
                </h3>
                <input 
                  type="text" placeholder="Nom complet / Raison sociale"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                  value={formData.metadata.bailleur.nom}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, bailleur: {...formData.metadata.bailleur, nom: e.target.value}}})}
                />
                <input 
                  type="email" placeholder="Email du Bailleur"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                  value={formData.metadata.bailleur.email}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, bailleur: {...formData.metadata.bailleur, email: e.target.value}}})}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
                  <User size={16} className="text-blue-600" /> Locataire
                </h3>
                <input 
                  type="text" placeholder="Nom et Prénom"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                  value={formData.metadata.locataire.nom}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, locataire: {...formData.metadata.locataire, nom: e.target.value}}})}
                />
                <input 
                  type="email" placeholder="Email du Locataire"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                  value={formData.metadata.locataire.email}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, locataire: {...formData.metadata.locataire, email: e.target.value}}})}
                />
              </div>
            </div>

            <div className="p-3 md:p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 md:space-y-4">
  
              <div className="flex items-center justify-between">
                <label className="font-bold text-sm md:text-base text-slate-700">
                  Dispositif Jeanbrun 2026 ?
                </label>
                <input 
                  type="checkbox" 
                  className="w-6 h-6 accent-blue-600"
                  checked={formData.metadata.isJeanbrun}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, isJeanbrun: e.target.checked}})}
                />
              </div>

              <div className="grid grid-cols-1 min-[450px]:grid-cols-[1fr_2fr] gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase text-slate-400">Nombre de clés</label>
                  <input
                    type="number" placeholder="0"
                    className="w-full p-2.5 rounded-xl border border-white bg-white shadow-sm"
                    value={formData.metadata.cles}
                    onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, cles: e.target.value}})}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase text-slate-400">Type de chauffage</label>
                  <select
                    className="w-full p-3 rounded-xl border border-white bg-white shadow-sm"
                    value={formData.metadata.chauffage}
                    onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, chauffage: e.target.value}})}
                  >
                    <option value="">Chauffage...</option>
                    <option>Individuel Élec</option>
                    <option>Individuel Gaz</option>
                    <option>Collectif</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold uppercase text-slate-400">Autres accès remis</label>
                <input
                  type="text"
                  placeholder="1 clé boîte aux lettres, 1 badge immeuble, 1 bip garage"
                  className="w-full p-2.5 md:p-3 rounded-xl border border-white bg-white shadow-sm text-sm"
                  value={formData.metadata.autres_acces}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, autres_acces: e.target.value}})}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className={`text-xs font-bold uppercase ${formData.metadata.isJeanbrun ? 'text-orange-500' : 'text-slate-400'}`}>
                  Réf. Cadastrale {formData.metadata.isJeanbrun ? '(Obligatoire)' : '(Optionnel)'}
                </label>
                <input 
                  type="text" 
                  placeholder={formData.metadata.isJeanbrun ? "Ex: 000 AB 121" : "Ex: 000 AB 121"}
                  className={`w-full p-2.5 md:p-3 rounded-xl border ${formData.metadata.isJeanbrun ? 'border-orange-300 bg-orange-50' : 'border-white bg-white'}`}
                  value={formData.metadata.cadastre}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, cadastre: e.target.value}})}
                />
              </div>

            </div>

            <button 
              onClick={() => setStep(2)}
              disabled={!isStep1Valid()}
              className="w-full bg-blue-600 text-white py-3.5 md:py-4 rounded-2xl font-bold disabled:bg-slate-200 text-sm md:text-base"
            >
              Étape suivante
            </button>

          </div>
        )}

        {/* ÉTAPE 2 : COMPTEURS */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <h2 className="text-lg md:text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Calendar className="text-blue-600" size={20} />
              Relevé des Compteurs
            </h2>

            {/* --- COMPTEUR ÉLEC --- */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-50 p-2 rounded-full text-xl">💡</div>
                  <p className="text-sm font-bold text-slate-900">Électricité</p>
                </div>
                {!formData.compteurs[0].index && <span className="text-[10px] text-red-500 font-bold uppercase">Requis</span>}
              </div>
              
              <div className="flex gap-2 min-w-0">
                <input
                  type="number" placeholder="En kWh"
                  className="flex-1 min-w-0 p-3 rounded-xl border border-slate-300 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={formData.compteurs[0].index}
                  onChange={(e) => {
                    const newCompteurs = [...formData.compteurs];
                    newCompteurs[0].index = e.target.value;
                    setFormData({...formData, compteurs: newCompteurs});
                  }}
                />
                <PhotoSelector
                  hasPhoto={!!formData.compteurs[0].photo_url}
                  isUploading={uploadingKey === 'c0'}
                  onPhotoSelected={async (file) => {
                    setUploadingKey('c0');
                    const result = await uploadToSupabase(file, "compteurs");
                    if (result) {
                      const newCompteurs = [...formData.compteurs];
                      newCompteurs[0] = { ...newCompteurs[0], photo_url: result.url, photo_hash: result.hash };
                      setFormData({...formData, compteurs: newCompteurs});
                    }
                    setUploadingKey(null);
                  }}
                />
              </div>

              {/* Preview Élec */}
              {formData.compteurs[0].photo_url && (
                <img src={formData.compteurs[0].photo_url} className="mt-3 w-full h-32 object-cover rounded-xl border border-slate-100 animate-in zoom-in-95" alt="Preview Elec" />
              )}
            </div>

            {/* --- COMPTEUR EAU --- */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="bg-cyan-50 p-2 rounded-full text-xl">💧</div>
                  <p className="text-sm font-bold text-slate-900">Eau Froide</p>
                </div>
                {!formData.compteurs[1].index && <span className="text-[10px] text-red-500 font-bold uppercase">Requis</span>}
              </div>

              <div className="flex gap-2 min-w-0">
                <input
                  type="number" placeholder="En m³"
                  className="flex-1 min-w-0 p-3 rounded-xl border border-slate-300 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={formData.compteurs[1].index}
                  onChange={(e) => {
                    const newCompteurs = [...formData.compteurs];
                    newCompteurs[1].index = e.target.value;
                    setFormData({...formData, compteurs: newCompteurs});
                  }}
                />
                <PhotoSelector
                  hasPhoto={!!formData.compteurs[1].photo_url}
                  isUploading={uploadingKey === 'c1'}
                  onPhotoSelected={async (file) => {
                    setUploadingKey('c1');
                    const result = await uploadToSupabase(file, "compteurs");
                    if (result) {
                      const newCompteurs = [...formData.compteurs];
                      newCompteurs[1] = { ...newCompteurs[1], photo_url: result.url, photo_hash: result.hash };
                      setFormData({...formData, compteurs: newCompteurs});
                    }
                    setUploadingKey(null);
                  }}
                />
              </div>

              {/* Preview Eau */}
              {formData.compteurs[1].photo_url && (
                <img src={formData.compteurs[1].photo_url} className="mt-3 w-full h-32 object-cover rounded-xl border border-slate-100 animate-in zoom-in-95" alt="Preview Eau" />
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-4 pt-6">
              <button onClick={() => setStep(1)} className="flex-1 py-4 text-slate-500 font-medium hover:bg-slate-50 rounded-xl transition">
                Retour
              </button>
              <button 
                onClick={() => setStep(3)} 
                disabled={!formData.compteurs[0].index || !formData.compteurs[1].index}
                className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition disabled:bg-slate-200 disabled:shadow-none"
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
            <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-right-4">

              {/* Header */}
              <div className="flex items-center gap-2">
                <User className="text-blue-600 shrink-0" size={20} />
                <h2 className="text-lg md:text-xl font-semibold text-slate-800">Détail des Pièces</h2>
              </div>

              <div className="space-y-4">
                {formData.pieces.map((piece: any, pIndex: number) => (
                  <div key={pIndex} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    
                    {/* Header pièce — nom + icônes compactes */}
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <span className="font-bold text-slate-800 uppercase text-sm tracking-wide">{piece.nom}</span>
                      <div className="flex items-center gap-2">
                        <PhotoSelector
                          compact
                          hasPhoto={!!piece.photo_url}
                          isUploading={uploadingKey === `p${pIndex}`}
                          onPhotoSelected={async (file) => {
                            setUploadingKey(`p${pIndex}`);
                            const result = await uploadToSupabase(file, "pieces");
                            if (result) {
                              const newPieces = [...formData.pieces];
                              newPieces[pIndex] = { ...newPieces[pIndex], photo_url: result.url, photo_hash: result.hash };
                              setFormData({...formData, pieces: newPieces});
                            }
                            setUploadingKey(null);
                          }}
                        />
                        {/* Bouton supprimer — icône seule */}
                        <button
                          onClick={() => {
                            const newPieces = formData.pieces.filter((_, i) => i !== pIndex);
                            setFormData({...formData, pieces: newPieces});
                          }}
                          className="w-9 h-9 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Éléments */}
                    <div className="p-3 md:p-4 space-y-3">
                      {piece.elements.map((el: any, eIndex: number) => (
                        <div key={el.id ?? eIndex} className="py-3 border-b border-slate-50 last:border-0">

                          {/* Label éditable + icône obligatoire/suppression + photo conditionnelle */}
                          <div className="flex items-center gap-1.5 mb-2">
                            <input
                              type="text"
                              value={el.label ?? el.nom ?? ''}
                              onChange={(e) => {
                                const newPieces = [...formData.pieces];
                                newPieces[pIndex].elements[eIndex] = {
                                  ...newPieces[pIndex].elements[eIndex],
                                  label: e.target.value,
                                };
                                setFormData({ ...formData, pieces: newPieces });
                              }}
                              placeholder="Nom de l'élément"
                              className="font-bold text-slate-700 text-sm flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none pb-px rounded-none"
                            />
                            {el.obligatoire ? (
                              <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                                <Lock size={10} /> Alur
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => deleteElement(pIndex, eIndex)}
                                className="w-6 h-6 flex items-center justify-center rounded text-red-300 hover:bg-red-50 hover:text-red-500 transition shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                            {['moyen', 'mauvais', 'hs'].includes(el.etat) && (
                              <PhotoSelector
                                compact
                                hasPhoto={!!el.photo_url}
                                isUploading={uploadingKey === `e${pIndex}-${eIndex}`}
                                onPhotoSelected={async (file) => {
                                  setUploadingKey(`e${pIndex}-${eIndex}`);
                                  const result = await uploadToSupabase(file, "degats");
                                  if (result) {
                                    const newPieces = [...formData.pieces];
                                    newPieces[pIndex].elements[eIndex] = {
                                      ...newPieces[pIndex].elements[eIndex],
                                      photo_url: result.url,
                                      photo_hash: result.hash,
                                    };
                                    setFormData({ ...formData, pieces: newPieces });
                                  }
                                  setUploadingKey(null);
                                }}
                                onPhotoDeleted={() => {
                                  const newPieces = [...formData.pieces];
                                  newPieces[pIndex].elements[eIndex] = {
                                    ...newPieces[pIndex].elements[eIndex],
                                    photo_url: undefined,
                                    photo_hash: undefined,
                                  };
                                  setFormData({ ...formData, pieces: newPieces });
                                }}
                              />
                            )}
                          </div>

                          {/* État + observations — empilés sur très petit écran */}
                          <div className="flex flex-col min-[550px]:flex-row gap-1.5">
                            <select
                              className={`w-full min-[350px]:w-[45%] shrink-0 p-2 rounded-lg border text-xs ${
                                !el.etat
                                  ? el.obligatoire
                                    ? 'border-red-400 bg-red-50'
                                    : 'border-orange-400 bg-orange-50'
                                  : 'border-slate-200 bg-white'
                              }`}
                              value={el.etat ?? ''}
                              onChange={(e) => {
                                const newEtat = e.target.value || null;
                                const currentEl = formData.pieces[pIndex].elements[eIndex];
                                const hasPhoto = !!currentEl.photo_url;
                                const notDegraded = newEtat && !['moyen', 'mauvais', 'hs'].includes(newEtat);
                                const alreadyAlerted = alertedPhotoElements.has(currentEl.id);
                                if (hasPhoto && notDegraded && !alreadyAlerted) {
                                  setPhotoRevertModal({ pIndex, eIndex, newEtat, elementId: currentEl.id });
                                  return;
                                }
                                const newPieces = [...formData.pieces];
                                newPieces[pIndex].elements[eIndex] = {
                                  ...newPieces[pIndex].elements[eIndex],
                                  etat: newEtat,
                                };
                                setFormData({ ...formData, pieces: newPieces });
                              }}
                            >
                              <option value="">À évaluer</option>
                              <option value="neuf">{ETAT_LABELS.neuf}</option>
                              <option value="tres_bon">{ETAT_LABELS.tres_bon}</option>
                              <option value="bon">{ETAT_LABELS.bon}</option>
                              <option value="moyen">{ETAT_LABELS.moyen}</option>
                              <option value="mauvais">{ETAT_LABELS.mauvais}</option>
                              <option value="hs">{ETAT_LABELS.hs}</option>
                            </select>
                            <input
                              type="text" placeholder="Note (ex: tache, rayure...)"
                              className="flex-1 min-w-0 p-2 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                              value={el.observations}
                              onChange={(e) => {
                                const newPieces = [...formData.pieces];
                                newPieces[pIndex].elements[eIndex] = {
                                  ...newPieces[pIndex].elements[eIndex],
                                  observations: e.target.value,
                                };
                                setFormData({ ...formData, pieces: newPieces });
                              }}
                            />
                          </div>

                        </div>
                      ))}
                    </div>

                    {/* + Ajouter un équipement optionnel */}
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                      <AddEquipmentRow onAdd={(kind, label) => addOptionalElement(pIndex, kind, label)} />
                    </div>

                  </div>
                ))}
              </div>

              {/* Badge Alur */}
              {isAlurCompliant() && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs font-bold">
                  ✓ Conforme Loi Alur - tous les éléments obligatoires sont renseignés
                </div>
              )}

              {/* Section ajout pièce */}
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <div className="flex gap-2">
                  <select id="select-room" className="flex-1 min-w-0 p-3 rounded-lg border border-slate-300 bg-white text-sm">
                    {["Cuisine", "Salon", "Chambre 1", "Chambre 2", "SDB", "Entrée", "Balcon"]
                      .filter(name => !formData.pieces.some((p: any) => p.nom === name))
                      .map(name => <option key={name}>{name}</option>)
                    }
                  </select>
                  <button
                    onClick={() => {
                      const select = document.getElementById('select-room') as HTMLSelectElement;
                      if (!select.value) return;
                      const nom = select.value;
                      const kind = getPieceKind(nom);
                      const templates = pieceTemplates[kind] ?? pieceTemplates.autre;
                      const newRoom = {
                        id: crypto.randomUUID(),
                        kind,
                        nom,
                        photo_url: undefined,
                        photo_hash: undefined,
                        elements: templates.map(makeElement),
                      };
                      setFormData({ ...formData, pieces: [...formData.pieces, newRoom] });
                    }}
                    className="shrink-0 bg-slate-900 text-white px-5 py-3 rounded-lg font-bold text-sm hover:bg-slate-800 transition"
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(2)}
                  className="flex-1 py-3.5 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition text-sm">
                  Retour
                </button>
                <button
                  onClick={() => {
                    if (formData.pieces.length > 0 && !isAlurCompliant()) {
                      setShowAlurModal(true);
                    } else {
                      setStep(4);
                    }
                  }}
                  disabled={formData.pieces.length === 0}
                  className={`flex-[2] py-3.5 rounded-xl font-bold text-sm transition ${
                    formData.pieces.length > 0 ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  Étape finale : Signature
                </button>
              </div>

            </div>
            )}
            {step === 4 && (
              <div className="space-y-8 animate-in fade-in">
                <h2 className="text-xl font-bold text-slate-800 text-center">Signatures Contradictoires</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Signature Bailleur */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-400">Signature du Bailleur</label>
                    <div className="border-2 border-slate-200 rounded-xl bg-white overflow-hidden">
                      <SignatureCanvas ref={sigBailleur} canvasProps={{width: 340, height: 160, style: {maxWidth: '100%'}}} />
                    </div>
                    <button onClick={() => sigBailleur.current.clear()} className="text-[10px] text-slate-400 uppercase">Effacer</button>
                  </div>

                  {/* Signature Locataire */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-400">Signature du Locataire</label>
                    <div className="border-2 border-slate-200 rounded-xl bg-white overflow-hidden">
                      <SignatureCanvas ref={sigLocataire} canvasProps={{width: 340, height: 160, style: {maxWidth: '100%'}}} />
                    </div>
                    <button onClick={() => sigLocataire.current.clear()} className="text-[10px] text-slate-400 uppercase">Effacer</button>
                  </div>
                </div>

                <button onClick={() => setStep(3)} className="w-full bg-red-600 text-white py-4 rounded-2xl font-extrabold shadow-lg hover:bg-red-700 transition">Retour</button>

                <button 
                  onClick={async () => {
                    if (sigBailleur.current.isEmpty() || sigLocataire.current.isEmpty()) {
                      alert("Les deux parties doivent signer.");
                      return;
                    }
                    setSendState('sending');   // désactive le bouton immédiatement

                    // 1. On capture les signatures à l'instant T
                    const signB = sigBailleur.current.getCanvas().toDataURL('image/png');
                    const signL = sigLocataire.current.getCanvas().toDataURL('image/png');

                    // 2. On crée l'objet final complet
                    const finalData = {
                      ...formData,
                      signatureBailleur: signB,
                      signatureLocataire: signL
                    };

                    // 3. On met à jour le state (pour l'affichage) 
                    setFormData(finalData);

                    // 4. On ENVOIE cet objet précis à la fonction de sauvegarde
                    saveRapport(finalData); 
                  }}

                  disabled={sendState !== 'idle'}
                  className="w-full bg-green-600 text-white py-4 rounded-2xl font-extrabold shadow-lg hover:bg-green-700 transition disabled:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {sendState === 'sending' ? 'Génération en cours…' : 'Clôturer l\'État des Lieux'}
                </button>
              </div>
            )}

            {step === 5 && (
              <div className="animate-in zoom-in duration-500">

                {/* État : envoi en cours */}
                {sendState === 'sending' && (
                  <div className="py-16 text-center space-y-6">
                    <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Génération du dossier en cours…</h2>
                      <p className="text-slate-500 text-sm mt-2">Compression des photos, création du ZIP et envoi des emails.<br />Cela peut prendre 30 à 60 secondes.</p>
                    </div>
                    <p className="text-xs text-slate-400">Vous pouvez fermer cet onglet — vous recevrez votre email dans quelques instants.</p>
                  </div>
                )}

                {/* État : succès — email envoyé */}
                {sendState === 'success' && (
                  <div className="py-8 space-y-6">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">✓</div>
                      <h2 className="text-2xl font-bold text-slate-900">Votre état des lieux a été envoyé</h2>
                      <p className="text-slate-500 text-sm mt-1">{formData.metadata.adresse_bien} · {formData.metadata.type}</p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 space-y-1">
                      <p className="font-semibold">Le PDF et les photos ont été envoyés à :</p>
                      <p>— {formData.metadata.bailleur.email}</p>
                      <p>— {formData.metadata.locataire.email}</p>
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-800">
                      Les photos seront automatiquement supprimées dans 48h, conformément à notre politique Zéro Déchet. Le PDF reste votre document légal de référence.
                    </div>

                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => {
                          setResendBailleurEmail(formData.metadata.bailleur.email);
                          setResendLocataireEmail(formData.metadata.locataire.email);
                          setResendModalOpen(true);
                        }}
                        className="w-full border border-slate-300 text-slate-700 py-3 rounded-2xl font-semibold hover:bg-slate-50 transition"
                      >
                        Je n'ai pas reçu le mail
                      </button>
                      <button onClick={() => window.location.reload()} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition">
                        Créer un nouveau rapport
                      </button>
                    </div>
                  </div>
                )}

                {/* État : ZIP ok mais email échoué — proposer retry */}
                {sendState === 'emailFailed' && (
                  <div className="py-8 space-y-6">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">!</div>
                      <h2 className="text-xl font-bold text-slate-900">Dossier prêt, email non envoyé</h2>
                      <p className="text-slate-500 text-sm mt-1">Le dossier ZIP a été créé mais l'envoi de l'email a échoué.</p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={async () => {
                          setSendState('sending');
                          try {
                            const res = await fetch('/api/resend-mail', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ rapportId }),
                            });
                            if (res.ok) setSendState('success');
                            else setSendState('emailFailed');
                          } catch {
                            setSendState('emailFailed');
                          }
                        }}
                        className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition"
                      >
                        Réessayer l'envoi
                      </button>
                      <button onClick={() => window.location.reload()} className="w-full border border-slate-300 text-slate-700 py-3 rounded-2xl font-semibold hover:bg-slate-50 transition">
                        Créer un nouveau rapport
                      </button>
                    </div>
                  </div>
                )}

                {/* État : erreur critique */}
                {sendState === 'error' && (
                  <div className="py-8 space-y-6 text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-3xl">✕</div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Une erreur est survenue</h2>
                      {sendError && <p className="text-slate-500 text-sm mt-2">{sendError}</p>}
                    </div>
                    <button onClick={() => window.location.reload()} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">
                      Recommencer
                    </button>
                  </div>
                )}

                {/* Modale "Je n'ai pas reçu le mail" */}
                {resendModalOpen && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in zoom-in-95">
                      {resendSent ? (
                        <>
                          <div className="text-center py-4">
                            <div className="text-4xl mb-3">✓</div>
                            <h3 className="text-lg font-bold text-slate-900">Email renvoyé</h3>
                            <p className="text-slate-500 text-sm mt-1">Vérifiez vos boîtes de réception.</p>
                          </div>
                          <button onClick={() => { setResendModalOpen(false); setResendSent(false); }} className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold">
                            Fermer
                          </button>
                        </>
                      ) : (
                        <>
                          <h3 className="text-lg font-bold text-slate-900">Renvoyer les emails</h3>
                          <p className="text-slate-500 text-sm">Vérifiez ou corrigez les adresses avant de renvoyer.</p>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-bold uppercase text-slate-400 mb-1 block">Email Bailleur</label>
                              <input
                                type="email"
                                className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                                value={resendBailleurEmail}
                                onChange={(e) => setResendBailleurEmail(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-bold uppercase text-slate-400 mb-1 block">Email Locataire</label>
                              <input
                                type="email"
                                className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                                value={resendLocataireEmail}
                                onChange={(e) => setResendLocataireEmail(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex gap-3 pt-2">
                            <button onClick={() => setResendModalOpen(false)} className="flex-1 py-3 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition">
                              Annuler
                            </button>
                            <button
                              disabled={isResending}
                              onClick={async () => {
                                setIsResending(true);
                                try {
                                  const res = await fetch('/api/resend-mail', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      rapportId,
                                      bailleurEmail: resendBailleurEmail,
                                      locataireEmail: resendLocataireEmail,
                                    }),
                                  });
                                  if (res.ok) setResendSent(true);
                                  else if (res.status === 429) alert('Veuillez patienter avant de renvoyer.');
                                  else alert('Erreur lors du renvoi. Réessayez.');
                                } catch {
                                  alert('Erreur réseau. Réessayez.');
                                } finally {
                                  setIsResending(false);
                                }
                              }}
                              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition disabled:bg-slate-400 disabled:cursor-not-allowed"
                            >
                              {isResending ? 'Envoi en cours…' : 'Renvoyer'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
      </div>

      {/* ── Modale : photo revert (état redevient non-dégradé alors qu'une photo existe) ── */}
      {photoRevertModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">L&apos;élément n&apos;est plus dégradé</h3>
            <p className="text-xs text-slate-500">
              Une photo avait été prise pour cet élément. Est-elle toujours pertinente ?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // Garder la photo — on met juste à jour l'état
                  const newPieces = [...formData.pieces];
                  newPieces[photoRevertModal.pIndex].elements[photoRevertModal.eIndex] = {
                    ...newPieces[photoRevertModal.pIndex].elements[photoRevertModal.eIndex],
                    etat: photoRevertModal.newEtat,
                  };
                  setFormData({ ...formData, pieces: newPieces });
                  setAlertedPhotoElements(prev => new Set(prev).add(photoRevertModal.elementId));
                  setPhotoRevertModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 transition"
              >
                Garder
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = formData.pieces[photoRevertModal.pIndex].elements[photoRevertModal.eIndex];
                  // Purge bucket — fire & forget, ne bloque pas l'UX
                  if (el.photo_url) {
                    const path = extractStoragePath(el.photo_url);
                    if (path) {
                      supabase.storage.from('photos-etats-des-lieux').remove([path])
                        .then(({ error }) => { if (error) console.warn('Photo cleanup failed:', error.message); });
                    }
                  }
                  const newPieces = [...formData.pieces];
                  newPieces[photoRevertModal.pIndex].elements[photoRevertModal.eIndex] = {
                    ...newPieces[photoRevertModal.pIndex].elements[photoRevertModal.eIndex],
                    etat: photoRevertModal.newEtat,
                    photo_url: undefined,
                    photo_hash: undefined,
                  };
                  setFormData({ ...formData, pieces: newPieces });
                  setAlertedPhotoElements(prev => new Set(prev).add(photoRevertModal.elementId));
                  setPhotoRevertModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale : non-conformité Alur avant étape 5 ── */}
      {showAlurModal && (() => {
        const missing = getMissingAlurElements();
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center shrink-0 text-lg">⚠️</div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">EDL non conforme Loi Alur</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {missing.length} élément{missing.length > 1 ? 's' : ''} obligatoire{missing.length > 1 ? 's' : ''} non renseigné{missing.length > 1 ? 's' : ''} :
                  </p>
                </div>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {missing.map((m, i) => (
                  <li key={i} className="text-xs text-slate-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                    <span className="font-medium">{m.pieceName}</span> — {m.elementLabel}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                Un EDL non-conforme peut être contesté en justice.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAlurModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 transition"
                >
                  ← Corriger
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAlurModal(false); setStep(4); }}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition"
                >
                  Continuer quand même
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}