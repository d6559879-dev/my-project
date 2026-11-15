/* =====================================
   DUKANI — version Supabase
===================================== */

const SUPABASE_URL = "https://aowfjpaclhrmmhpuxauq.supabase.co";
const SUPABASE_CLE = "sb_publishable_bHKXQAMowU0qoVOp5RqlmA_Qm_LrKC6";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CLE);

/* Dossier du site (ex. https://…/Shopbuilder-/) pour les liens des emails */

function dossierSite() {
    return location.origin + location.pathname.replace(/[^\/]*$/, "");
}

const INACTIVITE_MAX = 30 * 60 * 1000;

let utilisateur = null;
let boutique = null;
let produits = [];
let commandes = [];
let modeInscription = false;
let minuteur = null;


/* ---------- Outils ---------- */

const $ = id => document.getElementById(id);
const ouvrir = id => $(id).classList.add("active");
const fermer = id => $(id).classList.remove("active");

function devise() {
    return boutique && boutique.devise === "USD" ? "$" : "FC";
}

function prix(n) {
    return Number(n).toLocaleString("fr-FR") + " " + devise();
}

function ligne(parent, tag, texte) {
    const el = document.createElement(tag);
    el.textContent = texte;
    parent.appendChild(el);
    return el;
}

function bouton(texte, action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = texte;
    b.addEventListener("click", action);
    return b;
}

function echec(e) {
    alert("⚠️ " + ((e && e.message) || "Erreur de connexion. Réessayez."));
}

function entierValide(v) {
    return v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0;
}

function prixValide(v) {
    return v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;
}


/* ---------- Chargement des données ---------- */

async function charger() {
    const [b, p, c] = await Promise.all([
        sb.from("boutiques").select("*").maybeSingle(),
        sb.from("produits").select("*").order("created_at", { ascending: false }),
        sb.from("commandes").select("*").order("created_at", { ascending: false })
    ]);

    const erreur = b.error || p.error || c.error;

    if (erreur) { echec(erreur); return false; }

    boutique = b.data;
    produits = p.data || [];
    commandes = c.data || [];

    majAccueil();
    return true;
}

function totalVentes() {
    return commandes
        .filter(c => c.statut === "livrée")
        .reduce((s, c) => s + Number(c.total), 0);
}

function majAccueil() {
    $("nombre-boutiques").textContent = boutique ? "1" : "0";
    $("nombre-produits").textContent = produits.length;
    $("nombre-ventes").textContent = prix(totalVentes());
}


/* ---------- Menu ---------- */

function ouvrirMenu() { ouvrir("menu"); }
function allerA(fonction) { fermer("menu"); fonction(); }


/* ---------- Boutique ---------- */

function ouvrirCreation() { ouvrir("creation"); }
function fermerCreation() {
    fermer("creation");
    viderPhotoBoutique();
}

async function creerBoutique() {
    const nom = $("nom-boutique").value.trim();

    if (nom === "") {
        alert("⚠️ Veuillez entrer le nom de votre boutique.");
        return;
    }

    const operateur = $("operateur-paiement").value;
    const numeroPaiement = $("numero-paiement").value.trim();

    if (operateur && numeroPaiement.length < 6) {
        alert("⚠️ Entrez le numéro mobile money (au moins 6 chiffres) ou choisissez « Aucun ».");
        return;
    }

    const existait = !!boutique;
    const ancienChemin = boutique ? boutique.image_path || null : null;
    let imagePath = ancienChemin;
    let nouveauChemin = null;

    try {
        const fichier = $("image-boutique").files[0];

        if (fichier) {
            const photo = await compresserCadre(fichier, 800, 600);

            nouveauChemin = utilisateur.id + "/boutique-" + crypto.randomUUID() + ".jpg";

            const { error } = await sb.storage.from("produits")
                .upload(nouveauChemin, photo, { contentType: "image/jpeg" });

            if (error) { nouveauChemin = null; throw error; }

            imagePath = nouveauChemin;
        } else if (retraitPhotoBoutique) {
            imagePath = null;
        }
    } catch (e) {
        echec(e);
        return;
    }

    const { error } = await sb.from("boutiques").upsert({
        user_id: utilisateur.id,
        nom: nom,
        description: $("description").value.trim(),
        telephone: $("telephone").value.trim(),
        devise: $("devise").value,
        image_path: imagePath,
        paiement_operateur: operateur || null,
        paiement_numero: operateur ? numeroPaiement : null
    }, { onConflict: "user_id" });

    if (error) {
        if (nouveauChemin) await sb.storage.from("produits").remove([nouveauChemin]);
        echec(error);
        return;
    }

    /* L'ancienne photo n'est plus utilisée : on la supprime */
    if (ancienChemin && ancienChemin !== imagePath) {
        await sb.storage.from("produits").remove([ancienChemin]);
    }

    await charger();
    fermerCreation();

    alert(existait
        ? "✅ Boutique mise à jour."
        : "🎉 Votre boutique « " + nom + " » a été créée.");
}

function ouvrirMaBoutique() {
    if (!boutique) {
        alert("⚠️ Vous devez d'abord créer une boutique.");
        ouvrirCreation();
        return;
    }

    $("afficher-nom").textContent = boutique.nom;
    $("afficher-description").textContent = boutique.description || "Aucune description.";
    $("afficher-telephone").textContent = boutique.telephone || "-";
    $("afficher-devise").textContent = boutique.devise;
    $("afficher-paiement").textContent = boutique.paiement_operateur
        ? boutique.paiement_operateur + " · " + boutique.paiement_numero
        : "Non activé";
    $("lien-vitrine").textContent = lienVitrine() || "-";

    const photo = $("afficher-photo");

    if (boutique.image_path) {
        photo.src = urlPublique(boutique.image_path);
        photo.hidden = false;
        $("afficher-logo").hidden = true;
    } else {
        photo.removeAttribute("src");
        photo.hidden = true;
        $("afficher-logo").hidden = false;
    }

    ouvrir("ma-boutique");
}

