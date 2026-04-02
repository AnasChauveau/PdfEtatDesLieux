"use client";

import { useState } from "react";
import { User, MapPin, Calendar, ArrowRight, Camera, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import imageCompression from 'browser-image-compression';

export default function EdlForm() {
    const [step, setStep] = useState(1);
  
    // États pour stocker les aperçus des photos
    const [elecPhoto, setElecPhoto] = useState<string | null>(null);
    const [eauPhoto, setEauPhoto] = useState<string | null>(null);

    const [formData, setFormData] = useState({
      metadata: {
        type: "Entrée",
        date: new Date().toISOString().split('T')[0],
        adresse_bien: "",
        bailleur: { nom: "", adresse: "", email: "" },
        locataire: { nom: "", email: "" },
        mandataire: { nom: "", entreprise: "" } // Optionnel pour les agences
      },
      compteurs: [
        { type: "Électricité", index: "", photo_url: "" },
        { type: "Eau Froide", index: "", photo_url: "" }
      ],
      pieces: []
    });

    const [currentRoom, setCurrentRoom] = useState({
        nom: "",
        elements: [
            { nom: "Murs", etat: "Bon état", observations: "" },
            { nom: "Sol", etat: "Bon état", observations: "" },
            { nom: "Plafond", etat: "Bon état", observations: "" }
        ]
    });

    // 1. FONCTION UNIVERSELLE D'UPLOAD (Côté Supabase)
    const uploadToSupabase = async (file: File, folder: string) => {
      // A. Options de compression
      const options = {
        maxSizeMB: 0.2,          // Max 200 Ko
        maxWidthOrHeight: 1280, // Résolution largement suffisante pour du PDF
        useWebWorker: true
      };

      try {
        // B. Compression
        const compressedFile = await imageCompression(file, options);
        
        // C. Upload du fichier compressé
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${folder}/${fileName}`;

        const { error } = await supabase.storage
          .from('photos-etats-des-lieux')
          .upload(filePath, compressedFile);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('photos-etats-des-lieux')
          .getPublicUrl(filePath);

        return publicUrl;
      } catch (error) {
        console.error("Erreur compression/upload:", error);
        return null;
      }
    };

    // 2. GESTIONNAIRE PHOTO ÉLECTRICITÉ
    const handlePhotoElec = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
        const url = await uploadToSupabase(file, "compteurs");
        setElecPhoto(url); // Pour l'affichage immédiat
        // Mise à jour du gros JSON
        setFormData(prev => ({
            ...prev,
            compteurs: prev.compteurs.map(c => c.type === "Électricité" ? { ...c, photo_url: url } : c)
        }));
        } catch (err) {
        alert("Erreur upload électricité");
        }
    };

    // 3. GESTIONNAIRE PHOTO EAU
    const handlePhotoEau = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
        const url = await uploadToSupabase(file, "compteurs");
        setEauPhoto(url); // Pour l'affichage immédiat
        setFormData(prev => ({
            ...prev,
            compteurs: prev.compteurs.map(c => c.type === "Eau Froide" ? { ...c, photo_url: url } : c)
        }));
        } catch (err) {
        alert("Erreur upload eau");
        }
    };

    // 4. GESTIONNAIRE DE SAUVEGARDE DU RAPPORT
    const saveRapport = async () => {
      const { data, error } = await supabase
        .from('rapports')
        .insert([
          { 
            data: formData, // On envoie tout l'objet JSON d'un coup !
            client_email: formData.metadata.locataire.email,
            adresse_bien: formData.metadata.adresse_bien,
            type_edl: formData.metadata.type,
            is_paid: false 
          }
        ])
        .select();

      if (error) {
        console.error("Erreur enregistrement:", error);
        alert("Erreur lors de la sauvegarde.");
      } else {
        alert("Félicitations ! État des lieux enregistré avec succès.");
        console.log("Rapport créé:", data);
        setStep(5); // Étape de succès
      }
    };

    // Crée une petite variable de validation pour y voir clair
    const isStep1Valid = 
    formData.metadata.adresse_bien.length > 5 && 
    formData.metadata.bailleur.nom.length > 2 &&
    formData.metadata.bailleur.email.includes('@') && 
    formData.metadata.locataire.nom.length > 2 &&
    formData.metadata.locataire.email.includes('@');

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
      {/* Progress Bar */}
      <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Étape {step} sur 4</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-1.5 w-8 rounded-full ${step >= i ? 'bg-blue-600' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* ÉTAPE 1 : INFOS LOGEMENT */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-1">
                <MapPin className="text-blue-600" size={24} />
                Le Logement
              </h2>
              <p className="text-sm text-slate-500">Détails du bien concerné par l'état des lieux.</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50"
                    value={formData.metadata.date}
                    onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, date: e.target.value}})}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Adresse du bien loué</label>
                <input 
                  type="text" 
                  placeholder="Ex: 15 rue de Rivoli, 75001 Paris"
                  className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.metadata.adresse_bien}
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, adresse_bien: e.target.value}})}
                />
              </div>
            </div>

            <hr className="border-slate-100" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Bloc Bailleur */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
                  <User size={16} className="text-blue-600" /> Bailleur
                </h3>
                <input 
                  type="text" placeholder="Nom complet / Raison sociale"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, bailleur: {...formData.metadata.bailleur, nom: e.target.value}}})}
                />
                <input 
                  type="email" placeholder="Email du Bailleur"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, bailleur: {...formData.metadata.bailleur, email: e.target.value}}})}
                />
              </div>

              {/* Bloc Locataire */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
                  <User size={16} className="text-blue-600" /> Locataire
                </h3>
                <input 
                  type="text" placeholder="Nom et Prénom"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, locataire: {...formData.metadata.locataire, nom: e.target.value}}})}
                />
                <input 
                  type="email" placeholder="Email du Locataire"
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm"
                  onChange={(e) => setFormData({...formData, metadata: {...formData.metadata, locataire: {...formData.metadata.locataire, email: e.target.value}}})}
                />
              </div>
            </div>

            <button 
              onClick={() => setStep(2)}
              disabled={!isStep1Valid}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-extrabold flex items-center justify-center gap-2 hover:bg-blue-700 transition shadow-lg shadow-blue-100 disabled:bg-slate-200 disabled:shadow-none disabled:cursor-not-allowed"
            >
              Commencer le relevé
              <ArrowRight size={20} />
            </button>
          </div>
        )}

        {/* ÉTAPE 2 : COMPTEURS */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Calendar className="text-blue-600" size={24} />
              Relevé des Compteurs
            </h2>

            {/* Compteur Élec */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 mb-3">
                <div className="bg-blue-50 p-2 rounded-full">💡</div>
                <p className="text-sm font-bold text-slate-900">Électricité</p>
              </div>
              <div className="flex gap-2">
                <input 
                  type="number" placeholder="Index kWh" 
                  className="flex-1 p-3 rounded-lg border border-slate-300 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className={`p-3 rounded-lg cursor-pointer transition flex items-center gap-2 ${elecPhoto ? 'bg-green-600 text-white' : 'bg-slate-900 text-white'}`}>
                   {elecPhoto ? <CheckCircle2 size={20} /> : <Camera size={20} />}
                   <input type="file" className="hidden" onChange={handlePhotoElec} accept="image/*" />
                </label>
              </div>
              {elecPhoto && <img src={elecPhoto} className="mt-3 w-full h-32 object-cover rounded-lg border border-slate-200" alt="Preview Elec" />}
            </div>

            {/* Compteur Eau */}
            <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 mb-3">
                <div className="bg-cyan-50 p-2 rounded-full">💧</div>
                <p className="text-sm font-bold text-slate-900">Eau Froide</p>
              </div>
              <div className="flex gap-2">
                <input 
                  type="number" placeholder="Index m³" 
                  className="flex-1 p-3 rounded-lg border border-slate-300 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className={`p-3 rounded-lg cursor-pointer transition flex items-center gap-2 ${eauPhoto ? 'bg-green-600 text-white' : 'bg-slate-900 text-white'}`}>
                   {eauPhoto ? <CheckCircle2 size={20} /> : <Camera size={20} />}
                   <input type="file" className="hidden" onChange={handlePhotoEau} accept="image/*" />
                </label>
              </div>
              {eauPhoto && <img src={eauPhoto} className="mt-3 w-full h-32 object-cover rounded-lg border border-slate-200" alt="Preview Eau" />}
            </div>

            <div className="flex gap-4 pt-6">
              <button onClick={() => setStep(1)} className="flex-1 py-3 text-slate-600 font-medium">Retour</button>
              <button onClick={() => setStep(3)} className="flex-[2] bg-blue-600 text-white py-3 rounded-xl font-bold">Suivant</button>
            </div>
          </div>
        )}

        {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                <User className="text-blue-600" size={24} />
                Détail des Pièces
                </h2>

                {/* Liste des pièces avec accordéon pour les détails */}
                <div className="space-y-4">
                {formData.pieces.map((piece: any, pIndex: number) => (
                    <div key={pIndex} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                        <span className="font-bold text-slate-800 uppercase text-sm tracking-wide">{piece.nom}</span>
                        <label className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition ${piece.photo_url ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white'}`}>
                        <Camera size={14} />
                        {piece.photo_url ? "Photo OK" : "Photo Pièce"}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const url = await uploadToSupabase(file, "pieces");
                            const newPieces = [...formData.pieces];
                            newPieces[pIndex].photo_url = url; // On ajoute l'URL à la pièce
                            setFormData({...formData, pieces: newPieces});
                          }} 
                        />
                      </label>
                        <button 
                        onClick={() => {
                            const newPieces = formData.pieces.filter((_, i) => i !== pIndex);
                            setFormData({...formData, pieces: newPieces});
                        }}
                        className="text-red-500 text-xs font-medium hover:underline"
                        >
                        Supprimer la pièce
                        </button>
                    </div>
                    
                    <div className="p-4 space-y-6">
                        {piece.elements.map((el: any, eIndex: number) => (
                          <div key={eIndex} className="py-4 border-b border-slate-50 last:border-0">
                            <div className="flex justify-between items-center mb-2">
                              <p className="font-bold text-slate-700 text-sm">{el.nom}</p>
                              
                              {/* Bouton Photo de dégradation - Apparaît si l'état est moyen ou mauvais */}
                              {el.etat !== "Très bon état" && (
                                <label className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition ${el.photo_url ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                  <Camera size={12} />
                                  {el.photo_url ? "Photo Preuve OK" : "Ajouter preuve"}
                                  <input 
                                    type="file" className="hidden" accept="image/*" 
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const url = await uploadToSupabase(file, "degats");
                                      const newPieces = [...formData.pieces];
                                      newPieces[pIndex].elements[eIndex].photo_url = url;
                                      setFormData({...formData, pieces: newPieces});
                                    }} 
                                  />
                                </label>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <select 
                                className="p-2 rounded-lg border border-slate-200 bg-white text-xs"
                                value={el.etat}
                                onChange={(e) => {
                                  const newPieces = [...formData.pieces];
                                  newPieces[pIndex].elements[eIndex].etat = e.target.value;
                                  setFormData({...formData, pieces: newPieces});
                                }}
                              >
                                <option>Très bon état</option>
                                <option>Bon état</option>
                                <option>État d'usage</option>
                                <option>Mauvais état</option>
                              </select>
                              <input 
                                type="text" placeholder="Note (ex: tache, rayure...)"
                                className="p-2 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                                value={el.observations}
                                onChange={(e) => {
                                  const newPieces = [...formData.pieces];
                                  newPieces[pIndex].elements[eIndex].observations = e.target.value;
                                  setFormData({...formData, pieces: newPieces});
                                }}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                    </div>
                ))}
                </div>

                {/* Section Ajout de pièce (avec filtre anti-doublon simplifié) */}
                <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                <div className="flex gap-2">
                    <select id="select-room" className="flex-1 p-3 rounded-lg border border-slate-300 bg-white">
                    {["Cuisine", "Salon", "Chambre 1", "Chambre 2", "SDB", "Entrée", "Balcon"]
                        .filter(name => !formData.pieces.some((p: any) => p.nom === name))
                        .map(name => <option key={name}>{name}</option>)
                    }
                    </select>
                    <button 
                    onClick={() => {
                        const select = document.getElementById('select-room') as HTMLSelectElement;
                        if(!select.value) return;
                        const newRoom = {
                        nom: select.value,
                        elements: [
                            { nom: "Murs & Plafond", etat: "Bon état", observations: "", photos: [] },
                            { nom: "Sols / Plinthes", etat: "Bon état", observations: "", photos: [] },
                            { nom: "Menuiseries / Vitres", etat: "Bon état", observations: "", photos: [] }
                        ]
                        };
                        setFormData({...formData, pieces: [...formData.pieces, newRoom] as any});
                    }}
                    className="bg-slate-900 text-white px-6 rounded-lg font-bold hover:bg-slate-800 transition"
                    >
                    Ajouter
                    </button>
                </div>
                </div>

                {/* Navigation */}
                <div className="flex gap-4 pt-6">
                <button onClick={() => setStep(2)} className="flex-1 py-3 text-slate-600 font-medium">Retour</button>
                <button 
                    onClick={() => setStep(4)} 
                    disabled={formData.pieces.length === 0}
                    className={`flex-[2] py-3 rounded-xl font-bold transition ${
                    formData.pieces.length > 0 ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'
                    }`}
                >
                    Étape finale : Signature
                </button>
                </div>
            </div>
            )}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 text-center">
                <h2 className="text-xl font-semibold text-slate-800">Dernière étape : Signature</h2>
                
                <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                  <p className="text-sm text-slate-500 mb-4 italic">
                    En cliquant sur le bouton ci-dessous, vous certifiez que les informations saisies pour le logement à l'adresse :  
                    <span className="block font-bold text-slate-800 mt-1">{formData.metadata.adresse_bien}</span> sont exactes.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold uppercase text-slate-400 mb-2">Locataire</p>
                      <p className="font-semibold text-slate-800">{formData.metadata.locataire.nom || "Non renseigné"}</p>
                    </div>
                    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold uppercase text-slate-400 mb-2">Propriétaire</p>
                      <p className="font-semibold text-slate-800">{formData.metadata.bailleur.nom || "Non renseigné"}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-6">
                  <button 
                    onClick={saveRapport}
                    className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-green-100 hover:bg-green-700 transition"
                  >
                    Signer et Enregistrer
                  </button>
                  <button onClick={() => setStep(3)} className="text-slate-500 font-medium py-2">
                    Retour pour modifier
                  </button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="py-12 text-center animate-in zoom-in duration-500">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
                  ✓
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Rapport Enregistré !</h2>
                <p className="text-slate-500 mb-8">Votre état des lieux est maintenant sécurisé dans la base de données.</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold"
                >
                  Créer un nouveau rapport
                </button>
              </div>
            )}
      </div>
    </div>
  );
}