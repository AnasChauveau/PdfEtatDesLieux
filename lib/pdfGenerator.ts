import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateEDL_PDF = async (data: any) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let currentY = 20;

  // --- TITRE ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(`ÉTAT DES LIEUX : ${data.metadata.type.toUpperCase()}`, pageWidth / 2, currentY, { align: 'center' });
  
  // --- INFOS GÉNÉRALES ---
  autoTable(doc, {
    startY: currentY + 15,
    head: [['Informations du Bien', 'Parties']],
    body: [[
      `Adresse: ${data.metadata.adresse_bien}\nCadastre: ${data.metadata.cadastre || 'N/A'}\nChauffage: ${data.metadata.chauffage}`,
      `Bailleur: ${data.metadata.bailleur.nom}\nLocataire: ${data.metadata.locataire.nom}\nClés: ${data.metadata.cles}`
    ]],
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85] }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // --- 1. COMPTEURS ---
  doc.setFontSize(14);
  doc.text("1. RELEVÉS DES COMPTEURS", 14, currentY);

  const rowsCompteurs = data.compteurs.map((c: any) => {
    // On crée un texte personnalisé pour chaque ligne
    let statutPhoto = 'Vu sur place';
    if (c.photo_url) {
      statutPhoto = 'Photographié (Preuve archivée)';
    }

    return [c.type, c.index, statutPhoto];
  });

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Type', 'Index', 'Observations']],
    body: rowsCompteurs,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] } // Un beau bleu pro
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // --- 2. DÉTAIL DES PIÈCES ---
  doc.setFontSize(14);
  doc.text("2. DÉTAIL DES PIÈCES", 14, currentY);
  currentY += 10;

  data.pieces.forEach((piece: any) => {
    if (currentY > 240) { doc.addPage(); currentY = 20; }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`> ${piece.nom}`, 14, currentY);
    currentY += 5;

    autoTable(doc, {
      startY: currentY,
      head: [['Élément', 'État', 'Observations']],
      body: piece.elements.map((el: any) => [
        el.nom, 
        el.etat, 
        el.observations ? `${el.observations}${el.photo_url ? ' (Photo enregistrée)' : ''}` : 'R.A.S'
      ]),
      margin: { left: 15 },
      styles: { fontSize: 9 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  });

  // --- SIGNATURES (Version Large 60x30) ---
  if (currentY > 220) { doc.addPage(); currentY = 20; }
  
  doc.setDrawColor(200);
  doc.line(14, currentY, pageWidth - 14, currentY);
  currentY += 15;

  doc.setFontSize(10);
  doc.text("Signature du Bailleur", 30, currentY);
  if (data.signatureBailleur) {
    // Retour au format 60x30 qui te plaisait
    doc.addImage(data.signatureBailleur, 'PNG', 20, currentY + 5, 60, 30);
  }

  doc.text("Signature du Locataire", 130, currentY);
  if (data.signatureLocataire) {
    doc.addImage(data.signatureLocataire, 'PNG', 120, currentY + 5, 60, 30);
  }

  return doc.output('blob');
};