function fermerMaBoutique() { fermer("ma-boutique"); }

function modifierBoutique() {
    $("nom-boutique").value = boutique ? boutique.nom : "";
    $("description").value = boutique ? boutique.description || "" : "";
    $("telephone").value = boutique ? boutique.telephone || "" : "";
    $("devise").value = boutique ? boutique.devise : "FC";
    $("operateur-paiement").value = boutique && boutique.paiement_operateur
        ? boutique.paiement_operateur : "";
    $("numero-paiement").value = boutique && boutique.paiement_numero
        ? boutique.paiement_numero : "";

    viderPhotoBoutique();

    if (boutique && boutique.image_path) {
        $("apercu-boutique").src = urlPublique(boutique.image_path);
        $("apercu-boutique").style.display = "block";
        $("retirer-photo-boutique").hidden = false;
    }

    fermerMaBoutique();
    ouvrirCreation();
}

async function supprimerBoutique() {
    if (!confirm("⚠️ Voulez-vous vraiment supprimer cette boutique ?")) return;

    const cheminPhoto = boutique ? boutique.image_path : null;

    const { data: statutsBoutique } = await sb.from("statuts").select("image_path");
    const cheminsStatuts = (statutsBoutique || []).map(s => s.image_path);

    const { data: pubsBoutique } = await sb.from("publications").select("images");
    const cheminsPubs = (pubsBoutique || []).flatMap(p => p.images || []);

    const { error } = await sb.from("boutiques")
        .delete().eq("user_id", utilisateur.id);

    if (error) { echec(error); return; }

    if (cheminPhoto) await sb.storage.from("produits").remove([cheminPhoto]);

    if (cheminsStatuts.length) await sb.storage.from("produits").remove(cheminsStatuts);
    await sb.from("statuts").delete().eq("user_id", utilisateur.id);

    if (cheminsPubs.length) await sb.storage.from("produits").remove(cheminsPubs);
    await sb.from("publications").delete().eq("user_id", utilisateur.id);

    await charger();
    fermerMaBoutique();
    alert("🗑️ Boutique supprimée.");
}


/* ---------- Photo ---------- */

async function compresser(fichier, max = 600) {
    if (!fichier) return null;

    if (!fichier.type.startsWith("image/")) {
        throw new Error("Choisis un fichier image valide.");
    }

    const url = URL.createObjectURL(fichier);

    const img = await new Promise((ok, ko) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => ko(new Error("Impossible de lire cette image."));
        i.src = url;
    });

    URL.revokeObjectURL(url);

    const ratio = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext("2d");

    /* Fond blanc : une photo transparente (PNG) ne devient pas noire en JPEG */
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return new Promise(ok => canvas.toBlob(ok, "image/jpeg", 0.7));
}

/* Photo de la boutique : recadrée au format 4:3 (800 × 600) */

async function compresserCadre(fichier, largeur, hauteur) {
    if (!fichier.type.startsWith("image/")) {
        throw new Error("Choisis un fichier image valide.");
    }

    const url = URL.createObjectURL(fichier);

    const img = await new Promise((ok, ko) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => ko(new Error("Impossible de lire cette image."));
        i.src = url;
    });

    URL.revokeObjectURL(url);

    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;

    /* Remplir le cadre en centrant, sans déformer */
    const echelle = Math.max(largeur / img.width, hauteur / img.height);
    const w = img.width * echelle;
    const h = img.height * echelle;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.drawImage(img, (largeur - w) / 2, (hauteur - h) / 2, w, h);

    return new Promise(ok => canvas.toBlob(ok, "image/jpeg", 0.8));
}

function urlPublique(chemin) {
    return SUPABASE_URL + "/storage/v1/object/public/produits/" +
        chemin.split("/").map(encodeURIComponent).join("/");
}

let retraitPhotoBoutique = false;

function viderPhotoBoutique() {
    retraitPhotoBoutique = false;
    $("image-boutique").value = "";
    $("apercu-boutique").removeAttribute("src");
    $("apercu-boutique").style.display = "none";
    $("retirer-photo-boutique").hidden = true;
}

function retirerPhotoBoutique() {
    viderPhotoBoutique();
    retraitPhotoBoutique = true;
}

$("image-boutique").addEventListener("change", function () {
    const fichier = this.files[0];

    if (!fichier) { return; }

    if (!fichier.type.startsWith("image/")) {
        alert("⚠️ Choisis un fichier image valide.");
        this.value = "";
        return;
    }

    retraitPhotoBoutique = false;

    const lecteur = new FileReader();
    lecteur.onload = e => {
        $("apercu-boutique").src = e.target.result;
        $("apercu-boutique").style.display = "block";
        $("retirer-photo-boutique").hidden = false;
    };
    lecteur.readAsDataURL(fichier);
});

/* ---------- Publicité (payante, durée limitée) ---------- */

async function ouvrirMaPublicite() {
    if (!boutique) {
        alert("⚠️ Créez d'abord votre boutique.");
        ouvrirCreation();
        return;
    }

    ouvrir("publicite");
    await chargerInfosPub();
    await afficherMesPublicites();
}

