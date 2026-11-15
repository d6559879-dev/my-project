/* =====================================
   DUKANI — place de marché
   (accueil public + espace acheteur)
===================================== */

const SUPABASE_URL = "https://aowfjpaclhrmmhpuxauq.supabase.co";
const SUPABASE_CLE = "sb_publishable_bHKXQAMowU0qoVOp5RqlmA_Qm_LrKC6";

/* Arrivée depuis le lien de confirmation d'un email ? (à lire avant que Supabase efface l'adresse) */
const viensDeConfirmation = /type=(signup|email)/.test(location.hash);

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CLE);

const $ = id => document.getElementById(id);
const ouvrir = id => $(id).classList.add("active");
const fermer = id => $(id).classList.remove("active");
const params = new URLSearchParams(location.search);

let utilisateur = null;
let role = null;
let nomProfil = "";
let modeInscription = false;
let minuteurRecherche = null;
let categorieActive = "";


/* ---------- Outils ---------- */

function ligne(parent, tag, texte) {
    const el = document.createElement(tag);
    el.textContent = texte;
    parent.appendChild(el);
    return el;
}

function urlPhoto(chemin) {
    return SUPABASE_URL + "/storage/v1/object/public/produits/" +
        chemin.split("/").map(encodeURIComponent).join("/");
}


/* ---------- Boutiques ---------- */

/* ---------- Icônes (sprite SVG intégré à la page) ---------- */

function iconeSvg(nom) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const use = document.createElementNS(ns, "use");

    svg.setAttribute("class", "ic");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#ic-" + nom);
    svg.appendChild(use);

    return svg;
}


/* ---------- Onglets et barre du bas ---------- */

function afficherOnglet(nom) {
    $("onglet-accueil").hidden = nom !== "accueil";
    $("onglet-actualites").hidden = nom !== "actualites";

    document.querySelectorAll(".fb-barre button[data-onglet]").forEach(b => {
        b.classList.toggle("actif", b.getAttribute("data-onglet") === nom);
    });

    window.scrollTo(0, 0);
}

function ouvrirRecherche() {
    afficherOnglet("accueil");
    $("recherche").focus();
}

/* ---------- Messagerie ---------- */

let conversationOuverte = null;
let minuteurMessages = null;
let signatureMessages = "";

async function majBadgeMessages() {
    const badge = $("badge-messages");

    if (!utilisateur) {
        badge.hidden = true;
        return;
    }

    const { data, error } = await sb.rpc("messages_non_lus");
    const n = !error && typeof data === "number" ? data : 0;

    badge.textContent = n > 99 ? "99+" : String(n);
    badge.hidden = n === 0;
}

async function ouvrirMessages() {
    if (!utilisateur) { ouvrirAuth(); return; }

    ouvrir("messagerie");
    await chargerConversations();
}

let conversationsCache = [];

async function chargerConversations() {
    const liste = $("liste-conversations");
    const { data, error } = await sb.rpc("mes_conversations");

    if (error || !Array.isArray(data)) {
        liste.textContent = "";
        ligne(liste, "p", "⚠️ Impossible de charger vos messages.").className = "fil-vide";
        return;
    }

    conversationsCache = data;
    afficherConversations();
    majBadgeMessages();
}

function avatarConversation(logo, nom, classe) {
    const avatar = document.createElement("div");
    avatar.className = "conversation-avatar" + (classe ? " " + classe : "");

    if (logo) {
        const img = document.createElement("img");
        img.src = urlPhoto(logo);
        img.alt = "";
        avatar.appendChild(img);
    } else {
        avatar.textContent = (nom || "?").trim().charAt(0).toUpperCase();
    }

    return avatar;
}

function afficherConversations() {
    const liste = $("liste-conversations");
    const filtre = $("recherche-conversations").value.trim().toLowerCase();

    liste.textContent = "";

    const visibles = conversationsCache.filter(c =>
        !filtre || (c.autre_nom || "").toLowerCase().includes(filtre));

    if (visibles.length === 0) {
        ligne(liste, "p", conversationsCache.length
            ? "Aucune discussion trouvée."
            : role === "vendeur"
                ? "Aucun message. Vos clients vous écriront depuis votre vitrine."
                : "Aucun message. Ouvrez une boutique et touchez « Discuter avec la boutique ».").className = "fil-vide";
        return;
    }

    visibles.forEach(c => {
        const ligneConversation = document.createElement("button");
        ligneConversation.type = "button";
        ligneConversation.className = "conversation" + (c.non_lus > 0 ? " non-lue" : "");

        const corps = document.createElement("div");
        corps.className = "conversation-corps";

        const nom = document.createElement("strong");
        nom.textContent = c.autre_nom;

        const apercu = document.createElement("p");
        apercu.textContent = (c.dernier_texte || "") + " · " + tempsEcoule(c.dernier_at);

        corps.appendChild(nom);
        corps.appendChild(apercu);

        ligneConversation.appendChild(avatarConversation(c.autre_logo, c.autre_nom));
        ligneConversation.appendChild(corps);

        if (c.non_lus > 0) {
            const point = document.createElement("i");
            point.className = "point-non-lu";
            point.setAttribute("aria-label", c.non_lus + " message(s) non lu(s)");
            ligneConversation.appendChild(point);
        }

        ligneConversation.addEventListener("click", () => ouvrirDiscussion(c.id));
        liste.appendChild(ligneConversation);
    });
}

async function ouvrirDiscussion(id) {
    conversationOuverte = id;
    signatureMessages = "";

    $("champ-message").value = "";
    majBoutonEnvoyer();
    $("disc-titre").textContent = "Discussion";
    $("disc-avatar").textContent = "";
    $("disc-boutique").hidden = true;
    $("fil-messages").textContent = "";

    fermer("messagerie");
    ouvrir("discussion");

    await chargerMessages(true);

    clearInterval(minuteurMessages);
    minuteurMessages = setInterval(() => {
        if (!document.hidden) chargerMessages(false);
    }, 5000);
}

function libelleHeure(iso) {
    const date = new Date(iso);
    const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    if (date.toDateString() === new Date().toDateString()) return heure;

    return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " " + heure;
}

async function chargerMessages(forcerBas) {
    const id = conversationOuverte;
    if (!id) return;

    const { data, error } = await sb.rpc("messages_conversation", { p_conversation: id });

    if (id !== conversationOuverte) return;

    if (error || !data) {
        if (forcerBas) {
            alert("⚠️ Conversation introuvable.");
            quitterDiscussion();
        }
        return;
    }

    $("disc-titre").textContent = data.autre_nom;

    const avatarEntete = $("disc-avatar");
    avatarEntete.textContent = "";
    const petit = avatarConversation(data.autre_logo, data.autre_nom, "petit");
    while (petit.firstChild) avatarEntete.appendChild(petit.firstChild);

    const boutonBoutique = $("disc-boutique");
    boutonBoutique.hidden = !data.slug;
    boutonBoutique.onclick = () => { location.href = "vitrine.html?b=" + encodeURIComponent(data.slug); };

    const signature = data.messages.map(msg => msg.id).join(",");
    if (signature === signatureMessages) return;
    signatureMessages = signature;

    const zone = $("fil-messages");
    const enBas = forcerBas || zone.scrollHeight - zone.scrollTop - zone.clientHeight < 80;
    const ECART = 30 * 60000;

    zone.textContent = "";

    if (data.messages.length === 0) {
        ligne(zone, "p", "Dites bonjour 👋").className = "fil-vide";
    }

    data.messages.forEach((msg, n) => {
        const avant = data.messages[n - 1];
        const apres = data.messages[n + 1];
        const quand = new Date(msg.created_at).getTime();

        if (!avant || quand - new Date(avant.created_at).getTime() > ECART) {
            ligne(zone, "div", libelleHeure(msg.created_at)).className = "separateur-heure";
        }

        const suite = avant && avant.moi === msg.moi &&
            quand - new Date(avant.created_at).getTime() <= ECART;
        const suivi = apres && apres.moi === msg.moi &&
            new Date(apres.created_at).getTime() - quand <= ECART;

        const bulle = document.createElement("div");
        bulle.className = "bulle " + (msg.moi ? "moi" : "autre") +
            (suite ? " suite" : "") + (suivi ? " suivi" : "");
        bulle.textContent = msg.texte;

        if (msg.moi) {
            zone.appendChild(bulle);
            return;
        }

        const rangee = document.createElement("div");
        rangee.className = "rangee-bulle" + (suite ? " suite" : "");

        const miniature = document.createElement("div");
        miniature.className = "mini-avatar";

        if (!suivi) {
            miniature.appendChild(avatarConversation(data.autre_logo, data.autre_nom, "mini"));
        }

        rangee.appendChild(miniature);
        rangee.appendChild(bulle);
        zone.appendChild(rangee);
    });

    if (enBas) zone.scrollTop = zone.scrollHeight;
    majBadgeMessages();
}

