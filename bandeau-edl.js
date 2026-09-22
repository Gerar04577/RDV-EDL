// bandeau-edl.js — RDV EDL v1.1 — 21/09/2026
//
// LE BANDEAU DES MESSAGES, COMMUN AUX QUATRE PAGES.
//
// Les messages s'affichaient dans un encart discret EN HAUT de la page,
// alors que les boutons d'action sont EN BAS, dans la barre fixe. Sur un
// iPhone, le resultat d'un clic apparaissait hors de la vue : « c'est noté
// à 11:00 » passait inapercu. Demande de Gerard, le 21/09 : tout doit etre
// bien visible, avec des couleurs vives, pour ne rien rater.
//
// Le bandeau est FIXE en haut de l'ecran : il reste visible ou que l'on
// soit dans la page. Cinq natures, cinq couleurs :
//
//   ok       vert vif    un succes           reste jusqu'a ce qu'on le ferme
//   ko       rouge vif   un echec            reste jusqu'a ce qu'on le ferme
//   attente  orange vif  rien a proposer     reste jusqu'a ce qu'on le ferme
//   info     bleu vif    une consigne        reste jusqu'a ce qu'on le ferme
//   encours  ardoise     une operation       remplace des qu'elle se termine
//
// Il ne sert qu'aux EVENEMENTS. Ce qui se recalcule a chaque frappe — le
// resume de l'ecran d'ouverture — reste dans la page : en bandeau, il
// clignoterait sans cesse.

(function () {
  var COULEURS = {
    ok:      { fond: "#16A34A", bord: "#0E7A36", signe: "✓" },
    ko:      { fond: "#DC2626", bord: "#A11B1B", signe: "✕" },
    attente: { fond: "#EA7A0C", bord: "#B25A05", signe: "!" },
    info:    { fond: "#2563EB", bord: "#1A45AA", signe: "i" },
    encours: { fond: "#334155", bord: "#1E293B", signe: "" }
  };

  var style = document.createElement("style");
  style.textContent =
    "#bandeauEDL{position:fixed;left:0;right:0;top:0;z-index:9999;" +
      "padding:calc(12px + env(safe-area-inset-top)) 14px 14px;" +
      "display:none;box-shadow:0 6px 22px rgba(0,0,0,.35);" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}" +
    "#bandeauEDL.visible{display:flex;align-items:flex-start;gap:12px;" +
      "animation:bandeauEntree .28s ease-out, bandeauPulse .9s ease-out .28s 1;}" +
    "#bandeauEDL .signe{flex:0 0 auto;width:34px;height:34px;border-radius:50%;" +
      "background:rgba(255,255,255,.25);color:#fff;font-size:21px;font-weight:800;" +
      "display:flex;align-items:center;justify-content:center;}" +
    "#bandeauEDL .texte{flex:1;color:#fff;font-size:18px;font-weight:700;" +
      "line-height:1.4;padding-top:4px;}" +
    "#bandeauEDL .texte b{font-size:20px;}" +
    "#bandeauEDL .texte .bouton{margin-top:10px;background:#fff;color:#111;}" +
    "#bandeauEDL .fermer{flex:0 0 auto;background:rgba(255,255,255,.22);" +
      "border:0;color:#fff;font-size:24px;font-weight:700;width:40px;height:40px;" +
      "border-radius:10px;cursor:pointer;line-height:1;}" +
    "#bandeauEDL .roue{width:26px;height:26px;border:4px solid rgba(255,255,255,.35);" +
      "border-top-color:#fff;border-radius:50%;animation:bandeauRoue .8s linear infinite;}" +
    /* v1.1 — admin.html et locataires.html ont un en-tete colle en haut de
       l'ecran. Le bandeau, pose au meme endroit, le masquait des qu'on
       faisait defiler la page : l'en-tete se range desormais dessous. */
    "header{top:var(--hauteurBandeauEDL,0px)!important;}" +
    "@keyframes bandeauEntree{from{transform:translateY(-100%)}to{transform:none}}" +
    "@keyframes bandeauPulse{0%{filter:brightness(1.35)}100%{filter:brightness(1)}}" +
    "@keyframes bandeauRoue{to{transform:rotate(360deg)}}";
  (document.head || document.documentElement).appendChild(style);

  var zone = null;
  function assurerZone() {
    if (zone) return zone;
    zone = document.createElement("div");
    zone.id = "bandeauEDL";
    zone.setAttribute("role", "status");
    zone.setAttribute("aria-live", "assertive");
    document.body.appendChild(zone);
    return zone;
  }

  /* Le bandeau recouvre le haut de la page : on la decale d'autant, pour
     qu'il ne masque ni le titre ni le premier champ. */
  function decaler() {
    var h = zone && zone.classList.contains("visible") ? zone.offsetHeight : 0;
    document.body.style.paddingTop = h ? h + "px" : "";
    document.documentElement.style.setProperty("--hauteurBandeauEDL", h + "px");
  }

  window.bandeauEDL = function (nature, html) {
    var z = assurerZone();
    var c = COULEURS[nature] || COULEURS.info;
    z.style.background = c.fond;
    z.style.borderBottom = "4px solid " + c.bord;
    z.innerHTML =
      (nature === "encours"
        ? '<div class="signe"><div class="roue"></div></div>'
        : '<div class="signe">' + c.signe + "</div>") +
      '<div class="texte">' + html + "</div>" +
      (nature === "encours" ? "" :
        '<button class="fermer" aria-label="Fermer" ' +
        'onclick="bandeauEDL.fermer()">×</button>');
    /* v1.1 — L'ENTREE NE SE REJOUE QUE SI ELLE A UN SENS.
       L'ouverture d'une saison annonce « Envoi… 3 / 30 », puis « 4 / 30 » :
       le bandeau glissait et flashait trente fois de suite. On ne rejoue
       l'entree que s'il etait ferme ou si sa nature change — un succes qui
       suit une operation en cours doit, lui, attirer l'oeil. */
    var dejaLa = z.classList.contains("visible") && z.dataset.nature === nature;
    if (!dejaLa) {
      z.classList.remove("visible");
      void z.offsetWidth;               // relance l'animation d'entree
      z.classList.add("visible");
      z.dataset.entrees = String(Number(z.dataset.entrees || 0) + 1);
    }
    z.dataset.nature = nature;
    decaler();
  };

  window.bandeauEDL.fermer = function () {
    if (!zone) return;
    zone.classList.remove("visible");
    decaler();
  };

  window.addEventListener("resize", decaler);
})();
