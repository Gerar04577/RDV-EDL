// signature-edl.js — RDV EDL v1.0 — 21/09/2026
//
// LA SIGNATURE DES COURRIELS, SELON L'IMMEUBLE.
//
// Un seul fichier pour les deux pages qui ecrivent aux locataires :
// locataires.html (les invitations) et rendez-vous.html (les confirmations).
// Deux copies de cette regle finiraient par diverger ; une seule ne le peut
// pas.
//
// Le bailleur differe selon l'immeuble :
//   - Havre appartient a la S.A. SAMADHI, representee par Julien Gerard ;
//   - Egmont appartient en propre a Julien Gerard ;
//   - les cinq autres — Nimy, Petite Guirlande, Vannes, La Fermette,
//     Biche — sont au nom de Jean-Marc Gerard.
//
// L'immeuble se lit au debut de l'identifiant de l'unite : « havre-41 »,
// « egmont-72 », « nimy-12 ». C'est la seule information sure dont les deux
// pages disposent toujours ; le nom affiche de l'immeuble, lui, varie
// (« HAVRE », « Havré »).

var SIGNATURES_EDL = {
  havre:  "S.A. SAMADHI, représentée par Julien Gérard",
  egmont: "Julien Gérard"
};
var SIGNATURE_EDL_DEFAUT = "Jean-Marc Gérard";

function signatureEDL(uniteId) {
  var prefixe = String(uniteId || "").toLowerCase().split("-")[0];
  return SIGNATURES_EDL[prefixe] || SIGNATURE_EDL_DEFAUT;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { signatureEDL: signatureEDL };
}
