// graph-storage.js — RDV EDL v1.2 — 22/09/2026
//
// v1.2 — CE FICHIER NE SAIT PLUS ECRIRE.
//
// Il etait repris tel quel de Gestion Loyers, avec ses fonctions d'ecriture :
// ecrireFichierDansDossier, sauvegarderMoisOneDrive, televerserFichier...,
// assurerDossier. RDV EDL ne doit JAMAIS ecrire dans les fichiers de Gestion
// Loyers — il les lit, un point c'est tout. Les porter sans les employer,
// c'est laisser une arme chargee sur la table : une modification ulterieure
// pouvait les appeler par mégarde et abimer vos donnees.
//
// Elles sont retirees. Ne restent que la resolution de chemin et la lecture,
// et la resolution refuse desormais de creer un dossier absent.
// Repris de Gestion Loyers v157, avec UNE correction : voir
// lireFichierDansDossier, plus bas.
// Gestion Loyers — stockage des données dans OneDrive
// Un fichier PAR MOIS dans un sous-dossier dédié "GESTION-LOYERS/historique",
// à l'intérieur du dossier PARTAGÉ "Immobilier 2025-2026" (le même que VéroS).
//
// IMPORTANT (méthode reprise de VéroS après un vrai bug en conditions réelles) :
// pour Gérard, "Immobilier 2025-2026" est un vrai dossier — un accès par CHEMIN
// TEXTE (/me/drive/root:/Immobilier 2025-2026/...) fonctionne. Mais pour toute
// autre personne (Véronique, Carine...), ce même dossier n'est visible que comme
// un RACCOURCI vers le drive de Gérard — Microsoft appelle ça un "remoteItem".
// Un accès par chemin texte échoue sur un raccourci (confirmé : erreur 422
// "Children cannot be listed from an item that is not a folder"). La seule
// méthode fiable pour tout le monde est de naviguer par IDENTIFIANT, jamais
// par texte — exactement ce que fait VéroS.

const DOSSIER_RACINE_PARTAGE = "Immobilier 2025-2026";
const SOUS_DOSSIER = "GESTION-LOYERS";
const SOUS_DOSSIER_HISTORIQUE = "GESTION-LOYERS/historique";
const NOM_FICHIER_INDEX = "index.json"; // liste des mois qui ont des données
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function encoderChemin(chemin) {
  return chemin.split('/').map(encodeURIComponent).join('/');
}

async function appelGraph(chemin, options = {}) {
  const token = await obtenirJetonValide();
  if (!token) throw new Error("Jeton Microsoft absent ou expiré (reconnexion nécessaire)");
  const url = `${GRAPH_BASE}${chemin}`;
  const params = {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Authorization": `Bearer ${token}`
    }
  };
  // SÉCURITÉ (21/08) : preuve directe (onglet Network chez Véronique) qu'une
  // requête peut rester bloquée indéfiniment ("pending"), sans jamais échouer
  // ni réussir d'elle-même. Une vraie limite de temps force l'abandon d'une
  // requête figée, puis on réessaie automatiquement — plutôt que d'attendre
  // sans fin ou d'abandonner au premier aléa passager.
  const NB_ESSAIS_MAX = 3;
  const DELAI_ENTRE_ESSAIS_MS = 700;
  const LIMITE_TEMPS_MS = 15000;
  let derniereErreur;
  for (let essai = 1; essai <= NB_ESSAIS_MAX; essai++) {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), LIMITE_TEMPS_MS);
    try {
      const res = await fetch(url, { ...params, signal: controleur.signal });
      clearTimeout(minuteur);
      return res;
    } catch (e) {
      clearTimeout(minuteur);
      derniereErreur = e;
      if (essai < NB_ESSAIS_MAX) {
        await new Promise(r => setTimeout(r, DELAI_ENTRE_ESSAIS_MS * essai));
      }
    }
  }
  throw derniereErreur;
}