async function chargerInfosPub() {
    const { data, error } = await sb.rpc("pub_infos");
    const infos = !error && data ? data : { tarifs: [], instructions: "" };

    const choix = $("pub-tarif");
    choix.textContent = "";

    if (!infos.tarifs || infos.tarifs.length === 0) {
        const vide = document.createElement("option");
        vide.value = "";
        vide.textContent = "Aucun tarif disponible pour le moment";
        choix.appendChild(vide);
        $("pub-envoyer").disabled = true;
    } else {
        infos.tarifs.forEach(t => {
            const option = document.createElement("option");
            option.value = t.id;
            option.textContent = t.duree_jours + (t.duree_jours > 1 ? " jours" : " jour") + " : " +
                Number(t.prix).toLocaleString("fr-FR") + " " + (t.devise === "USD" ? "$" : "FC");
            choix.appendChild(option);
        });
        $("pub-envoyer").disabled = false;
    }

    $("pub-instructions").textContent = infos.instructions || "";
    $("pub-paiement").hidden = !infos.instructions;
}

function etatPublicite(pu) {
    const debut = pu.debut ? new Date(pu.debut).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
    const fin = pu.fin ? new Date(pu.fin).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";

    if (pu.etat === "active") return "En ligne du " + debut + " au " + fin;
    if (pu.etat === "terminee") return "Terminée (du " + debut + " au " + fin + ")";
    if (pu.etat === "pause") return "En pause";
    if (pu.etat === "refusee") return "Refusée";
    return "En attente de paiement et de validation";
}

async function afficherMesPublicites() {
    const liste = $("liste-publicites");
    const { data, error } = await sb.rpc("mes_publicites");

    liste.textContent = "";

    if (error || !Array.isArray(data)) {
        ligne(liste, "p", "⚠️ Impossible de charger vos publicités.");
        return;
    }

    if (data.length === 0) {
        ligne(liste, "p", "Aucune publicité pour le moment.");
        return;
    }

    data.forEach(pu => {
        const carte = document.createElement("div");
        carte.className = "produit-item";

        if (pu.image_path) {
            const photo = document.createElement("img");
            photo.src = urlPublique(pu.image_path);
            photo.alt = pu.titre;
            photo.className = "photo-statut";
            carte.appendChild(photo);
        }

        ligne(carte, "h3", pu.titre);
        if (pu.texte) ligne(carte, "p", pu.texte);

        ligne(carte, "p", pu.duree_jours + (pu.duree_jours > 1 ? " jours" : " jour") + " : " +
            Number(pu.prix).toLocaleString("fr-FR") + " " + (pu.devise === "USD" ? "$" : "FC"));
        ligne(carte, "p", etatPublicite(pu));

        if (pu.etat === "active" || pu.etat === "terminee" || pu.etat === "pause") {
            ligne(carte, "p", "Vues : " + pu.vues + " · Clics : " + pu.clics);
        }

        if (pu.etat === "en_attente") {
            if (pu.reference_paiement) {
                ligne(carte, "p", "Référence de paiement : " + pu.reference_paiement);
            }

            const actions = document.createElement("div");
            actions.className = "actions-produit";
            actions.appendChild(bouton(
                pu.reference_paiement ? "Modifier la référence" : "J'ai payé : saisir la référence",
                () => declarerPaiementPub(pu)));
            actions.appendChild(bouton("Annuler", () => annulerPub(pu)));
            carte.appendChild(actions);
        }

        liste.appendChild(carte);
    });
}

async function demanderPublicite() {
    const titre = $("pub-titre").value.trim();
    const tarif = $("pub-tarif").value;

    if (!titre) {
        alert("⚠️ Entrez un titre pour votre publicité.");
        return;
    }

    if (!tarif) {
        alert("⚠️ Choisissez une durée.");
        return;
    }

    const bt = $("pub-envoyer");
    bt.disabled = true;

    let chemin = null;

    try {
        const fichier = $("pub-image").files[0];

        if (fichier) {
            const photo = await compresser(fichier, 900);

            chemin = utilisateur.id + "/pub-" + crypto.randomUUID() + ".jpg";

            const { error } = await sb.storage.from("produits")
                .upload(chemin, photo, { contentType: "image/jpeg" });

            if (error) { chemin = null; throw error; }
        }

        const { error: erreurDemande } = await sb.rpc("demander_publicite", {
            p_titre: titre,
            p_texte: $("pub-texte").value.trim() || null,
            p_image: chemin,
            p_tarif: tarif
        });

        if (erreurDemande) throw erreurDemande;
    } catch (e) {
        if (chemin) await sb.storage.from("produits").remove([chemin]);
        bt.disabled = false;
        echec(e);
        return;
    }

    bt.disabled = false;

    $("pub-titre").value = "";
    $("pub-texte").value = "";
    $("pub-image").value = "";

    await afficherMesPublicites();

    alert("✅ Demande envoyée. Payez selon les instructions affichées, puis saisissez votre " +
        "référence de paiement : votre publicité sera mise en ligne après vérification.");
}

async function declarerPaiementPub(pu) {
    const reference = prompt("Référence de la transaction (reçue par SMS) :", pu.reference_paiement || "");

    if (reference === null) return;

    const { error } = await sb.rpc("declarer_paiement_publicite", {
        p_id: pu.id,
        p_reference: reference
    });

    if (error) { echec(error); return; }

    await afficherMesPublicites();
}

async function annulerPub(pu) {
    if (!confirm("Annuler cette demande de publicité ?")) return;

    const { data: chemin, error } = await sb.rpc("annuler_publicite", { p_id: pu.id });

    if (error) { echec(error); return; }

    if (chemin) await sb.storage.from("produits").remove([chemin]);

    await afficherMesPublicites();
}


/* ---------- Publications (fil d'actualité) ---------- */

async function ouvrirMesPublications() {
    if (!boutique) {
        alert("⚠️ Créez d'abord votre boutique.");
        ouvrirCreation();
        return;
    }

    ouvrir("publications");
    await afficherMesPublications();
}