async function envoyerMessage() {
    const champ = $("champ-message");
    const texte = champ.value.trim();

    if (!texte || !conversationOuverte) return;

    champ.value = "";
    majBoutonEnvoyer();

    const { error } = await sb.rpc("envoyer_message", {
        p_conversation: conversationOuverte,
        p_texte: texte
    });

    if (error) {
        champ.value = texte;
        majBoutonEnvoyer();
        alert("⚠️ " + error.message);
        return;
    }

    await chargerMessages(true);
}

function quitterDiscussion() {
    clearInterval(minuteurMessages);
    conversationOuverte = null;
    signatureMessages = "";
    fermer("discussion");
}

function fermerDiscussion() {
    quitterDiscussion();
    ouvrirMessages();
}

function majBoutonEnvoyer() {
    $("bouton-envoyer").hidden = $("champ-message").value.trim() === "";
}

$("champ-message").addEventListener("input", majBoutonEnvoyer);

$("champ-message").addEventListener("keydown", function (e) {
    if (e.key === "Enter") envoyerMessage();
});

$("recherche-conversations").addEventListener("input", afficherConversations);

setInterval(() => {
    if (utilisateur && !document.hidden) majBadgeMessages();
}, 30000);

function ouvrirCommandesOnglet() {
    if (!utilisateur) { ouvrirAuth(); return; }

    if (role === "vendeur") {
        location.href = "vendeur.html";
        return;
    }

    ouvrirMesCommandes();
}

/* Ce qui dépend du type de compte (bouton ＋ et carte « Créer un statut » pour les vendeurs) */

function majInterfaceRole() {
    $("btn-creer").hidden = role !== "vendeur";
    afficherRangeeStatuts();
    afficherFil();
    majBadgeMessages();

    const idActuel = utilisateur ? utilisateur.id : null;

    if (idActuel !== dernierUtilisateurFil) {
        dernierUtilisateurFil = idActuel;
        chargerStatuts();
        chargerFil(false);
    }
}


/* ---------- Publications des boutiques (fil d'actualité) ---------- */

const REACTIONS_PUB = [
    { cle: "coeur", emoji: "❤️", libelle: "J'adore" },
    { cle: "pouce", emoji: "👍", libelle: "J'aime" },
    { cle: "feu", emoji: "🔥", libelle: "Top" },
    { cle: "amour", emoji: "😍", libelle: "Craquant" }
];

let pickerOuvert = null;

function fermerPicker() {
    if (pickerOuvert) {
        pickerOuvert.remove();
        pickerOuvert = null;
    }
}

document.addEventListener("pointerdown", e => {
    if (pickerOuvert && !e.target.closest(".pub-picker")) fermerPicker();
}, true);

function afficherPicker(p, conteneur) {
    fermerPicker();

    const picker = document.createElement("div");
    picker.className = "pub-picker";

    REACTIONS_PUB.forEach(r => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "picker-emoji";
        b.textContent = r.emoji;
        b.setAttribute("aria-label", r.libelle);
        b.addEventListener("click", () => {
            fermerPicker();
            if (p.ma_reaction !== r.cle) reagirPublication(p, r.cle);
        });
        picker.appendChild(b);
    });

    conteneur.appendChild(picker);
    pickerOuvert = picker;
}

let publications = [];
let chargementFil = false;
let filComplet = false;
let filEnErreur = false;

function tempsEcoule(iso) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return "il y a " + minutes + " min";
    if (minutes < 1440) return "il y a " + Math.floor(minutes / 60) + " h";
    return "il y a " + Math.floor(minutes / 1440) + " j";
}

async function chargerFil(suite) {
    if (chargementFil) return;

    if (filtreFil === "suivis" && !utilisateur) {
        publications = [];
        filComplet = true;
        filEnErreur = false;
        afficherFil();
        return;
    }

    chargementFil = true;

    const avant = suite && publications.length
        ? publications[publications.length - 1].created_at : null;

    const { data, error } = await sb.rpc("fil_publications", {
        p_avant: avant,
        p_limite: 10,
        p_suivis: filtreFil === "suivis"
    });

    chargementFil = false;
    filEnErreur = !!error || !Array.isArray(data);

    if (!filEnErreur) {
        if (!suite) publications = [];
        publications = publications.concat(data);
        filComplet = data.length < 10;
    }

    afficherFil();
}

function afficherFil() {
    const liste = $("liste-fil");
    liste.textContent = "";

    if (filEnErreur && publications.length === 0) {
        ligne(liste, "p", "⚠️ Impossible de charger les publications.").className = "fil-vide";
    } else if (publications.length === 0) {
        ligne(liste, "p", "Aucune publication pour le moment. Les boutiques partageront bientôt leurs nouveautés.").className = "fil-vide";
    }

    if (filtreFil === "suivis" && !utilisateur) {
        liste.textContent = "";
        ligne(liste, "p", "Connectez-vous pour voir les publications des boutiques que vous suivez.").className = "fil-vide";
    } else if (filtreFil === "suivis" && publications.length === 0 && !filEnErreur) {
        liste.textContent = "";
        ligne(liste, "p", "Aucune publication de vos boutiques suivies. Touchez « Suivre » sur une boutique pour la retrouver ici.").className = "fil-vide";
    }

    publications.forEach((p, n) => {
        liste.appendChild(creerCartePublication(p));

        /* Une publicité toutes les 3 publications */
        if (pubsActives.length && (n + 1) % 3 === 0) {
            liste.appendChild(creerCartePublicite(pubsActives[((n + 1) / 3 - 1) % pubsActives.length]));
        }
    });

    if (pubsActives.length && publications.length > 0 && publications.length < 3) {
        liste.appendChild(creerCartePublicite(pubsActives[0]));
    }

    $("plus-fil").hidden = filComplet || publications.length === 0;
}

function remplacerCarte(p) {
    const ancienne = document.getElementById("pub-" + p.id);
    if (ancienne) ancienne.replaceWith(creerCartePublication(p));
}