async function detailErreur(res) {
  try {
    const texte = await res.text();
    return `${res.status} ${res.statusText} — ${texte.slice(0, 300)}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

// --- Navigation PAR IDENTIFIANT (méthode VéroS) ---

// coordonnées réelles d'un élément : son espace de stockage (driveId) et son
// identifiant — gère aussi bien un vrai dossier qu'un raccourci (remoteItem)
function refDe(item, driveParent) {
  if (item.remoteItem) {
    return {
      driveId: (item.remoteItem.parentReference && item.remoteItem.parentReference.driveId) || driveParent || null,
      id: item.remoteItem.id,
    };
  }
  return { driveId: driveParent || null, id: item.id };
}

async function enfantsDeRef(ref) {
  /* LES DATES SERVENT À RECONNAÎTRE LE DOSSIER DU LOCATAIRE EN COURS.

     Un studio garde le dossier de TOUS ses locataires successifs. Pour
     savoir lequel est celui d'aujourd'hui — et donc vers quelle
     orthographe corriger une faute de frappe —, il faut les dater.

     createdDateTime est le meilleur repère : le dossier a été créé quand
     le locataire est arrivé, et cette date ne bouge plus.
     lastModifiedDateTime, lui, est calculé à partir du contenu et remonte
     dès qu'on rouvre un vieux fichier — il ne sert qu'à départager.
     Ajouté le 07/09/2026. */
  /* size s'ajoute pour la mémoire des comptes de pages : deux fichiers de
     même date mais de taille différente ne sont pas le même document. */
  const champs = 'id,name,folder,file,remoteItem,webUrl,createdDateTime,lastModifiedDateTime,size';
  let url;
  if (!ref || !ref.id) {
    url = `/me/drive/root/children?$top=200&$select=${champs}`;
  } else if (ref.driveId) {
    url = `/drives/${ref.driveId}/items/${ref.id}/children?$top=200&$select=${champs}`;
  } else {
    url = `/me/drive/items/${ref.id}/children?$top=200&$select=${champs}`;
  }
  const tousLesElements = [];
  while (url) {
    const res = await appelGraph(url);
    if (!res.ok) {
      if (res.status === 404) return tousLesElements;
      throw new Error(`Listage : ${await detailErreur(res)}`);
    }
    const data = await res.json();
    tousLesElements.push(...(data.value || []));
    url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '') : null;
  }
  return tousLesElements;
}

let _refRacineImmobilierCache = null;
async function obtenirRefRacineImmobilier() {
  if (_refRacineImmobilierCache) return _refRacineImmobilierCache;
  const enfants = await enfantsDeRef(null); // racine "Mes fichiers"
  const trouve = enfants.find(e => (e.name || '').trim() === DOSSIER_RACINE_PARTAGE);
  if (!trouve) throw new Error(`Dossier "${DOSSIER_RACINE_PARTAGE}" introuvable dans "Mes fichiers" — vérifier qu'il est bien ajouté en raccourci`);
  _refRacineImmobilierCache = refDe(trouve, null);
  return _refRacineImmobilierCache;
}

// résout un chemin RELATIF à "Immobilier 2025-2026" (ex. "GESTION-LOYERS/historique")
// en descendant segment par segment PAR IDENTIFIANT ; crée les segments manquants
// si creerSiAbsent est vrai
async function resoudreRefParChemin(cheminRelatif, creerSiAbsent) {
  /* v1.2 — la creation de dossier est retiree : cette application lit, elle
     n'ecrit pas. Un chemin absent rend null, comme avant lorsqu'on ne
     demandait pas la creation. */
  if (creerSiAbsent) {
    throw new Error("RDV EDL ne crée aucun dossier dans OneDrive");
  }
  let ref = await obtenirRefRacineImmobilier();
  if (!cheminRelatif) return ref;
  const segments = cheminRelatif.split('/').filter(Boolean);
  for (const segment of segments) {
    const enfants = await enfantsDeRef(ref);
    const trouve = enfants.find(e => (e.name || '').trim() === segment);
    if (!trouve) return null;
    ref = refDe(trouve);
  }
  return ref;
}

async function lireFichierDansDossier(refDossier, nomFichier) {
  const base = refDossier.driveId
    ? `/drives/${refDossier.driveId}/items/${refDossier.id}:/${encodeURIComponent(nomFichier)}:`
    : `/me/drive/items/${refDossier.id}:/${encodeURIComponent(nomFichier)}:`;

  const direct = await appelGraph(base + '/content');
  if (direct && direct.ok) return direct;
  if (!direct || direct.status !== 401) return direct;

  // repli : la fiche, puis l'adresse de telechargement, sans en-tete
  const fiche = await appelGraph(base);
  if (!fiche || !fiche.ok) return direct;   // on rend la premiere erreur
  let adresse;
  try {
    const item = await fiche.json();
    adresse = item && item['@microsoft.graph.downloadUrl'];
  } catch (e) { return direct; }
  if (!adresse) return direct;

  return await fetch(adresse);   // volontairement sans Authorization
}







