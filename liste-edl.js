// liste-edl.js — RDV EDL v1.2 — 20/09/2026
//
// Construit la liste des personnes à inviter pour un état des lieux, en
// croisant deux fichiers OneDrive de Gestion Loyers, SANS RIEN Y ÉCRIRE :
//
//   GESTION-LOYERS/rentree/rentree-AAAA.json   — qui part, qui arrive
//   GESTION-LOYERS/historique/AAAA-MM.json     — qui occupe l'unité
//
// POURQUOI ICI ET NON DANS GESTION LOYERS.
// Une première version greffait ce calcul dans Gestion Loyers. Analyse faite,
// le contenu produit était faux sur trois points, et l'application la plus
// sensible de Gérard n'a pas à porter ce risque. RDV EDL est neuve : une
// erreur y coûte peu. Gestion Loyers reste en v149, intacte.
//
// LES TROIS PIÈGES, ET CE QU'ILS IMPOSENT.
//
// 1. APRÈS UN VERSEMENT, LE MOIS NE CONTIENT PLUS LE SORTANT.
//    rentree.js ligne 1725 : `if (changeDeLocataire) u.locataire =
//    l.locataireSuivant;` — le NOM est remplacé. L'adresse, elle, ne l'est
//    qu'en cas de déménagement interne (ligne 1798). Le mois porte donc le
//    nom du nouveau AVEC l'adresse de l'ancien. Lire les deux dans le mois
//    produisait une ligne de sortie au nom de l'entrant, et le vrai sortant
//    n'apparaissait nulle part.
//    Remède : ligne 1716, `if (!l.instantane) l.instantane = ...` conserve
//    l'état complet de l'unité AVANT remplacement. Quand l.verseeLe est
//    renseigné, le sortant se lit là.
//
// 2. « EN ATTENTE » ET « INOCCUPÉ » SONT AUSSI DES DÉPARTS.
//    manquesRentree() (rentree.js ligne 536) n'écarte que 'reste' et
//    'inoccupe' : l'application traite donc « en attente » comme un départ.
//    Un filtre sur le seul 'depart' privait de rendez-vous tout locataire
//    dont le remplaçant n'est pas encore trouvé.
//
// 3. UNE LIGNE SANS ADRESSE NE DOIT PAS PARTIR EN SILENCE.
//    Elle est produite, marquée, et affichée en rouge. Elle n'est jamais
//    cochable : Make n'aurait personne à qui écrire.

const LISTE_EDL_VERSION = 'v1.0';

const LISTE_EDL_RENTREE = 'GESTION-LOYERS/rentree';
const LISTE_EDL_HISTORIQUE = 'GESTION-LOYERS/historique';

// Les trois unités qui ne sont pas des logements : deux rez-de-chaussée
// commerciaux et un garage. Jamais d'état des lieux sur créneau.
const LISTE_EDL_EXCLUES = ['nimy-5', 'petite-guirlande-32', 'vannes-57'];

// Statuts qui valent départ. 'reste' est le seul à ne jamais en produire.
const LISTE_EDL_STATUTS_SORTIE = ['depart', 'attente', 'inoccupe'];

/* Nettoyage d'une valeur destinée à être comparée par Make : espaces de
   bout, et caractères invisibles que le copier-coller dépose (U+200B à
   U+200D, U+2060, U+FEFF). Deux adresses du fichier de septembre en
   portaient, invisibles à l'écran et fatales à la comparaison. */
function nettoyerEDL(v) {
  return String(v == null ? '' : v)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim();
}

/* Une adresse est exploitable si elle a une arobase, un point après, et
   rien avant ni après. Volontairement simple : il ne s'agit pas de valider
   une adresse, seulement d'écarter celles qui ne mèneront nulle part. */
function adresseExploitableEDL(email) {
  return /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(nettoyerEDL(email));
}

function moisCourantEDL() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function anneeRentreeEDL() {
  return new Date().getFullYear();
}

/* Index plat du mois : le fichier emboîte immeubles[] puis unites[], alors
   que la rentrée indexe à plat. On aplatit une fois, on cherche ensuite. */