function creerCartePublication(p) {
    const carte = document.createElement("article");
    carte.className = "publication";
    carte.id = "pub-" + p.id;

    const allerBoutique = () => { location.href = "vitrine.html?b=" + encodeURIComponent(p.slug); };

    /* En-tête : boutique et date */

    const tete = document.createElement("div");
    tete.className = "pub-tete";

    const avatar = document.createElement("button");
    avatar.type = "button";
    avatar.className = "pub-avatar";
    avatar.setAttribute("aria-label", "Voir la boutique " + p.nom);
    avatar.addEventListener("click", allerBoutique);

    if (p.logo) {
        const logo = document.createElement("img");
        logo.src = urlPhoto(p.logo);
        logo.alt = "";
        avatar.appendChild(logo);
    } else {
        avatar.appendChild(iconeSvg("store-plein"));
    }

    const qui = document.createElement("div");
    qui.className = "pub-qui";

    const nom = document.createElement("button");
    nom.type = "button";
    nom.textContent = p.nom;
    if (p.verifiee) nom.appendChild(badgeVerifie());
    nom.addEventListener("click", allerBoutique);

    const date = document.createElement("small");
    date.textContent = tempsEcoule(p.created_at);

    qui.appendChild(nom);
    qui.appendChild(date);
    tete.appendChild(avatar);
    tete.appendChild(qui);

    if (!p.ma_boutique) {
        const suivre = document.createElement("button");
        suivre.type = "button";
        suivre.className = "pub-suivre" + (p.suivi ? " actif" : "");
        suivre.textContent = p.suivi ? "Suivi" : "Suivre";
        suivre.addEventListener("click", () => basculerSuivi(p.slug));
        tete.appendChild(suivre);
    }

    carte.appendChild(tete);

    /* Texte */

    if (p.texte) {
        const texte = document.createElement("p");
        texte.className = "pub-texte";
        texte.textContent = p.texte;
        carte.appendChild(texte);
    }

    /* Photos */

    if (Array.isArray(p.images) && p.images.length) {
        const grille = document.createElement("div");
        grille.className = "pub-images g" + p.images.length;

        p.images.forEach(chemin => {
            const img = document.createElement("img");
            img.src = urlPhoto(chemin);
            img.alt = "Photo de " + p.nom;
            img.loading = "lazy";
            grille.appendChild(img);
        });

        carte.appendChild(grille);
    }

    /* Résumé : réactions et commentaires */

    const total = Object.values(p.reactions || {}).reduce((s, n) => s + n, 0);
    const nbCommentaires = p.nb_commentaires || 0;

    if (total > 0 || nbCommentaires > 0) {
        const resume = document.createElement("div");
        resume.className = "pub-resume";

        const gauche = document.createElement("span");

        if (total > 0) {
            const emojis = REACTIONS_PUB
                .filter(r => (p.reactions[r.cle] || 0) > 0)
                .sort((x, y) => p.reactions[y.cle] - p.reactions[x.cle])
                .slice(0, 3)
                .map(r => r.emoji)
                .join("");

            gauche.textContent = emojis + " " + total;
        }

        resume.appendChild(gauche);

        if (nbCommentaires > 0) {
            const droite = document.createElement("button");
            droite.type = "button";
            droite.textContent = nbCommentaires + (nbCommentaires > 1 ? " commentaires" : " commentaire");
            droite.addEventListener("click", () => ouvrirCommentairesPub(p));
            resume.appendChild(droite);
        }

        carte.appendChild(resume);
    }

    /* Actions : J'aime (appui long = réactions), Commenter, Boutique */

    const actions = document.createElement("div");
    actions.className = "pub-actions";

    const mienne = REACTIONS_PUB.find(r => r.cle === p.ma_reaction);

    const jaime = document.createElement("button");
    jaime.type = "button";
    jaime.className = "pub-jaime" + (mienne ? " actif" : "");

    if (mienne && mienne.cle !== "pouce") {
        const emoji = document.createElement("span");
        emoji.className = "pub-emoji";
        emoji.textContent = mienne.emoji;
        jaime.appendChild(emoji);
    } else {
        jaime.appendChild(iconeSvg(mienne ? "thumb-plein" : "thumb-ligne"));
    }

    jaime.appendChild(document.createTextNode(mienne ? mienne.libelle : "J'aime"));

    let minuteurAppui = null;
    let appuiLong = false;

    jaime.addEventListener("pointerdown", () => {
        appuiLong = false;
        clearTimeout(minuteurAppui);
        minuteurAppui = setTimeout(() => {
            appuiLong = true;
            afficherPicker(p, actions);
        }, 420);
    });

    jaime.addEventListener("pointerup", () => {
        clearTimeout(minuteurAppui);
        if (!appuiLong) reagirPublication(p, p.ma_reaction || "pouce");
    });

    jaime.addEventListener("pointerleave", () => clearTimeout(minuteurAppui));
    jaime.addEventListener("pointercancel", () => clearTimeout(minuteurAppui));
    jaime.addEventListener("contextmenu", e => e.preventDefault());

    /* Activation au clavier */
    jaime.addEventListener("click", e => {
        if (e.detail === 0) reagirPublication(p, p.ma_reaction || "pouce");
    });

    const commenter = document.createElement("button");
    commenter.type = "button";
    commenter.appendChild(iconeSvg("chat-ligne"));
    commenter.appendChild(document.createTextNode("Commenter"));
    commenter.addEventListener("click", () => ouvrirCommentairesPub(p));

    const voir = document.createElement("button");
    voir.type = "button";
    voir.appendChild(iconeSvg("store-ligne"));
    voir.appendChild(document.createTextNode("Boutique"));
    voir.addEventListener("click", allerBoutique);

    const enregistrer = document.createElement("button");
    enregistrer.type = "button";
    enregistrer.className = "pub-enregistrer" + (p.enregistre ? " actif" : "");
    enregistrer.setAttribute("aria-label", p.enregistre ? "Retirer des enregistrements" : "Enregistrer");
    enregistrer.appendChild(iconeSvg(p.enregistre ? "bookmark-plein" : "bookmark-ligne"));
    enregistrer.addEventListener("click", () => basculerEnregistrement(p));

    actions.appendChild(jaime);
    actions.appendChild(commenter);
    actions.appendChild(voir);
    actions.appendChild(enregistrer);
    carte.appendChild(actions);

    return carte;
}

async function reagirPublication(p, cle) {
    if (!utilisateur) { ouvrirAuth(); return; }

    const avant = { reactions: Object.assign({}, p.reactions), ma: p.ma_reaction };

    /* Mise à jour immédiate, annulée en cas d'erreur */

    p.reactions = Object.assign({}, p.reactions);

    if (p.ma_reaction) {
        p.reactions[p.ma_reaction] = Math.max(0, (p.reactions[p.ma_reaction] || 0) - 1);
    }

    if (p.ma_reaction === cle) {
        p.ma_reaction = null;
    } else {
        p.reactions[cle] = (p.reactions[cle] || 0) + 1;
        p.ma_reaction = cle;
    }

    remplacerCarte(p);

    const { error } = await sb.rpc("reagir_publication", {
        p_publication: p.id,
        p_reaction: cle
    });

    if (error) {
        p.reactions = avant.reactions;
        p.ma_reaction = avant.ma;
        remplacerCarte(p);
        alert("⚠️ " + error.message);
    }
}


/* ---------- Filtre du fil : Pour vous / Suivis ---------- */

let filtreFil = "tous";
let dernierUtilisateurFil = null;

function changerFiltreFil(filtre) {
    filtreFil = filtre;

    document.querySelectorAll("#onglet-actualites .fil-onglets button").forEach(b => {
        const actif = b.getAttribute("data-filtre") === filtre;
        b.classList.toggle("actif", actif);
        b.setAttribute("aria-pressed", actif ? "true" : "false");
    });

    chargerStatuts();
    chargerFil(false);
}


/* ---------- Suivre une boutique / enregistrer une publication ---------- */

async function basculerSuivi(slug) {
    if (!utilisateur) { ouvrirAuth(); return; }

    const { data, error } = await sb.rpc("basculer_abonnement", { p_slug: slug });

    if (error) { alert("⚠️ " + error.message); return; }

    publications.forEach(p => {
        if (p.slug === slug) {
            p.suivi = data === true;
            remplacerCarte(p);
        }
    });
}

async function basculerEnregistrement(p) {
    if (!utilisateur) { ouvrirAuth(); return; }

    const { data, error } = await sb.rpc("basculer_enregistrement_publication", {
        p_publication: p.id
    });

    if (error) { alert("⚠️ " + error.message); return; }

    p.enregistre = data === true;
    remplacerCarte(p);
}


/* ---------- Publicités (étiquette « Sponsorisé ») ---------- */

let pubsActives = [];
const pubsVues = new Set();

async function chargerPublicites() {
    const { data, error } = await sb.rpc("publicites_actives");

    pubsActives = !error && Array.isArray(data) ? data : [];
    afficherFil();
    afficherBannieres();
}