async function afficherMesPublications() {
    const liste = $("liste-publications");

    const { data, error } = await sb.from("publications")
        .select("*").order("created_at", { ascending: false }).limit(30);

    liste.textContent = "";

    if (error) {
        ligne(liste, "p", "⚠️ Impossible de charger vos publications.");
        return;
    }

    if (!data || data.length === 0) {
        ligne(liste, "p", "Aucune publication pour le moment.");
        return;
    }

    data.forEach(p => {
        const carte = document.createElement("div");
        carte.className = "produit-item";

        if (p.images && p.images.length) {
            const photo = document.createElement("img");
            photo.src = urlPublique(p.images[0]);
            photo.alt = "Publication";
            photo.className = "photo-statut";
            carte.appendChild(photo);
        }

        if (p.texte) ligne(carte, "p", p.texte.length > 140 ? p.texte.slice(0, 140) + "…" : p.texte);

        const nbPhotos = p.images ? p.images.length : 0;
        ligne(carte, "p", "📷 " + nbPhotos + (nbPhotos > 1 ? " photos" : " photo") +
            " · " + new Date(p.created_at).toLocaleDateString("fr-FR"));

        const actions = document.createElement("div");
        actions.className = "actions-produit";
        actions.appendChild(bouton("🗑️ Supprimer", () => supprimerPublication(p)));
        carte.appendChild(actions);

        liste.appendChild(carte);
    });
}

async function publierPublication() {
    const texte = $("texte-publication").value.trim();
    const fichiers = Array.from($("images-publication").files).slice(0, 4);

    if (!texte && fichiers.length === 0) {
        alert("⚠️ Écrivez un texte ou ajoutez au moins une photo.");
        return;
    }

    const bt = $("bouton-publication");
    bt.disabled = true;

    const chemins = [];

    try {
        for (const fichier of fichiers) {
            const photo = await compresser(fichier, 900);
            const chemin = utilisateur.id + "/publication-" + crypto.randomUUID() + ".jpg";

            const { error } = await sb.storage.from("produits")
                .upload(chemin, photo, { contentType: "image/jpeg" });

            if (error) throw error;

            chemins.push(chemin);
        }

        const { error: erreurPublication } = await sb.from("publications").insert({
            texte: texte || null,
            images: chemins
        });

        if (erreurPublication) throw erreurPublication;
    } catch (e) {
        if (chemins.length) await sb.storage.from("produits").remove(chemins);
        bt.disabled = false;
        echec(e);
        return;
    }

    bt.disabled = false;

    $("texte-publication").value = "";
    $("images-publication").value = "";
    $("apercus-publication").textContent = "";

    await afficherMesPublications();
    alert("✅ Publication envoyée sur le fil d'accueil.");
}

async function supprimerPublication(p) {
    if (!confirm("Supprimer cette publication ?")) return;

    if (p.images && p.images.length) {
        await sb.storage.from("produits").remove(p.images);
    }

    const { error } = await sb.from("publications").delete().eq("id", p.id);

    if (error) { echec(error); return; }

    await afficherMesPublications();
}

$("images-publication").addEventListener("change", function () {
    const zone = $("apercus-publication");
    const fichiers = Array.from(this.files);

    zone.textContent = "";

    if (fichiers.length > 4) {
        alert("⚠️ 4 photos au maximum : seules les 4 premières seront publiées.");
    }

    fichiers.slice(0, 4).forEach(fichier => {
        if (!fichier.type.startsWith("image/")) return;

        const lecteur = new FileReader();

        lecteur.onload = e => {
            const img = document.createElement("img");
            img.src = e.target.result;
            img.alt = "Aperçu";
            zone.appendChild(img);
        };

        lecteur.readAsDataURL(fichier);
    });
});


/* Section « Compte » de la fenêtre Paramètres */

window.remplirParametresCompte = function (zone) {
    const titre = document.createElement("label");
    titre.textContent = "Compte";
    zone.appendChild(titre);

    if (utilisateur && utilisateur.email) {
        const infos = document.createElement("div");
        infos.className = "info-boutique";

        const bloc = document.createElement("div");
        const etiquette = document.createElement("span");
        const contenu = document.createElement("strong");
        etiquette.textContent = "Email";
        contenu.textContent = utilisateur.email;
        contenu.style.wordBreak = "break-all";
        bloc.appendChild(etiquette);
        bloc.appendChild(contenu);
        infos.appendChild(bloc);
        zone.appendChild(infos);
    }

    const place = document.createElement("button");
    place.type = "button";
    place.className = "bouton-secondaire";
    place.textContent = "Voir la place de marché";
    place.addEventListener("click", () => { location.href = "index.html"; });
    zone.appendChild(place);

    const sortir = document.createElement("button");
    sortir.type = "button";
    sortir.className = "bouton-danger";
    sortir.textContent = "Se déconnecter";
    sortir.addEventListener("click", () => { window.fermerParametres(); deconnexion(); });
    zone.appendChild(sortir);
};


/* Ouverture directe depuis l'accueil : ?publier=1 ou ?statut=1 */

function ouvrirDepuisAdresse() {
    const params = new URLSearchParams(location.search);

    if (params.get("publier")) {
        history.replaceState(null, "", location.pathname);
        ouvrirMesPublications();
    } else if (params.get("statut")) {
        history.replaceState(null, "", location.pathname);
        ouvrirMesStatuts();
    } else if (params.get("pub")) {
        history.replaceState(null, "", location.pathname);
        ouvrirMaPublicite();
    }
}


/* ---------- Statuts : nouveaux arrivages (24 h) ---------- */

const DUREE_STATUT = 24 * 60 * 60 * 1000;