function indexerMoisEDL(mois) {
  const index = {};
  ((mois && mois.immeubles) || []).forEach(immeuble => {
    (immeuble.unites || []).forEach(unite => {
      index[unite.id] = { immeuble, unite };
    });
  });
  return index;
}

/* LE CŒUR. Rend un objet { lignes, avertissements } — jamais d'exception,
   pour qu'un fichier inattendu se signale au lieu de tout arrêter. */
function construireListeEDL(rentree, mois) {
  const lignes = [];
  const avertissements = [];

  if (!rentree || !rentree.unites) {
    avertissements.push("Le fichier de rentrée est vide ou illisible.");
    return { lignes, avertissements };
  }
  if (!mois || !mois.immeubles) {
    avertissements.push("Le fichier du mois est vide ou illisible.");
    return { lignes, avertissements };
  }

  const index = indexerMoisEDL(mois);

  Object.keys(rentree.unites).sort().forEach(uniteId => {
    if (LISTE_EDL_EXCLUES.includes(uniteId)) return;

    const l = rentree.unites[uniteId];
    if (!l || !LISTE_EDL_STATUTS_SORTIE.includes(l.statut)) return;

    const trouve = index[uniteId];
    if (!trouve) {
      avertissements.push(
        `${uniteId} : en statut « ${l.statut} » dans la rentrée, mais absente du mois.`);
      return;
    }

    const immeuble = nettoyerEDL(trouve.immeuble.nom);
    const studio = nettoyerEDL(trouve.unite.designation);

    /* --- LE SORTANT ---
       Versée : l'instantané porte l'état d'avant le remplacement.
       Non versée : le mois porte encore le sortant. */
    /* v1.2 — L'INSTANTANE PEUT ETRE PLUS ANCIEN QUE VOS SAISIES.

       Le studio 1 de Nimy a ete verse le 5 septembre : l'instantane a fige
       l'etat de ce jour-la, avec le bon nom mais AUCUNE adresse — les
       adresses n'ont ete saisies que le 17. La sortante se retrouvait sans
       moyen d'etre reconnue, alors que le mois porte bien son adresse.

       Le nom reste celui de l'instantane : lui seul est sur, le mois pouvant
       deja porter le remplacant. Mais un champ VIDE dans l'instantane ne
       vaut pas mieux que rien — on va alors le chercher dans le mois. */
    /* v1.3 — « VERSEE » NE VEUT PAS DIRE « LE MOIS A CHANGE ».

       Le versement vise un mois PRECIS, porte par verseeVers. Le studio 1 de
       Nimy a ete verse le 05/09 vers 2026-10 : septembre contient donc
       toujours Eva SMETS et sa vraie adresse. On basculait pourtant sur
       l'instantane des que verseeLe etait renseigne, sans regarder vers quel
       mois — et l'instantane, plus ancien que vos saisies, etait muet.

       L'instantane ne sert que si le versement a DEJA touche le mois qu'on
       lit. Sinon le mois fait foi, nom compris. */
    const moisLu = moisCourantEDL();
    const versee = !!l.verseeLe && !!l.verseeVers && l.verseeVers <= moisLu;
    const instantane = (versee && l.instantane) ? l.instantane : null;
    const sourceSortant = instantane || trouve.unite;

    function completer(champ) {
      const depuisInstantane = nettoyerEDL(sourceSortant[champ]);
      if (depuisInstantane) return { valeur: depuisInstantane, complete: false };
      const depuisMois = nettoyerEDL(trouve.unite[champ]);
      return { valeur: depuisMois, complete: !!depuisMois && !!instantane };
    }

    if (versee && !l.instantane) {
      avertissements.push(
        `${uniteId} : unité versée sans instantané — le sortant lu dans le ` +
        `mois risque d'être le nouveau locataire. À vérifier à la main.`);
    }

    const nomSortant = completer('locataire').valeur;
    if (nomSortant) {
      const adresse = completer('email');
      const garant = completer('emailGarant');
      lignes.push({
        uniteId, immeuble, studio,
        type: 'EDLS',
        nom: nomSortant,
        email: adresse.valeur,
        emailGarant: garant.valeur,
        statut: l.statut,
        versee,
        sourceSortant: instantane ? 'instantané' : 'mois',
        adresseCompletee: adresse.complete,
        adresseManquante: !adresseExploitableEDL(adresse.valeur),
      });
      if (adresse.complete) {
        avertissements.push(
          `${uniteId} : l'instantané ne portait pas d'adresse — celle du mois ` +
          `a été reprise (${adresse.valeur}). À vérifier si le studio a changé ` +
          `de locataire dans le mois.`);
      }
    } else if (l.statut !== 'inoccupe') {
      avertissements.push(
        `${uniteId} : statut « ${l.statut} » mais aucun locataire sortant nommé.`);
    }

    /* --- L'ENTRANT ---
       Seulement si un remplaçant est nommé. « en attente » et « inoccupé »
       n'en ont pas, par définition. */
    const nomEntrant = nettoyerEDL(l.locataireSuivant);
    if (nomEntrant) {
      const email = nettoyerEDL(l.email);
      lignes.push({
        uniteId, immeuble, studio,
        type: 'EDLE',
        nom: nomEntrant,
        email,
        emailGarant: nettoyerEDL(l.emailGarant),
        statut: l.statut,
        versee,
        demenagement: !!l.demenagement,
        adresseManquante: !adresseExploitableEDL(email),
      });
    }
  });

  return { lignes, avertissements };
}