function creerCartePublicite(ad) {
    const carte = document.createElement("article");
    carte.className = "publication sponsorisee";

    const allerBoutique = async () => {
        try {
            await Promise.race([
                sb.rpc("compter_publicite", { p_id: ad.id, p_type: "clic" }),
                new Promise(resolve => setTimeout(resolve, 600))
            ]);
        } catch (e) {}

        location.href = "vitrine.html?b=" + encodeURIComponent(ad.slug);
    };

    if (!pubsVues.has(ad.id)) {
        pubsVues.add(ad.id);
        sb.rpc("compter_publicite", { p_id: ad.id, p_type: "vue" }).then(() => {});
    }

    const tete = document.createElement("div");
    tete.className = "pub-tete";

    const avatar = document.createElement("button");
    avatar.type = "button";
    avatar.className = "pub-avatar";
    avatar.setAttribute("aria-label", "Voir la boutique " + ad.nom);
    avatar.addEventListener("click", allerBoutique);

    if (ad.logo) {
        const logo = document.createElement("img");
        logo.src = urlPhoto(ad.logo);
        logo.alt = "";
        avatar.appendChild(logo);
    } else {
        avatar.appendChild(iconeSvg("store-plein"));
    }

    const qui = document.createElement("div");
    qui.className = "pub-qui";

    const nom = document.createElement("button");
    nom.type = "button";
    nom.textContent = ad.nom;
    if (ad.verifiee) nom.appendChild(badgeVerifie());
    nom.addEventListener("click", allerBoutique);

    const sponso = document.createElement("small");
    sponso.textContent = "Sponsorisé";

    qui.appendChild(nom);
    qui.appendChild(sponso);
    tete.appendChild(avatar);
    tete.appendChild(qui);
    carte.appendChild(tete);

    const titre = document.createElement("p");
    titre.className = "pub-texte";
    const fort = document.createElement("strong");
    fort.textContent = ad.titre;
    titre.appendChild(fort);
    carte.appendChild(titre);

    if (ad.texte) {
        const texte = document.createElement("p");
        texte.className = "pub-texte";
        texte.textContent = ad.texte;
        carte.appendChild(texte);
    }

    if (ad.image_path) {
        const grille = document.createElement("div");
        grille.className = "pub-images g1";

        const img = document.createElement("img");
        img.src = urlPhoto(ad.image_path);
        img.alt = ad.titre;
        img.loading = "lazy";
        img.addEventListener("click", allerBoutique);
        grille.appendChild(img);
        carte.appendChild(grille);
    }

    const zone = document.createElement("div");
    zone.className = "pub-voir";

    const voir = document.createElement("button");
    voir.type = "button";
    voir.className = "bouton-principal";
    voir.textContent = "Voir la boutique";
    voir.addEventListener("click", allerBoutique);

    zone.appendChild(voir);
    carte.appendChild(zone);

    return carte;
}


/* ---------- Boutiques suivies (page) ---------- */

async function ouvrirSuivis() {
    if (!utilisateur) { ouvrirAuth(); return; }

    ouvrir("suivis");
    await chargerSuivis();
}

async function chargerSuivis() {
    const liste = $("liste-suivis");
    const { data, error } = await sb.rpc("mes_abonnements");

    liste.textContent = "";

    if (error || !Array.isArray(data)) {
        ligne(liste, "p", "⚠️ Impossible de charger vos boutiques suivies.").className = "fil-vide";
        return;
    }

    if (data.length === 0) {
        ligne(liste, "p", "Vous ne suivez aucune boutique. Ouvrez une boutique et touchez « Suivre ».").className = "fil-vide";
        return;
    }

    data.forEach(b => {
        const rangee = document.createElement("div");
        rangee.className = "rangee-suivi";

        const principal = document.createElement("button");
        principal.type = "button";
        principal.className = "conversation";

        const corps = document.createElement("div");
        corps.className = "conversation-corps";
        corps.appendChild(nouvelElement("strong", "", b.nom));
        corps.appendChild(nouvelElement("p", "", b.nb_produits + (b.nb_produits > 1 ? " produits" : " produit")));

        principal.appendChild(avatarConversation(b.logo, b.nom));
        principal.appendChild(corps);
        principal.addEventListener("click", () => { location.href = "vitrine.html?b=" + encodeURIComponent(b.slug); });

        const retirer = document.createElement("button");
        retirer.type = "button";
        retirer.className = "bouton-petit";
        retirer.textContent = "Ne plus suivre";
        retirer.addEventListener("click", async () => {
            const { error: erreur } = await sb.rpc("basculer_abonnement", { p_slug: b.slug });
            if (erreur) { alert("⚠️ " + erreur.message); return; }

            publications.forEach(p => { if (p.slug === b.slug) p.suivi = false; });
            await chargerSuivis();
        });

        rangee.appendChild(principal);
        rangee.appendChild(retirer);
        liste.appendChild(rangee);
    });
}


/* ---------- Enregistrements (page) ---------- */

async function ouvrirEnregistrements() {
    if (!utilisateur) { ouvrirAuth(); return; }

    ouvrir("enregistrements");
    await chargerEnregistrements();
}

async function chargerEnregistrements() {
    const corps = $("corps-enregistrements");
    const { data, error } = await sb.rpc("mes_enregistrements");

    corps.textContent = "";

    if (error || !data) {
        ligne(corps, "p", "⚠️ Impossible de charger vos enregistrements.").className = "fil-vide";
        return;
    }

    const pubs = data.publications || [];
    const produits = data.produits || [];

    if (pubs.length === 0 && produits.length === 0) {
        ligne(corps, "p", "Rien d'enregistré pour le moment. Touchez l'icône marque-page sur une publication ou un produit.").className = "fil-vide";
        return;
    }

    const actions = (slug, retirer) => {
        const zone = document.createElement("div");
        zone.className = "actions-produit";

        const voir = document.createElement("button");
        voir.type = "button";
        voir.textContent = "Voir la boutique";
        voir.addEventListener("click", () => { location.href = "vitrine.html?b=" + encodeURIComponent(slug); });

        const sup = document.createElement("button");
        sup.type = "button";
        sup.textContent = "Retirer";
        sup.addEventListener("click", retirer);

        zone.appendChild(voir);
        zone.appendChild(sup);
        return zone;
    };

    if (pubs.length) {
        corps.appendChild(nouvelElement("h3", "menu-titre", "Publications"));

        pubs.forEach(p => {
            const carte = nouvelElement("div", "produit-item");
            carte.appendChild(nouvelElement("h3", "", p.nom));

            if (p.images && p.images.length) {
                const img = document.createElement("img");
                img.src = urlPhoto(p.images[0]);
                img.alt = "Publication de " + p.nom;
                img.className = "photo-statut";
                img.loading = "lazy";
                carte.appendChild(img);
            }

            if (p.texte) {
                carte.appendChild(nouvelElement("p", "", p.texte.length > 140 ? p.texte.slice(0, 140) + "…" : p.texte));
            }

            carte.appendChild(actions(p.slug, async () => {
                const { error: erreur } = await sb.rpc("basculer_enregistrement_publication", { p_publication: p.id });
                if (erreur) { alert("⚠️ " + erreur.message); return; }

                publications.forEach(x => { if (x.id === p.id) { x.enregistre = false; remplacerCarte(x); } });
                await chargerEnregistrements();
            }));

            corps.appendChild(carte);
        });
    }

    if (produits.length) {
        corps.appendChild(nouvelElement("h3", "menu-titre", "Produits"));

        produits.forEach(pr => {
            const carte = nouvelElement("div", "produit-item");

            if (pr.image_path) {
                const img = document.createElement("img");
                img.src = urlPhoto(pr.image_path);
                img.alt = pr.nom;
                img.className = "photo-statut";
                img.loading = "lazy";
                carte.appendChild(img);
            }

            carte.appendChild(nouvelElement("h3", "", pr.nom));
            carte.appendChild(nouvelElement("p", "", pr.boutique));
            carte.appendChild(nouvelElement("strong", "produit-prix", montant(pr.prix, pr.devise)));

            carte.appendChild(actions(pr.slug, async () => {
                const { error: erreur } = await sb.rpc("basculer_enregistrement_produit", { p_produit: pr.id });
                if (erreur) { alert("⚠️ " + erreur.message); return; }

                await chargerEnregistrements();
            }));

            corps.appendChild(carte);
        });
    }
}


/* ---------- Commentaires d'une publication ---------- */

let publicationOuverte = null;

async function ouvrirCommentairesPub(p) {
    publicationOuverte = p;
    $("champ-commentaire-pub").value = "";
    ouvrir("commentaires-pub");
    await chargerCommentairesPub();
}

