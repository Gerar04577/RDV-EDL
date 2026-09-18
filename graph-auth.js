// graph-auth.js — RDV EDL v1.1 — 18/09/2026
// Repris SANS MODIFICATION DE FOND de Gestion Loyers v132 (07/09/2026).
//
// Même identifiant d'application Entra et mêmes clés de stockage que
// Gestion Loyers : les deux applications étant servies par le même domaine
// gerar04577.github.io, elles partagent le stockage local du navigateur.
// RDV EDL hérite donc du jeton déjà obtenu, sans nouvel écran d'accord.
//
// L'adresse de retour https://gerar04577.github.io/RDV-EDL/ est déclarée
// dans l'inscription Entra « Gestion Loyers » (vérifié le 18/09/2026).
// Même approche que VéroS : aucune librairie, aucun CDN.
//
// Permissions demandées :
//  - Files.Read      : lire les documents des locataires dans OneDrive (scan bail/EDLE/EDLS/Samadhi)
// graph-auth.js — v132 — 07/09/2026
//  - Files.ReadWrite : lire/écrire le fichier de données de Gestion Loyers dans le dossier
//                      OneDrive PARTAGÉ (Gérard, Véronique, fils) — pas un dossier privé,
//                      donc la permission ne peut plus être limitée à AppFolder

const MSAL_CLIENT_ID = "42a7292b-76c0-404c-bb3a-fb4cb35d4694"; // inscription Entra "Gestion Loyers"
/* v1.1 — L'ADRESSE DE RETOUR DOIT ÊTRE CELLE QUI EST DÉCLARÉE.

   Gestion Loyers ne retirait que « index.html » du chemin. Depuis
   locataires.html, l'adresse de retour valait donc
   .../RDV-EDL/locataires.html — alors que l'inscription Entra ne déclare
   que .../RDV-EDL/. Microsoft aurait refusé la connexion avec une erreur
   de correspondance d'adresse.

   On retire ici TOUT nom de fichier, quel qu'il soit. Le retour arrive donc
   sur .../RDV-EDL/, c'est-à-dire index.html, qui achève la connexion et
   renvoie vers la page d'où l'on venait. */
const MSAL_REDIRECT_URI = window.location.origin +
  window.location.pathname.replace(/[^/]*\.html$/, "");

/* Page d'où part la connexion, pour y revenir après le détour par
   Microsoft. sessionStorage : elle ne doit pas survivre à l'onglet. */
const PAGE_DEPART_KEY = "rdvEdlPageDepart";
/* MAIL.SEND — AJOUTÉ LE 07/09/2026.

   Gestion Loyers envoie désormais le document de remise des clés au
   locataire, depuis la boîte Outlook de Gérard. Microsoft Graph accepte
   cette autorisation pour les comptes personnels ; l'accord se donne à la
   connexion, il n'y a rien à payer.

   Après cette mise à jour il faut se DÉCONNECTER puis se reconnecter :
   Microsoft affichera un nouvel écran d'accord mentionnant l'envoi de
   courrier. Sans cela, le jeton en cours ne porte pas ce droit et l'envoi
   sera refusé. */
const MSAL_SCOPES = "Files.Read Files.ReadWrite Mail.Send offline_access";
const MSAL_AUTHORITY = "https://login.microsoftonline.com/consumers"; // comptes Microsoft personnels uniquement

const TOKEN_STORAGE_KEY = "gestionLoyersMsalToken";
const VERIFIER_STORAGE_KEY = "gestionLoyersPkceVerifier";

// --- PKCE : génération du vérifieur et du challenge ---

function genererChaineAleatoire(longueur) {
  const tableau = new Uint8Array(longueur);
  crypto.getRandomValues(tableau);
  return Array.from(tableau, b => ('0' + b.toString(16)).slice(-2)).join('');
}

async function genererCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

function base64UrlEncode(arrayBuffer) {
  let binaire = '';
  const octets = new Uint8Array(arrayBuffer);
  for (let i = 0; i < octets.byteLength; i++) binaire += String.fromCharCode(octets[i]);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- Connexion ---

async function demarrerConnexion() {
  try {
    const ici = window.location.pathname.split('/').pop();
    if (ici && ici.endsWith('.html')) sessionStorage.setItem(PAGE_DEPART_KEY, ici);
  } catch (e) { /* mode privé : on reviendra sur la page par défaut */ }
  const verifier = genererChaineAleatoire(64);
  sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
  const challenge = await genererCodeChallenge(verifier);

  const params = new URLSearchParams({
    client_id: MSAL_CLIENT_ID,
    response_type: "code",
    redirect_uri: MSAL_REDIRECT_URI,
    response_mode: "query",
    scope: MSAL_SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  window.location.href = `${MSAL_AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function traiterRetourConnexion() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (!code) return false;

  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
  if (!verifier) return false;

  const body = new URLSearchParams({
    client_id: MSAL_CLIENT_ID,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: MSAL_REDIRECT_URI,
    code_verifier: verifier
  });

  const res = await fetch(`${MSAL_AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!res.ok) {
    console.error("Échec de l'échange du code contre un jeton", await res.text());
    return false;
  }

  const jeton = await res.json();
  jeton.obtenu_le = Date.now();
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(jeton));

  // Nettoyer l'URL (retirer ?code=...)
  window.history.replaceState({}, document.title, MSAL_REDIRECT_URI);
  return true;
}

async function rafraichirJeton(refreshToken) {
  const body = new URLSearchParams({
    client_id: MSAL_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MSAL_SCOPES
  });
  const res = await fetch(`${MSAL_AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!res.ok) return null;
  const jeton = await res.json();
  jeton.obtenu_le = Date.now();
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(jeton));
  return jeton;
}

// SÉCURITÉ (19/08) : protège contre TOUTES les sources d'appels simultanés
// (double-clic, mais aussi le signal de présence automatique en arrière-plan,
// ou toute autre fonction future) — pas seulement les doubles sauvegardes.
// Motif standard documenté ("single-flight" / "request coalescing") : si un
// rafraîchissement est déjà en cours, on attend CE MÊME résultat au lieu d'en
// démarrer un second en parallèle avec le même refresh_token — confirmé par
// Microsoft (azure-docs #74342) qu'un rafraîchissement parallèle peut échouer.
let promesseRafraichissementEnCours = null;

async function obtenirJetonValide() {
  const brut = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!brut) return null;
  let jeton = JSON.parse(brut);

  const ageSecondes = (Date.now() - jeton.obtenu_le) / 1000;
  const encoreValide = ageSecondes < (jeton.expires_in - 60); // marge de 60s

  if (encoreValide) return jeton.access_token;

  if (jeton.refresh_token) {
    if (!promesseRafraichissementEnCours) {
      promesseRafraichissementEnCours = rafraichirJeton(jeton.refresh_token)
        .finally(() => { promesseRafraichissementEnCours = null; });
    }
    const nouveau = await promesseRafraichissementEnCours;
    if (nouveau) return nouveau.access_token;
  }

  localStorage.removeItem(TOKEN_STORAGE_KEY);
  return null;
}

function estConnecte() {
  return !!localStorage.getItem(TOKEN_STORAGE_KEY);
}

function seDeconnecter() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  location.reload();
}