/* Lecture des deux fichiers, puis croisement. Rend en plus les noms des
   fichiers lus, pour que l'écran puisse les afficher : on doit pouvoir
   vérifier d'un coup d'œil sur quoi la liste repose. */
/* v1.1 — « illisible » NE DISAIT RIEN.
   Le message masquait le code HTTP et l'explication de Microsoft : impossible
   de distinguer un jeton perime (401), un fichier absent (404), un dossier
   partage inaccessible (422) ou une panne passagere (500). On rapporte
   desormais ce que Graph a reellement repondu. */
async function detailReponseEDL(res, nom) {
  let detail = '';
  try {
    const corps = await res.clone().json();
    detail = (corps && corps.error && (corps.error.message || corps.error.code)) || '';
  } catch (e) { /* la reponse n'etait pas du JSON */ }
  const sens = res.status === 401 ? 'jeton refusé, reconnectez-vous'
             : res.status === 404 ? 'fichier introuvable à cet emplacement'
             : res.status === 403 ? 'accès refusé à ce dossier'
             : res.status === 422 ? 'dossier atteint comme un raccourci'
             : res.status >= 500  ? 'panne passagère chez Microsoft, réessayez'
             : '';
  return `${nom} : erreur ${res.status}` + (sens ? ` — ${sens}` : '') +
         (detail ? ` (${detail})` : '');
}

async function chargerListeEDL() {
  const annee = anneeRentreeEDL();
  const mois = moisCourantEDL();
  const nomRentree = `rentree-${annee}.json`;
  const nomMois = `${mois}.json`;

  const refRentree = await resoudreRefParChemin(LISTE_EDL_RENTREE, false);
  if (!refRentree) throw new Error(`dossier ${LISTE_EDL_RENTREE} introuvable`);
  const resR = await lireFichierDansDossier(refRentree, nomRentree);
  if (!resR) throw new Error(`${nomRentree} : aucune réponse de Microsoft`);
  if (!resR.ok) throw new Error(await detailReponseEDL(resR, nomRentree));
  const donneesRentree = await resR.json();

  const refMois = await resoudreRefParChemin(LISTE_EDL_HISTORIQUE, false);
  if (!refMois) throw new Error(`dossier ${LISTE_EDL_HISTORIQUE} introuvable`);
  const resM = await lireFichierDansDossier(refMois, nomMois);
  if (!resM) throw new Error(`${nomMois} : aucune réponse de Microsoft`);
  if (!resM.ok) throw new Error(await detailReponseEDL(resM, nomMois));
  const donneesMois = await resM.json();

  const resultat = construireListeEDL(donneesRentree, donneesMois);
  resultat.fichiers = { rentree: nomRentree, mois: nomMois };
  resultat.annee = annee;
  return resultat;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { construireListeEDL, nettoyerEDL, adresseExploitableEDL,
                     LISTE_EDL_EXCLUES, LISTE_EDL_STATUTS_SORTIE };
}