async function chargerCommentairesPub() {
    const liste = $("liste-commentaires-pub");
    const p = publicationOuverte;
    if (!p) return;

    const { data, error } = await sb.rpc("publication_commentaires", {
        p_publication: p.id
    });

    liste.textContent = "";

    if (error || !Array.isArray(data)) {
        ligne(liste, "p", "⚠️ Impossible de charger les commentaires.").className = "fil-vide";
        return;
    }

    if (data.length === 0) {
        ligne(liste, "p", "Aucun commentaire. Soyez le premier !").className = "fil-vide";
    }

    data.forEach(c => {
        const ligneCommentaire = document.createElement("div");
        ligneCommentaire.className = "commentaire-pub";

        const haut = document.createElement("div");
        haut.className = "commentaire-haut";

        const auteur = document.createElement("strong");
        auteur.textContent = c.auteur;
        haut.appendChild(auteur);

        if (c.par_boutique) {
            const etiquette = document.createElement("span");
            etiquette.className = "etiquette-boutique";
            etiquette.textContent = "🏪 Boutique";
            haut.appendChild(etiquette);
        }

        const quand = document.createElement("small");
        quand.textContent = tempsEcoule(c.created_at);
        haut.appendChild(quand);

        if (c.peut_supprimer) {
            const sup = document.createElement("button");
            sup.type = "button";
            sup.textContent = "🗑️";
            sup.setAttribute("aria-label", "Supprimer ce commentaire");
            sup.addEventListener("click", () => supprimerCommentairePub(c.id));
            haut.appendChild(sup);
        }

        const texte = document.createElement("p");
        texte.textContent = c.texte;

        ligneCommentaire.appendChild(haut);
        ligneCommentaire.appendChild(texte);
        liste.appendChild(ligneCommentaire);
    });

    if (data.length < 50) p.nb_commentaires = data.length;
    remplacerCarte(p);

    liste.scrollTop = liste.scrollHeight;
}

async function envoyerCommentairePub() {
    if (!utilisateur) {
        fermer("commentaires-pub");
        ouvrirAuth();
        return;
    }

    const champ = $("champ-commentaire-pub");
    const texte = champ.value.trim();

    if (!texte || !publicationOuverte) return;

    const { error } = await sb.rpc("commenter_publication", {
        p_publication: publicationOuverte.id,
        p_texte: texte
    });

    if (error) { alert("⚠️ " + error.message); return; }

    champ.value = "";
    await chargerCommentairesPub();
}

async function supprimerCommentairePub(id) {
    if (!confirm("Supprimer ce commentaire ?")) return;

    const { error } = await sb.rpc("supprimer_commentaire_publication", { p_id: id });

    if (error) { alert("⚠️ " + error.message); return; }

    await chargerCommentairesPub();
}

$("champ-commentaire-pub").addEventListener("keydown", function (e) {
    if (e.key === "Enter") envoyerCommentairePub();
});


/* ---------- Nouveaux arrivages (statuts) ---------- */

let groupesStatuts = [];

function afficherRangeeStatuts() {
    const zone = $("zone-statuts");
    const rangee = $("rangee-statuts");
    const vendeur = role === "vendeur";

    rangee.textContent = "";

    if (!vendeur && groupesStatuts.length === 0) {
        zone.hidden = true;
        return;
    }

    /* Première carte : créer un statut (vendeurs) */

    if (vendeur) {
        const creer = document.createElement("button");
        creer.type = "button";
        creer.className = "story-carte story-creer";
        creer.setAttribute("aria-label", "Créer un statut");

        const haut = document.createElement("div");
        haut.className = "story-haut";
        haut.appendChild(iconeSvg("store-plein"));

        const plus = document.createElement("div");
        plus.className = "story-plus";
        plus.appendChild(iconeSvg("add"));

        const texte = document.createElement("span");
        texte.className = "story-texte";
        texte.textContent = "Créer un statut";

        creer.appendChild(haut);
        creer.appendChild(plus);
        creer.appendChild(texte);
        creer.addEventListener("click", () => { location.href = "vendeur.html?statut=1"; });

        rangee.appendChild(creer);
    }

    groupesStatuts.forEach((groupe, n) => {
        const carte = document.createElement("button");
        carte.type = "button";
        carte.className = "story-carte";
        carte.setAttribute("aria-label", "Nouveaux arrivages de " + groupe.nom);

        if (window.statutsToutVus && window.statutsToutVus(groupe)) {
            carte.classList.add("vu");
        }

        const fond = document.createElement("img");
        fond.className = "story-fond";
        fond.src = urlPhoto(groupe.statuts[groupe.statuts.length - 1].image_path);
        fond.alt = "";
        fond.loading = "lazy";

        const avatar = document.createElement("div");
        avatar.className = "story-avatar";

        if (groupe.logo) {
            const logo = document.createElement("img");
            logo.src = urlPhoto(groupe.logo);
            logo.alt = "";
            avatar.appendChild(logo);
        } else {
            avatar.appendChild(iconeSvg("store-plein"));
        }

        const nom = document.createElement("span");
        nom.className = "story-nom";
        nom.textContent = groupe.nom;

        carte.appendChild(fond);
        carte.appendChild(avatar);
        carte.appendChild(nom);

        carte.addEventListener("click", () => {
            window.ouvrirStatuts(groupesStatuts, n, {
                urlPhoto: urlPhoto,
                voirBoutique: true,
                quandFerme: afficherRangeeStatuts,
                rpc: (nomFonction, args) => sb.rpc(nomFonction, args),
                connecte: () => !!utilisateur,
                demanderConnexion: ouvrirAuth
            });
        });

        rangee.appendChild(carte);
    });

    zone.hidden = false;
}

async function chargerStatuts() {
    const { data, error } = await sb.rpc("marche_statuts", { p_suivis: filtreFil === "suivis" });

    groupesStatuts = !error && Array.isArray(data) ? data : [];
    afficherRangeeStatuts();
}


async function chargerBoutiques() {
    const terme = $("recherche").value.trim().slice(0, 60);
    const zone = $("liste-boutiques");

    const { data, error } = await sb.rpc("marche_boutiques", {
        p_recherche: terme || null,
        p_categorie: categorieActive || null
    });

    zone.innerHTML = "";

    if (error) {
        ligne(zone, "p", "⚠️ Impossible de charger les boutiques. Réessayez.");
        return;
    }

    if (!data || data.length === 0) {
        const filtre = terme || categorieActive;
        ligne(zone, "p", filtre ? "Aucune boutique trouvée pour cette recherche." : "Aucune boutique pour le moment.");
        return;
    }

    data.forEach(b => {
        const carte = document.createElement("a");
        carte.className = "produit-item carte-boutique";
        carte.href = "vitrine.html?b=" + encodeURIComponent(b.slug);

        const cheminPhoto = b.logo || b.apercu;

        if (cheminPhoto) {
            const photo = document.createElement("img");
            photo.src = urlPhoto(cheminPhoto);
            photo.alt = b.nom;
            photo.className = "photo-boutique";
            photo.loading = "lazy";
            carte.appendChild(photo);
        } else {
            ligne(carte, "div", "🏪").className = "sans-photo";
        }

        const titre = document.createElement("h3");
        titre.textContent = b.nom;
        if (b.verifiee) titre.appendChild(badgeVerifie());
        carte.appendChild(titre);

        if (b.nb_avis > 0) carte.appendChild(noteBoutique(b.note_moyenne, b.nb_avis));

        if (b.description) ligne(carte, "p", b.description);
        ligne(carte, "p", "📦 " + b.nb + (b.nb > 1 ? " produits" : " produit"));
        if (Array.isArray(b.categories) && b.categories.length) {
            ligne(carte, "p", "🏷️ " + b.categories.join(" · ")).className = "categories-boutique";
        }

        zone.appendChild(carte);
    });
}

/* ---------- Accueil façon marketplace : catégories, produits, boutiques ---------- */

let vueAccueil = "produits";
let jetonProduits = 0;
let produitsCharges = 0;

function badgeVerifie() {
    const icone = iconeSvg("verified");
    icone.setAttribute("class", "ic badge-verifie");
    icone.setAttribute("aria-label", "Boutique vérifiée");
    return icone;
}

function texteNote(note) {
    return String(note).replace(".", ",");
}

function noteBoutique(note, nb) {
    const zone = document.createElement("div");
    zone.className = "produit-note";
    zone.appendChild(iconeSvg("star-plein"));
    zone.appendChild(document.createTextNode(texteNote(note) + " (" + nb + ")"));
    return zone;
}