async function ouvrirMesStatuts() {
    if (!boutique) {
        alert("⚠️ Créez d'abord votre boutique.");
        ouvrirCreation();
        return;
    }

    ouvrir("statuts");
    await afficherMesStatuts();
}

async function afficherMesStatuts() {
    const liste = $("liste-statuts");

    const { data, error } = await sb.from("statuts")
        .select("*").order("created_at", { ascending: false });

    liste.textContent = "";

    if (error) {
        ligne(liste, "p", "⚠️ Impossible de charger vos statuts.");
        return;
    }

    const maintenant = Date.now();
    const tous = data || [];
    const expires = tous.filter(s => maintenant - new Date(s.created_at).getTime() >= DUREE_STATUT);
    const actifs = tous.filter(s => maintenant - new Date(s.created_at).getTime() < DUREE_STATUT);

    /* Nettoyage : les statuts de plus de 24 h sont supprimés avec leur photo */
    if (expires.length) {
        await sb.storage.from("produits").remove(expires.map(s => s.image_path));
        await sb.from("statuts").delete().in("id", expires.map(s => s.id));
    }

    if (actifs.length === 0) {
        ligne(liste, "p", "Aucun statut en cours.");
        return;
    }

    actifs.forEach(s => {
        const carte = document.createElement("div");
        carte.className = "produit-item";

        const photo = document.createElement("img");
        photo.src = urlPublique(s.image_path);
        photo.alt = "Statut";
        photo.className = "photo-statut";
        carte.appendChild(photo);

        if (s.legende) ligne(carte, "p", s.legende);

        const reste = DUREE_STATUT - (maintenant - new Date(s.created_at).getTime());
        const heures = Math.floor(reste / 3600000);
        const minutes = Math.floor((reste % 3600000) / 60000);
        ligne(carte, "p", "⏳ Expire dans " + heures + " h " + minutes + " min");

        const actions = document.createElement("div");
        actions.className = "actions-produit";
        actions.appendChild(bouton("🗑️ Supprimer", () => supprimerStatut(s)));
        carte.appendChild(actions);

        liste.appendChild(carte);
    });
}

async function publierStatut() {
    const fichier = $("image-statut").files[0];

    if (!fichier) {
        alert("⚠️ Choisissez une photo.");
        return;
    }

    const bt = $("bouton-statut");
    bt.disabled = true;

    let chemin = null;

    try {
        const photo = await compresser(fichier, 900);

        chemin = utilisateur.id + "/statut-" + crypto.randomUUID() + ".jpg";

        const { error } = await sb.storage.from("produits")
            .upload(chemin, photo, { contentType: "image/jpeg" });

        if (error) { chemin = null; throw error; }

        const { error: erreurStatut } = await sb.from("statuts").insert({
            image_path: chemin,
            legende: $("legende-statut").value.trim() || null
        });

        if (erreurStatut) throw erreurStatut;
    } catch (e) {
        if (chemin) await sb.storage.from("produits").remove([chemin]);
        bt.disabled = false;
        echec(e);
        return;
    }

    bt.disabled = false;

    $("image-statut").value = "";
    $("legende-statut").value = "";
    $("apercu-statut").removeAttribute("src");
    $("apercu-statut").style.display = "none";

    await afficherMesStatuts();
    alert("✅ Statut publié, visible pendant 24 h.");
}

async function supprimerStatut(s) {
    if (!confirm("Supprimer ce statut ?")) return;

    await sb.storage.from("produits").remove([s.image_path]);

    const { error } = await sb.from("statuts").delete().eq("id", s.id);

    if (error) { echec(error); return; }

    await afficherMesStatuts();
}

$("image-statut").addEventListener("change", function () {
    const fichier = this.files[0];
    const apercu = $("apercu-statut");

    if (!fichier || !fichier.type.startsWith("image/")) {
        this.value = "";
        apercu.removeAttribute("src");
        apercu.style.display = "none";
        return;
    }

    const lecteur = new FileReader();
    lecteur.onload = e => {
        apercu.src = e.target.result;
        apercu.style.display = "block";
    };
    lecteur.readAsDataURL(fichier);
});

function viderApercu() {
    $("image-produit").value = "";
    $("apercus-produit").textContent = "";
}

$("image-produit").addEventListener("change", function () {
    const zone = $("apercus-produit");
    const fichiers = Array.from(this.files);

    zone.textContent = "";

    if (fichiers.length > 5) {
        alert("⚠️ 5 photos au maximum : seules les 5 premières seront ajoutées.");
    }

    fichiers.slice(0, 5).forEach(fichier => {
        if (!fichier.type.startsWith("image/")) return;

        const lecteur = new FileReader();

        lecteur.onload = e => {
            const img = document.createElement("img");
            img.src = e.target.result;
            img.alt = "Aperçu";
            zone.appendChild(img);
        };

        lecteur.readAsDataURL(fichier);
    });
});


/* ---------- Produits ---------- */

function ouvrirProduits() { afficherProduits(); ouvrir("produits"); }
function fermerProduits() { fermer("produits"); }
function ouvrirAjoutProduit() { ouvrir("ajout-produit"); }
function fermerAjoutProduit() { fermer("ajout-produit"); }