function creerCarteProduit(pr) {
    const carte = document.createElement("a");
    carte.className = "produit-carte";
    carte.href = "vitrine.html?b=" + encodeURIComponent(pr.slug) + "&p=" + encodeURIComponent(pr.id);

    const vignette = document.createElement("div");
    vignette.className = "produit-vignette";

    if (pr.image_path) {
        const img = document.createElement("img");
        img.src = urlPhoto(pr.image_path);
        img.alt = pr.nom;
        img.loading = "lazy";
        vignette.appendChild(img);
    } else {
        vignette.appendChild(iconeSvg("box"));
    }

    if (pr.stock === 0) {
        vignette.appendChild(nouvelElement("span", "etiquette-rupture", "Rupture de stock"));
    }

    carte.appendChild(vignette);
    carte.appendChild(nouvelElement("p", "produit-carte-nom", pr.nom));
    carte.appendChild(nouvelElement("strong", "produit-carte-prix", montant(pr.prix, pr.devise)));

    const boutique = document.createElement("div");
    boutique.className = "produit-boutique";
    boutique.appendChild(nouvelElement("span", "", pr.boutique));
    if (pr.verifiee) boutique.appendChild(badgeVerifie());
    carte.appendChild(boutique);

    if (pr.nb_avis > 0) carte.appendChild(noteBoutique(pr.note_moyenne, pr.nb_avis));

    return carte;
}

async function chargerProduits(reset) {
    const jeton = ++jetonProduits;

    if (reset) produitsCharges = 0;

    const terme = $("recherche").value.trim().slice(0, 60);
    const zone = $("grille-produits");

    const { data, error } = await sb.rpc("marche_produits", {
        p_recherche: terme || null,
        p_categorie: categorieActive || null,
        p_offset: produitsCharges,
        p_limite: 20
    });

    if (jeton !== jetonProduits) return;

    if (reset) zone.textContent = "";

    if (error || !Array.isArray(data)) {
        if (reset) ligne(zone, "p", "⚠️ Impossible de charger les produits. Réessayez.").className = "fil-vide";
        $("plus-produits").hidden = true;
        return;
    }

    data.forEach(pr => zone.appendChild(creerCarteProduit(pr)));
    produitsCharges += data.length;

    if (reset && data.length === 0) {
        ligne(zone, "p", terme || categorieActive
            ? "Aucun produit trouvé pour cette recherche."
            : "Aucun produit pour le moment.").className = "fil-vide";
    }

    $("plus-produits").hidden = data.length < 20 || produitsCharges === 0;
}

function rafraichirAccueil() {
    if (vueAccueil === "boutiques") chargerBoutiques();
    else chargerProduits(true);
}

function choisirVue(vue) {
    vueAccueil = vue;

    $("vue-produits").hidden = vue !== "produits";
    $("vue-boutiques").hidden = vue !== "boutiques";

    document.querySelectorAll("#vue-onglets button").forEach(b => {
        const actif = b.getAttribute("data-vue") === vue;
        b.classList.toggle("actif", actif);
        b.setAttribute("aria-pressed", actif ? "true" : "false");
    });

    rafraichirAccueil();
}

function ouvrirBoutiques() {
    afficherOnglet("accueil");
    choisirVue("boutiques");
}

$("categories").addEventListener("click", function (e) {
    const bouton = e.target.closest(".categorie");
    if (!bouton) return;

    categorieActive = bouton.getAttribute("data-cat") || "";

    this.querySelectorAll(".categorie").forEach(b => {
        const actif = b === bouton;
        b.classList.toggle("actif", actif);
        b.setAttribute("aria-pressed", actif ? "true" : "false");
    });

    rafraichirAccueil();
});

$("vue-onglets").addEventListener("click", function (e) {
    const bouton = e.target.closest("button");
    if (bouton) choisirVue(bouton.getAttribute("data-vue"));
});

$("recherche").addEventListener("input", function () {
    clearTimeout(minuteurRecherche);
    minuteurRecherche = setTimeout(rafraichirAccueil, 300);
});

$("recherche").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;

    clearTimeout(minuteurRecherche);
    rafraichirAccueil();
    this.blur();
});

$("bouton-recherche").addEventListener("click", () => {
    clearTimeout(minuteurRecherche);
    rafraichirAccueil();
});

$("plus-produits").addEventListener("click", () => chargerProduits(false));


/* Bannières : les publicités en cours, en haut de l'accueil */

async function allerPublicite(ad) {
    try {
        await Promise.race([
            sb.rpc("compter_publicite", { p_id: ad.id, p_type: "clic" }),
            new Promise(resolve => setTimeout(resolve, 600))
        ]);
    } catch (e) {}

    location.href = "vitrine.html?b=" + encodeURIComponent(ad.slug);
}

function afficherBannieres() {
    const zone = $("zone-bannieres");
    const rangee = $("rangee-bannieres");

    rangee.textContent = "";

    if (pubsActives.length === 0) {
        zone.hidden = true;
        return;
    }

    pubsActives.forEach(ad => {
        const banniere = document.createElement("button");
        banniere.type = "button";
        banniere.className = "banniere";
        banniere.setAttribute("aria-label", ad.titre + " - " + ad.nom);

        if (ad.image_path) {
            const img = document.createElement("img");
            img.src = urlPhoto(ad.image_path);
            img.alt = "";
            img.loading = "lazy";
            banniere.appendChild(img);
        }

        const texte = document.createElement("div");
        texte.className = "banniere-texte";
        texte.appendChild(nouvelElement("small", "", "Sponsorisé"));
        texte.appendChild(nouvelElement("strong", "", ad.titre));
        texte.appendChild(nouvelElement("span", "", ad.nom));
        banniere.appendChild(texte);

        banniere.addEventListener("click", () => allerPublicite(ad));

        if (!pubsVues.has(ad.id)) {
            pubsVues.add(ad.id);
            sb.rpc("compter_publicite", { p_id: ad.id, p_type: "vue" }).then(() => {});
        }

        rangee.appendChild(banniere);
    });

    zone.hidden = false;
}


/* ---------- Connexion acheteur ---------- */

function erreurAuth(message, succes) {
    const zone = $("a-erreur");
    zone.textContent = message || "";
    zone.style.color = succes ? "var(--succes)" : "";
}

function ouvrirAuth() { ouvrir("auth"); }

function basculerAuth() {
    modeInscription = !modeInscription;

    $("a-champ-nom").hidden = !modeInscription;
    $("a-champ-confirm").hidden = !modeInscription;

    $("a-titre").textContent = modeInscription ? "Créer un compte acheteur" : "Connexion acheteur";
    $("a-sous").textContent = modeInscription
        ? "Quelques infos pour commander facilement."
        : "Connectez-vous pour commander.";
    $("a-bouton").textContent = modeInscription ? "Créer mon compte" : "Se connecter";
    $("a-bascule").textContent = modeInscription ? "J'ai déjà un compte" : "Créer un compte acheteur";
    $("a-mdp").autocomplete = modeInscription ? "new-password" : "current-password";

    erreurAuth("");
}

function motDePasseFort(m) {
    return m.length >= 8 && /[A-Za-z]/.test(m) && /\d/.test(m);
}

function traduire(e) {
    const m = (e && e.message) || "";

    if (/invalid login/i.test(m)) return "Email ou mot de passe incorrect.";
    if (/not confirmed/i.test(m)) return "Confirmez d'abord votre email (vérifiez votre boîte de réception).";
    if (e && (e.status === 429 || /rate limit/i.test(m))) return "Trop de tentatives. Réessayez dans quelques minutes.";
    if (/password/i.test(m)) return "Mot de passe refusé : choisissez-en un plus solide.";

    return "Une erreur est survenue. Réessayez.";
}

async function validerAuth() {
    const email = $("a-email").value.trim().toLowerCase();
    const mdp = $("a-mdp").value;
    const nom = $("a-nom").value.trim();

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) {
        erreurAuth("Entrez une adresse email valide.");
        return;
    }

    if (mdp.length > 200) { erreurAuth("Mot de passe trop long."); return; }

    if (modeInscription) {
        if (nom === "" || nom.length > 60) {
            erreurAuth("Entrez votre nom (60 caractères maximum).");
            return;
        }

        if (!motDePasseFort(mdp)) {
            erreurAuth("Le mot de passe doit avoir 8 caractères minimum, avec au moins une lettre et un chiffre.");
            return;
        }

        if (mdp !== $("a-confirm").value) {
            erreurAuth("Les deux mots de passe ne sont pas identiques.");
            return;
        }
    }

    const bt = $("a-bouton");
    bt.disabled = true;

    try {
        if (modeInscription) {
            const { data, error } = await sb.auth.signUp({
                email: email,
                password: mdp,
                options: {
                    data: { nom: nom, role: "acheteur" },
                    emailRedirectTo: location.origin + location.pathname + location.search
                }
            });

            if (error) { erreurAuth(traduire(error)); return; }

            if (!data.session) {
                basculerAuth();
                erreurAuth("✅ Compte créé. Confirmez votre email, puis connectez-vous.", true);
            }
        } else {
            const { error } = await sb.auth.signInWithPassword({
                email: email,
                password: mdp
            });

            if (error) erreurAuth(traduire(error));
        }
    } finally {
        bt.disabled = false;
    }
}


/* ---------- Session ---------- */

async function ouvrirSession(user) {
    utilisateur = user;

    const { data: profil } = await sb.from("profils")
        .select("role,nom").maybeSingle();

    role = profil ? profil.role : "acheteur";
    nomProfil = profil ? profil.nom : "";
    majInterfaceRole();

    ["a-nom", "a-email", "a-mdp", "a-confirm"].forEach(id => { $(id).value = ""; });
    erreurAuth("");
    if (modeInscription) basculerAuth();
    fermer("auth");

    /* Retour vers la boutique où l'achat a commencé */

    /* Vendeur qui vient de confirmer son email → son espace */

    if (role === "vendeur" && viensDeConfirmation) {
        location.replace("vendeur.html");
        return;
    }

    /* Arrivée depuis une vitrine après une commande en mobile money */

    const aPayer = params.get("payer");

    if (role === "acheteur" && aPayer && /^[0-9a-f-]{36}$/i.test(aPayer)) {
        history.replaceState(null, "", location.pathname);
        ouvrirPaiement(aPayer);
        return;
    }

    /* Arrivée depuis une vitrine (« Discuter ») ou depuis l'espace vendeur (« Messages ») */

    const aDiscuter = params.get("conversation");

    if (aDiscuter && /^[0-9a-f-]{36}$/i.test(aDiscuter)) {
        history.replaceState(null, "", location.pathname);
        ouvrirDiscussion(aDiscuter);
        return;
    }

    if (params.get("messages")) {
        history.replaceState(null, "", location.pathname);
        ouvrirMessages();
        return;
    }

    const retour = params.get("retour");

    if (role === "acheteur" && retour &&
        /^vitrine\.html\?b=[a-z0-9-]{3,60}$/.test(retour)) {
        location.href = retour;
    }
}

/* ---------- Compte : informations du profil seulement ---------- */

function initialeProfil() {
    return ((nomProfil || (utilisateur && utilisateur.email) || "?").trim().charAt(0) || "?").toUpperCase();
}

function libelleRole() {
    return role === "vendeur" ? "Compte vendeur" : "Compte acheteur";
}

function ouvrirCompte() {
    if (!utilisateur) { ouvrirAuth(); return; }

    $("c-initiale").textContent = initialeProfil();
    $("c-nom").textContent = nomProfil || "Mon profil";
    $("c-role").textContent = libelleRole();
    $("c-email").textContent = utilisateur.email || "-";
    $("c-depuis").textContent = utilisateur.created_at
        ? new Date(utilisateur.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
        : "-";

    ouvrir("compte");
}


/* ---------- Menu (☰) façon Facebook ---------- */

function nouvelElement(tag, classe, texte) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte) e.textContent = texte;
    return e;
}

function actionMenu(fonction) {
    return () => { fermer("menu"); fonction(); };
}

function ligneMenu(nomIcone, texte, fonction) {
    const b = nouvelElement("button", "menu-ligne");
    b.type = "button";
    b.appendChild(iconeSvg(nomIcone));
    b.appendChild(nouvelElement("span", "", texte));
    b.addEventListener("click", actionMenu(fonction));
    return b;
}

function raccourciMenu(nomIcone, texte, fonction) {
    const b = nouvelElement("button", "raccourci");
    b.type = "button";
    b.appendChild(iconeSvg(nomIcone));
    b.appendChild(nouvelElement("span", "", texte));
    b.addEventListener("click", actionMenu(fonction));
    return b;
}

function sectionMenu(nomIcone, titre, remplir) {
    const section = nouvelElement("details", "menu-section");
    const resume = nouvelElement("summary");

    resume.appendChild(iconeSvg(nomIcone));
    resume.appendChild(nouvelElement("span", "", titre));

    const fleche = iconeSvg("chevron");
    fleche.setAttribute("class", "ic chevron");
    resume.appendChild(fleche);

    const contenu = nouvelElement("div", "menu-section-contenu");
    remplir(contenu);

    section.appendChild(resume);
    section.appendChild(contenu);
    return section;
}

function construireMenu() {
    const corps = $("menu-corps");
    corps.textContent = "";

    const vendeur = role === "vendeur";

    /* Profil */

    const profil = nouvelElement("button", "menu-profil");
    profil.type = "button";

    const avatar = nouvelElement("div", "profil-avatar");
    const infos = nouvelElement("div", "menu-profil-infos");

    if (utilisateur) {
        avatar.textContent = initialeProfil();
        infos.appendChild(nouvelElement("strong", "", nomProfil || utilisateur.email || "Mon profil"));
        infos.appendChild(nouvelElement("small", "", libelleRole()));
        profil.addEventListener("click", actionMenu(ouvrirCompte));
    } else {
        avatar.appendChild(iconeSvg("person-plein"));
        infos.appendChild(nouvelElement("strong", "", "Se connecter"));
        infos.appendChild(nouvelElement("small", "", "Connectez-vous ou créez un compte"));
        profil.addEventListener("click", actionMenu(ouvrirAuth));
    }

    profil.appendChild(avatar);
    profil.appendChild(infos);
    corps.appendChild(profil);

    /* Raccourcis */

    corps.appendChild(nouvelElement("h3", "menu-titre", "Vos raccourcis"));

    const raccourcis = nouvelElement("div", "menu-raccourcis");

    if (vendeur) {
        raccourcis.appendChild(raccourciMenu("store-plein", "Ma boutique", () => { location.href = "vendeur.html"; }));
        raccourcis.appendChild(raccourciMenu("note", "Publier", () => { location.href = "vendeur.html?publier=1"; }));
        raccourcis.appendChild(raccourciMenu("megaphone", "Arrivages", () => { location.href = "vendeur.html?statut=1"; }));
        raccourcis.appendChild(raccourciMenu("chat-ligne", "Messages", ouvrirMessages));
    } else {
        raccourcis.appendChild(raccourciMenu("store-ligne", "Boutiques", () => ouvrirBoutiques()));
        raccourcis.appendChild(raccourciMenu("cart-ligne", "Commandes", ouvrirCommandesOnglet));
        raccourcis.appendChild(raccourciMenu("chat-ligne", "Messages", ouvrirMessages));
    }

    corps.appendChild(raccourcis);

    /* Fonctions */

    const liste = nouvelElement("div", "menu-liste");

    if (vendeur) {
        liste.appendChild(ligneMenu("stats", "Tableau de bord vendeur", () => { location.href = "vendeur.html"; }));
        liste.appendChild(ligneMenu("store-ligne", "Place de marché", () => ouvrirBoutiques()));
    } else {
        liste.appendChild(ligneMenu("store-ligne", "Toutes les boutiques", () => ouvrirBoutiques()));
        liste.appendChild(ligneMenu("cart-ligne", "Mes commandes", ouvrirCommandesOnglet));
    }

    liste.appendChild(ligneMenu("chat-ligne", "Messages", ouvrirMessages));
    liste.appendChild(ligneMenu("group", "Boutiques suivies", ouvrirSuivis));
    liste.appendChild(ligneMenu("bookmark-ligne", "Enregistrements", ouvrirEnregistrements));

    if (vendeur) {
        liste.appendChild(ligneMenu("trending", "Publicité", () => { location.href = "vendeur.html?pub=1"; }));
    }

    corps.appendChild(liste);

    /* Entrée réservée à l'administrateur de Dukani */
    if (utilisateur) {
        sb.rpc("est_admin").then(({ data }) => {
            if (data === true && $("menu").classList.contains("active")) {
                liste.appendChild(ligneMenu("settings", "Administration", () => { location.href = "admin.html"; }));
            }
        });
    }

    /* Voir plus */

    const plus = nouvelElement("div", "menu-liste");
    plus.hidden = true;
    plus.appendChild(ligneMenu("home-ligne", "Fil d'actualité", () => afficherOnglet("actualites")));
    plus.appendChild(ligneMenu("megaphone", "Nouveaux arrivages", () => afficherOnglet("actualites")));
    plus.appendChild(ligneMenu("search", "Rechercher", ouvrirRecherche));

    const voirPlus = nouvelElement("button", "menu-voir-plus", "Voir plus");
    voirPlus.type = "button";
    voirPlus.addEventListener("click", () => {
        plus.hidden = !plus.hidden;
        voirPlus.textContent = plus.hidden ? "Voir plus" : "Voir moins";
    });

    corps.appendChild(plus);
    corps.appendChild(voirPlus);

    /* Aide et assistance */

    corps.appendChild(sectionMenu("help", "Aide et assistance", zone => {
        [
            ["Comment passer une commande ?",
                "Ouvrez une boutique, choisissez un produit, touchez Commander puis indiquez votre nom et votre téléphone. Il faut un compte acheteur."],
            ["Comment payer ?",
                "À la livraison, ou par mobile money si la boutique l'accepte : vous envoyez le montant au numéro indiqué puis vous saisissez la référence de la transaction. Le vendeur confirme ensuite votre paiement."],
            ["Comment écrire à une boutique ?",
                "Sur la vitrine de la boutique, touchez « Discuter avec la boutique ». Vos discussions se retrouvent dans l'onglet Messages."],
            ["Comment vendre sur Dukani ?",
                "Créez un compte vendeur depuis la page Espace vendeur, puis ouvrez votre boutique et ajoutez vos produits. Un compte vendeur ne peut pas passer de commandes."]
        ].forEach(([question, reponse]) => {
            const d = nouvelElement("details", "faq");
            d.appendChild(nouvelElement("summary", "", question));
            d.appendChild(nouvelElement("p", "", reponse));
            zone.appendChild(d);
        });
    }));

    /* Paramètres et confidentialité */

    corps.appendChild(sectionMenu("settings", "Paramètres et confidentialité", zone => {
        zone.appendChild(nouvelElement("label", "", "Apparence"));
        zone.appendChild(window.creerChoixTheme());
        zone.appendChild(nouvelElement("p", "sous-titre",
            "Automatique suit le réglage de votre téléphone. Clair et Sombre le remplacent."));

        zone.appendChild(nouvelElement("label", "", "Confidentialité"));
        [
            "Votre email n'est jamais affiché aux autres utilisateurs.",
            "Votre nom apparaît dans vos commentaires et vos messages.",
            "Quand vous commandez, la boutique reçoit le nom et le téléphone que vous saisissez.",
            "Le numéro mobile money d'une boutique n'est visible que par les acheteurs qui ont commandé chez elle."
        ].forEach(texte => zone.appendChild(nouvelElement("p", "ligne-confidentialite", texte)));

        window.marquerTheme();
    }));

    /* À propos */

    corps.appendChild(sectionMenu("info", "À propos de Dukani", zone => {
        zone.appendChild(nouvelElement("p", "ligne-confidentialite",
            "Dukani est une place de marché en ligne pour la RDC : des boutiques, des produits, des commandes et des discussions au même endroit."));
    }));

    /* Déconnexion */

    if (utilisateur) {
        const sortir = nouvelElement("button", "menu-deconnexion", "Déconnexion");
        sortir.type = "button";
        sortir.addEventListener("click", actionMenu(deconnexion));
        corps.appendChild(sortir);
    }
}