async function ajouterProduit() {
    const nom = $("nom-produit").value.trim();
    const prixSaisi = $("prix-produit").value;
    const stock = $("stock-produit").value;

    if (nom === "") { alert("⚠️ Entrez le nom du produit."); return; }
    if (!prixValide(prixSaisi)) { alert("⚠️ Entrez un prix valide."); return; }
    if (!entierValide(stock)) { alert("⚠️ Entrez un stock entier valide."); return; }

    const description = $("description-produit").value.trim();
    const fichiers = Array.from($("image-produit").files)
        .filter(f => f.type.startsWith("image/")).slice(0, 5);

    const chemins = [];

    try {
        for (const fichier of fichiers) {
            const photo = await compresser(fichier, 900);
            const chemin = utilisateur.id + "/" + crypto.randomUUID() + ".jpg";

            const { error } = await sb.storage.from("produits")
                .upload(chemin, photo, { contentType: "image/jpeg" });

            if (error) throw error;

            chemins.push(chemin);
        }

        const { error } = await sb.from("produits").insert({
            nom: nom,
            prix: Number(prixSaisi),
            stock: Number(stock),
            categorie: $("categorie-produit").value,
            image_path: chemins[0] || null,
            images: chemins,
            description: description || null
        });

        if (error) throw error;
    } catch (e) {
        if (chemins.length) await sb.storage.from("produits").remove(chemins);
        echec(e);
        return;
    }

    $("nom-produit").value = "";
    $("prix-produit").value = "";
    $("stock-produit").value = "";
    $("description-produit").value = "";
    viderApercu();

    await charger();
    fermerAjoutProduit();
    afficherProduits();
    alert("✅ Produit ajouté avec succès !");
}

async function afficherProduits() {
    const liste = $("liste-produits");

    const urls = {};
    const chemins = produits.filter(p => p.image_path).map(p => p.image_path);

    if (chemins.length > 0) {
        const { data } = await sb.storage.from("produits").createSignedUrls(chemins, 3600);
        (data || []).forEach(d => { if (d.signedUrl) urls[d.path] = d.signedUrl; });
    }

    liste.innerHTML = "";

    if (produits.length === 0) {
        const vide = ligne(liste, "p", "Aucun produit pour le moment. Ajoutez le premier.");
        vide.style.cssText = "text-align:center;color:var(--encre-douce);margin-top:25px;";
        return;
    }

    produits.forEach(p => {
        const carte = document.createElement("div");
        carte.className = "produit-item";

        if (urls[p.image_path]) {
            const photo = document.createElement("img");
            photo.src = urls[p.image_path];
            photo.alt = "Photo de " + p.nom;
            photo.className = "photo-produit";
            carte.appendChild(photo);
        }

        ligne(carte, "h3", p.nom);
        ligne(carte, "p", "📂 Catégorie : " + p.categorie);
        ligne(carte, "p", "📦 Stock : " + p.stock);
        ligne(carte, "strong", prix(p.prix)).className = "produit-prix";

        const actions = document.createElement("div");
        actions.className = "actions-produit";
        actions.appendChild(bouton("✏️ Modifier", () => modifierProduit(p.id)));
        actions.appendChild(bouton("🗑️ Supprimer", () => supprimerProduit(p.id)));
        carte.appendChild(actions);

        liste.appendChild(carte);
    });
}

async function modifierProduit(id) {
    const p = produits.find(x => x.id === id);

    if (!p) { alert("⚠️ Produit introuvable."); return; }

    const nom = prompt("Nom du produit :", p.nom);
    if (nom === null) return;
    if (nom.trim() === "") { alert("⚠️ Le nom ne peut pas être vide."); return; }

    const nouveauPrix = prompt("Prix du produit en " + devise() + " :", p.prix);
    if (nouveauPrix === null) return;
    if (!prixValide(nouveauPrix.trim())) { alert("⚠️ Prix invalide."); return; }

    const stock = prompt("Quantité en stock :", p.stock);
    if (stock === null) return;
    if (!entierValide(stock.trim())) { alert("⚠️ Stock invalide."); return; }

    const categorie = prompt("Catégorie du produit :", p.categorie);
    if (categorie === null) return;
    if (categorie.trim() === "") { alert("⚠️ La catégorie ne peut pas être vide."); return; }

    const description = prompt("Description (laisser vide pour aucune) :", p.description || "");
    if (description === null) return;
    if (description.length > 1000) { alert("⚠️ Description trop longue (1000 caractères au plus)."); return; }

    const { error } = await sb.from("produits").update({
        nom: nom.trim(),
        prix: Number(nouveauPrix),
        stock: Number(stock),
        categorie: categorie.trim(),
        description: description.trim() || null
    }).eq("id", id);

    if (error) { echec(error); return; }

    await charger();
    afficherProduits();
    alert("✅ Produit modifié avec succès !");
}

async function supprimerProduit(id) {
    const p = produits.find(x => x.id === id);

    if (!p || !confirm("Supprimer « " + p.nom + " » ?")) return;

    const { error } = await sb.from("produits").delete().eq("id", id);

    if (error) { echec(error); return; }

    const chemins = Array.from(new Set([].concat(p.images || [], p.image_path ? [p.image_path] : [])));

    if (chemins.length) {
        await sb.storage.from("produits").remove(chemins);
    }

    await charger();
    afficherProduits();
}


/* ---------- Commandes ---------- */

function ouvrirCommandes() { afficherCommandes(); ouvrir("commandes"); }
function fermerCommandes() { fermer("commandes"); }
function fermerNouvelleCommande() { fermer("nouvelle-commande"); }

function ouvrirNouvelleCommande() {
    const disponibles = produits.filter(p => p.stock > 0);

    if (disponibles.length === 0) {
        alert("⚠️ Aucun produit en stock. Ajoutez d'abord un produit.");
        return;
    }

    const choix = $("cmd-produit");
    choix.innerHTML = "";

    disponibles.forEach(p => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.nom + " — " + prix(p.prix) + " (stock : " + p.stock + ")";
        choix.appendChild(option);
    });

    $("cmd-quantite").value = "1";
    $("cmd-client").value = "";
    ouvrir("nouvelle-commande");
}