function ouvrirMenu() {
    construireMenu();
    ouvrir("menu");
    $("menu-corps").scrollTop = 0;
}

async function deconnexion() {
    await sb.auth.signOut();

    utilisateur = null;
    role = null;
    nomProfil = "";
    majInterfaceRole();

    quitterDiscussion();
    ["mes-commandes", "messagerie", "menu", "compte"].forEach(fermer);
    $("liste-mes-commandes").innerHTML = "";
}

sb.auth.onAuthStateChange(function (evenement, session) {
    if (session && (!utilisateur || utilisateur.id !== session.user.id)) {
        setTimeout(() => ouvrirSession(session.user), 0);
    } else if (!session && utilisateur) {
        utilisateur = null;
        role = null;
        majInterfaceRole();
    }
});


/* ---------- Paiement mobile money ---------- */

function montant(n, devise) {
    return Number(n).toLocaleString("fr-FR") + " " + (devise === "USD" ? "$" : "FC");
}

function textePaiement(c) {
    if (c.mode_paiement === "mobile_money") {
        if (c.statut_paiement === "paye") return "✅ Payé par mobile money";
        if (c.statut_paiement === "verification") {
            return "🔎 Paiement envoyé, en cours de vérification par le vendeur";
        }
        return "💳 Mobile money : à payer";
    }

    return c.statut_paiement === "paye" ? "✅ Payé" : "💵 À payer à la livraison";
}

let commandeAPayer = null;

async function ouvrirPaiement(id) {
    const { data, error } = await sb.rpc("infos_paiement", { p_commande: id });

    if (error || !data) {
        alert("⚠️ Instructions de paiement indisponibles pour cette commande.");
        return;
    }

    commandeAPayer = id;

    $("p-boutique").textContent = "Commande chez " + (data.boutique || "la boutique");
    $("p-montant").textContent = montant(data.montant, data.devise);
    $("p-operateur").textContent = "par " + data.operateur + " au numéro :";
    $("p-numero").textContent = data.numero;
    $("p-reference").value = data.reference || "";

    fermer("mes-commandes");
    ouvrir("paiement");
}

async function copierNumeroPaiement() {
    try {
        await navigator.clipboard.writeText($("p-numero").textContent);
        alert("📋 Numéro copié.");
    } catch (e) {
        alert("Copiez le numéro affiché à l'écran.");
    }
}

async function declarerPaiement() {
    const reference = $("p-reference").value.trim();

    if (reference.length < 3) {
        alert("⚠️ Entrez la référence de la transaction (au moins 3 caractères).");
        return;
    }

    const { error } = await sb.rpc("declarer_paiement", {
        p_commande: commandeAPayer,
        p_reference: reference
    });

    if (error) { alert("⚠️ " + error.message); return; }

    fermer("paiement");
    alert("✅ Merci ! Le vendeur va vérifier votre paiement.");
    ouvrirMesCommandes();
}


/* ---------- Mes commandes ---------- */

async function ouvrirMesCommandes() {
    const liste = $("liste-mes-commandes");
    const icones = { "en attente": "⏳", "livrée": "✅", "annulée": "❌" };

    const { data, error } = await sb.from("commandes")
        .select("*").order("created_at", { ascending: false });

    liste.innerHTML = "";

    if (error) {
        ligne(liste, "p", "⚠️ Impossible de charger vos commandes.");
    } else if (!data || data.length === 0) {
        ligne(liste, "p", "Aucune commande pour le moment.").style.color = "var(--encre-douce)";
    } else {
        data.forEach(c => {
            const carte = document.createElement("div");
            carte.className = "produit-item";

            ligne(carte, "h3", c.quantite + " × " + c.nom_produit);
            ligne(carte, "p", "🏪 " + (c.boutique_nom || "Boutique") + " · " +
                new Date(c.created_at).toLocaleDateString("fr-FR"));
            ligne(carte, "p", icones[c.statut] + " " + c.statut);
            ligne(carte, "p", textePaiement(c));
            ligne(carte, "strong", montant(c.total, c.devise)).className = "produit-prix";

            if (c.mode_paiement === "mobile_money" && c.statut === "en attente" &&
                c.statut_paiement !== "paye") {
                const actions = document.createElement("div");
                actions.className = "actions-produit";

                const bt = document.createElement("button");
                bt.type = "button";
                bt.textContent = c.statut_paiement === "verification"
                    ? "✏️ Corriger la référence" : "💳 Payer maintenant";
                bt.addEventListener("click", () => ouvrirPaiement(c.id));

                actions.appendChild(bt);
                carte.appendChild(actions);
            }

            liste.appendChild(carte);
        });
    }

    if (window.fermerParametres) window.fermerParametres();
    ouvrir("mes-commandes");
}

["a-nom", "a-email", "a-mdp", "a-confirm"].forEach(id => {
    $(id).addEventListener("keydown", e => {
        if (e.key === "Enter") validerAuth();
    });
});


/* ---------- Démarrage ---------- */

rafraichirAccueil();
chargerStatuts();
chargerFil(false);
chargerPublicites();

sb.auth.getSession().then(({ data }) => {
    if (!data.session && (params.get("connexion") || params.get("messages"))) ouvrirAuth();
});