async function enregistrerCommande() {
    const quantite = $("cmd-quantite").value;
    const client = $("cmd-client").value.trim();

    if (!entierValide(quantite) || Number(quantite) < 1) {
        alert("⚠️ Entrez une quantité valide.");
        return;
    }

    if (client === "") { alert("⚠️ Entrez le nom du client."); return; }

    const { error } = await sb.rpc("passer_commande", {
        p_produit: $("cmd-produit").value,
        p_quantite: Number(quantite),
        p_client: client
    });

    if (error) { echec(error); return; }

    await charger();
    fermerNouvelleCommande();
    afficherCommandes();
}

async function marquerPaye(id) {
    if (!confirm("Confirmer que vous avez bien reçu ce paiement ?")) return;

    const { error } = await sb.from("commandes")
        .update({ statut_paiement: "paye" })
        .eq("id", id).neq("statut", "annulée");

    if (error) { echec(error); return; }

    await charger();
    afficherCommandes();
}

async function changerStatut(id, statut) {
    let resultat;

    if (statut === "annulée") {
        if (!confirm("Annuler cette commande ? Le stock sera remis.")) return;
        resultat = await sb.rpc("annuler_commande", { p_commande: id });
    } else {
        const cmd = commandes.find(x => x.id === id);

        if (cmd && cmd.mode_paiement === "mobile_money" && cmd.statut_paiement !== "paye" &&
            !confirm("Le paiement mobile money n'est pas confirmé. Marquer quand même comme livrée ?")) {
            return;
        }

        const maj = { statut: statut };

        /* Payé à la livraison : la commande livrée est considérée payée */
        if (cmd && cmd.mode_paiement === "livraison") maj.statut_paiement = "paye";

        resultat = await sb.from("commandes")
            .update(maj)
            .eq("id", id).eq("statut", "en attente");
    }

    if (resultat.error) { echec(resultat.error); return; }

    await charger();
    afficherCommandes();
}

async function supprimerCommande(id) {
    const c = commandes.find(x => x.id === id);

    if (!c || !confirm("Supprimer cette commande ?")) return;

    if (c.statut === "en attente") {
        const r = await sb.rpc("annuler_commande", { p_commande: id });
        if (r.error) { echec(r.error); return; }
    }

    const { error } = await sb.from("commandes").delete().eq("id", id);

    if (error) { echec(error); return; }

    await charger();
    afficherCommandes();
}

/* Texte d'état du paiement d'une commande */

function textePaiement(c) {
    const ref = c.reference_paiement ? " · Réf : " + c.reference_paiement : "";

    if (c.mode_paiement === "mobile_money") {
        if (c.statut_paiement === "paye") return "✅ Payé par mobile money" + ref;
        if (c.statut_paiement === "verification") return "🔎 Mobile money à vérifier" + ref;
        return "💳 Mobile money : en attente du paiement du client";
    }

    return c.statut_paiement === "paye"
        ? "✅ Payé à la livraison"
        : "💵 À encaisser à la livraison";
}

function afficherCommandes() {
    const liste = $("liste-commandes");
    const icones = { "en attente": "⏳", "livrée": "✅", "annulée": "❌" };

    liste.innerHTML = "";

    if (commandes.length === 0) {
        const vide = ligne(liste, "p", "Aucune commande pour le moment.");
        vide.style.cssText = "text-align:center;color:var(--encre-douce);margin-top:25px;";
        return;
    }

    commandes.forEach(c => {
        const carte = document.createElement("div");
        carte.className = "produit-item";

        ligne(carte, "h3", c.quantite + " × " + c.nom_produit);
        ligne(carte, "p", "👤 " + c.client + " · " +
            new Date(c.created_at).toLocaleDateString("fr-FR"));
        ligne(carte, "p", icones[c.statut] + " " + c.statut);
        if (c.client_telephone) ligne(carte, "p", "📞 " + c.client_telephone);
        ligne(carte, "p", textePaiement(c));
        ligne(carte, "strong", prix(c.total)).className = "produit-prix";

        const actions = document.createElement("div");
        actions.className = "actions-produit";

        if (c.statut !== "annulée" && c.statut_paiement !== "paye") {
            actions.appendChild(bouton("💳 Marquer payé", () => marquerPaye(c.id)));
        }

        if (c.statut === "en attente") {
            actions.appendChild(bouton("✅ Livrée", () => changerStatut(c.id, "livrée")));
            actions.appendChild(bouton("❌ Annuler", () => changerStatut(c.id, "annulée")));
        }

        actions.appendChild(bouton("🗑️", () => supprimerCommande(c.id)));
        carte.appendChild(actions);

        liste.appendChild(carte);
    });
}


/* ---------- Statistiques ---------- */

function ouvrirStatistiques() {
    const compte = s => commandes.filter(c => c.statut === s).length;

    const lignes = [
        ["💰 Ventes (livrées)", prix(totalVentes())],
        ["🛒 Commandes en attente", compte("en attente")],
        ["✅ Commandes livrées", compte("livrée")],
        ["❌ Commandes annulées", compte("annulée")],
        ["📦 Produits", produits.length],
        ["🧮 Unités en stock", produits.reduce((s, p) => s + p.stock, 0)],
        ["⚠️ Produits en rupture", produits.filter(p => p.stock === 0).length]
    ];

    const zone = $("liste-stats");
    zone.innerHTML = "";

    lignes.forEach(l => {
        const div = document.createElement("div");
        ligne(div, "span", l[0]);
        ligne(div, "strong", String(l[1]));
        zone.appendChild(div);
    });

    ouvrir("statistiques");
}

function fermerStatistiques() { fermer("statistiques"); }


/* ---------- Connexion ---------- */

function erreurAuth(message, succes) {
    const zone = $("auth-erreur");
    zone.textContent = message || "";
    zone.style.color = succes ? "var(--succes)" : "";
}

function basculerAuth() {
    modeInscription = !modeInscription;

    $("champ-nom").hidden = !modeInscription;
    $("champ-confirm").hidden = !modeInscription;

    $("auth-titre").textContent = modeInscription ? "Créer un compte" : "Connexion";
    $("auth-sous-titre").textContent = modeInscription
        ? "Quelques infos pour créer votre espace."
        : "Connectez-vous pour gérer votre boutique.";
    $("auth-bouton").textContent = modeInscription ? "Créer mon compte" : "Se connecter";
    $("auth-bascule").textContent = modeInscription ? "J'ai déjà un compte" : "Créer un compte";
    $("auth-mdp").autocomplete = modeInscription ? "new-password" : "current-password";

    erreurAuth("");
}

function voirMotDePasse() {
    const champ = $("auth-mdp");
    const visible = champ.type === "text";

    champ.type = visible ? "password" : "text";
    $("auth-voir").textContent =
        visible ? "Afficher le mot de passe" : "Masquer le mot de passe";
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
    const email = $("auth-email").value.trim().toLowerCase();
    const mdp = $("auth-mdp").value;

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) {
        erreurAuth("Entrez une adresse email valide.");
        return;
    }

    if (mdp.length > 200) { erreurAuth("Mot de passe trop long."); return; }

    if (modeInscription) {
        const nom = $("auth-nom").value.trim();

        if (nom === "" || nom.length > 60) {
            erreurAuth("Entrez votre nom (60 caractères maximum).");
            return;
        }

        if (!motDePasseFort(mdp)) {
            erreurAuth("Le mot de passe doit avoir 8 caractères minimum, avec au moins une lettre et un chiffre.");
            return;
        }

        if (mdp !== $("auth-confirm").value) {
            erreurAuth("Les deux mots de passe ne sont pas identiques.");
            return;
        }
    }

    const bt = $("auth-bouton");
    bt.disabled = true;

    try {
        if (modeInscription) {
            const nom = $("auth-nom").value.trim();

            const { data, error } = await sb.auth.signUp({
                email: email,
                password: mdp,
                options: {
                    data: { nom: nom, role: "vendeur" },
                    emailRedirectTo: dossierSite() + "vendeur.html"
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

async function demarrer(user) {
    utilisateur = user;

    const { data: profil } = await sb.from("profils").select("role").maybeSingle();

    if (profil && profil.role !== "vendeur") {
        await deconnexion("Ce compte est un compte acheteur. Utilisez la page d'accueil pour vous connecter.");
        return;
    }

    ["auth-nom", "auth-email", "auth-mdp", "auth-confirm"]
        .forEach(id => { $(id).value = ""; });

    $("auth-mdp").type = "password";
    $("auth-voir").textContent = "Afficher le mot de passe";
    erreurAuth("");

    if (modeInscription) basculerAuth();

    const prenom = ((user.user_metadata && user.user_metadata.nom) || "").split(" ")[0];
    document.querySelector(".badge").textContent =
        prenom ? "👋 Bonjour " + prenom : "👋 Bonjour";

    $("auth").classList.add("cache");

    surveillerInactivite();
    setTimeout(async () => {
        if (await charger()) ouvrirDepuisAdresse();
    }, 0);
}

function arreter() {
    utilisateur = null;
    boutique = null;
    produits = [];
    commandes = [];
    clearTimeout(minuteur);

    document.querySelectorAll(".fenetre.active")
        .forEach(f => f.classList.remove("active"));

    ["liste-produits", "liste-commandes", "liste-stats"]
        .forEach(id => { $(id).innerHTML = ""; });

    document.querySelector(".badge").textContent = "🚀 Votre commerce en ligne";

    majAccueil();
    $("auth").classList.remove("cache");
}

async function deconnexion(raison) {
    await sb.auth.signOut();
    arreter();
    if (typeof raison === "string") erreurAuth(raison);
}

function surveillerInactivite() {
    clearTimeout(minuteur);

    minuteur = setTimeout(function () {
        deconnexion("Session fermée après 30 minutes d'inactivité.");
    }, INACTIVITE_MAX);
}

["click", "keydown", "touchstart"].forEach(evenement => {
    document.addEventListener(evenement, function () {
        if (utilisateur) surveillerInactivite();
    }, { passive: true });
});

["auth-nom", "auth-email", "auth-mdp", "auth-confirm"].forEach(id => {
    $(id).addEventListener("keydown", e => {
        if (e.key === "Enter") validerAuth();
    });
});

sb.auth.onAuthStateChange(function (evenement, session) {
    if (session && (!utilisateur || utilisateur.id !== session.user.id)) {
        setTimeout(() => demarrer(session.user), 0);
    } else if (!session && utilisateur) {
        arreter();
    }
});

/* Au premier chargement : l'écran de connexion reste visible
   jusqu'à ce qu'une session soit confirmée. */


/* ---------- Vitrine publique ---------- */

function lienVitrine() {
    if (!boutique || !boutique.slug) return "";

    const base = location.href.split("?")[0].split("#")[0].replace(/[^\/]*$/, "");
    return base + "vitrine.html?b=" + boutique.slug;
}

async function copierLien() {
    const lien = lienVitrine();

    if (!lien) return;

    try {
        await navigator.clipboard.writeText(lien);
        alert("📋 Lien copié.");
    } catch (e) {
        prompt("Copiez ce lien :", lien);
    }
}

function ouvrirVitrine() {
    const lien = lienVitrine();
    if (lien) window.location.href = lien;
}
