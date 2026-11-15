/* =====================================
   DUKANI — vitrine publique
===================================== */

const SUPABASE_URL = "https://aowfjpaclhrmmhpuxauq.supabase.co";
const SUPABASE_CLE = "sb_publishable_bHKXQAMowU0qoVOp5RqlmA_Qm_LrKC6";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CLE);
const $ = id => document.getElementById(id);

const slug = new URLSearchParams(location.search).get("b");

let boutique = null;
let choisi = null;

function prix(n) {
    const monnaie = boutique && boutique.devise === "USD" ? "$" : "FC";
    return Number(n).toLocaleString("fr-FR") + " " + monnaie;
}

function urlPhoto(chemin) {
    return SUPABASE_URL + "/storage/v1/object/public/produits/" +
        chemin.split("/").map(encodeURIComponent).join("/");
}

function ligne(parent, tag, texte) {
    const el = document.createElement(tag);
    el.textContent = texte;
    parent.appendChild(el);
    return el;
}

function introuvable() {
    $("v-nom").textContent = "Boutique introuvable";
    $("v-description").textContent = "Vérifiez le lien que vous avez reçu.";
    $("v-produits").innerHTML = "";
}

async function charger() {
    if (!slug || !/^[a-z0-9-]{3,60}$/.test(slug)) { introuvable(); return; }

    const { data, error } = await sb.rpc("vitrine", { p_slug: slug });

    if (error || !data) { introuvable(); return; }

    boutique = data;
    afficher();
}

/* Numéro au format international (chiffres seuls) pour wa.me.
   Un numéro local congolais (08…, 09…) devient 2438…, 2439… */

function numeroWhatsApp(brut) {
    let chiffres = String(brut).replace(/[^0-9]/g, "");

    if (String(brut).trim().startsWith("+")) {
        /* déjà international */
    } else if (chiffres.startsWith("00")) {
        chiffres = chiffres.slice(2);
    } else if (chiffres.startsWith("0")) {
        chiffres = "243" + chiffres.slice(1);
    } else if (chiffres.length === 9) {
        chiffres = "243" + chiffres;
    }

    return chiffres.length >= 9 && chiffres.length <= 15 ? chiffres : "";
}

/* Icône du sprite SVG de la page */

function iconeVitrine(nom) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const use = document.createElementNS(ns, "use");

    svg.setAttribute("class", "ic");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#ic-" + nom);
    svg.appendChild(use);

    return svg;
}

function allerSeConnecter() {
    location.href = "index.html?connexion=1&retour=" +
        encodeURIComponent("vitrine.html?b=" + slug);
}

/* Bouton « Suivre » avec le nombre d'abonnés */

function majBoutonSuivre() {
    const b = $("v-suivre");
    if (!b) return;

    if (boutique.ma_boutique) {
        b.hidden = true;
        return;
    }

    const n = boutique.abonnes || 0;

    b.hidden = false;
    b.textContent = "";
    b.classList.toggle("suivi", !!boutique.suivi);
    b.appendChild(iconeVitrine(boutique.suivi ? "check" : "add"));
    b.appendChild(document.createTextNode(
        (boutique.suivi ? "Suivie" : "Suivre") +
        (n > 0 ? " · " + n + (n > 1 ? " abonnés" : " abonné") : "")));
}

function afficher() {
    document.title = boutique.nom;
    $("v-logo").textContent = boutique.nom;
    $("v-nom").textContent = boutique.nom;
    if (boutique.verifiee) $("v-nom").appendChild(badgeVerifieVitrine());
    $("v-description").textContent = boutique.description || "";
    majBoutonSuivre();
    majNoteBoutique();

    if (!avisCharges) {
        avisCharges = true;
        chargerAvis();
    }

    if (boutique.image_path) {
        let photo = $("v-photo");

        /* Si la page n'a pas encore l'emplacement de la photo, on le crée */
        if (!photo) {
            photo = document.createElement("img");
            photo.id = "v-photo";
            photo.className = "photo-hero";
            const entete = $("v-nom").parentElement;
            entete.insertBefore(photo, entete.firstChild);
        }

        photo.src = urlPhoto(boutique.image_path);
        photo.alt = boutique.nom;
        photo.hidden = false;
    }

    if (boutique.telephone) {
        const lien = $("v-tel");
        lien.hidden = false;
        lien.href = "tel:" + boutique.telephone.replace(/[^0-9+]/g, "");

        /* Même numéro pour WhatsApp */
        const numeroWa = numeroWhatsApp(boutique.telephone);

        if (numeroWa && $("v-whatsapp")) {
            const wa = $("v-whatsapp");
            const message = "Bonjour, je vous contacte depuis votre boutique « " +
                boutique.nom + " » sur Dukani.";
            wa.hidden = false;
            wa.href = "https://wa.me/" + numeroWa + "?text=" + encodeURIComponent(message);
        }
    }

    const zone = $("v-produits");
    zone.innerHTML = "";

    if (boutique.produits.length === 0) {
        const vide = ligne(zone, "p", "Aucun produit pour le moment.");
        vide.style.color = "var(--encre-douce)";
        return;
    }

    boutique.produits.forEach(p => {
        const carte = document.createElement("button");
        carte.type = "button";
        carte.className = "produit-carte";

        const vignette = document.createElement("div");
        vignette.className = "produit-vignette";

        const chemins = cheminsProduit(p);

        if (chemins.length) {
            const img = document.createElement("img");
            img.src = urlPhoto(chemins[0]);
            img.alt = p.nom;
            img.loading = "lazy";
            vignette.appendChild(img);
        } else {
            vignette.appendChild(iconeVitrine("box"));
        }

        if (p.stock <= 0) {
            const rupture = document.createElement("span");
            rupture.className = "etiquette-rupture";
            rupture.textContent = "Rupture de stock";
            vignette.appendChild(rupture);
        }

        carte.appendChild(vignette);
        ligne(carte, "p", p.nom).className = "produit-carte-nom";
        ligne(carte, "strong", prix(p.prix)).className = "produit-carte-prix";

        carte.addEventListener("click", () => ouvrirProduit(p));
        zone.appendChild(carte);
    });

    /* Ouverture directe d'un produit depuis l'accueil : ?p=… */

    if (!produitDirectOuvert) {
        produitDirectOuvert = true;

        const idDirect = new URLSearchParams(location.search).get("p");
        const direct = idDirect && boutique.produits.find(x => x.id === idDirect);

        if (direct) ouvrirProduit(direct);
    }
}

/* ---------- Fiche produit (plusieurs photos) ---------- */

let produitDirectOuvert = false;
let produitOuvert = null;
let avisCharges = false;
let infosAvis = null;
let noteChoisie = 0;

function ouvrirFenetre(id) { $(id).classList.add("active"); }
function fermerFenetre(id) { $(id).classList.remove("active"); }

function cheminsProduit(p) {
    if (Array.isArray(p.images) && p.images.length) return p.images;
    return p.image_path ? [p.image_path] : [];
}

function badgeVerifieVitrine() {
    const icone = iconeVitrine("verified");
    icone.setAttribute("class", "ic badge-verifie");
    icone.setAttribute("aria-label", "Boutique vérifiée");
    return icone;
}

function etoiles(note) {
    const zone = document.createElement("span");
    zone.className = "etoiles";

    for (let i = 1; i <= 5; i++) {
        zone.appendChild(iconeVitrine(i <= Math.round(note) ? "star-plein" : "star-ligne"));
    }

    return zone;
}

function majEnregistrerProduit() {
    const b = $("pp-enregistrer");
    b.textContent = "";
    b.classList.toggle("actif", !!(produitOuvert && produitOuvert.enregistre));
    b.appendChild(iconeVitrine(produitOuvert && produitOuvert.enregistre ? "bookmark-plein" : "bookmark-ligne"));
}

function ouvrirProduit(p) {
    produitOuvert = p;

    $("pp-titre").textContent = p.nom;

    const corps = $("pp-corps");
    corps.textContent = "";

    const chemins = cheminsProduit(p);

    if (chemins.length) {
        const galerie = document.createElement("div");
        galerie.className = "galerie";

        chemins.forEach((chemin, n) => {
            const img = document.createElement("img");
            img.src = urlPhoto(chemin);
            img.alt = p.nom + " (photo " + (n + 1) + ")";
            img.loading = n === 0 ? "eager" : "lazy";
            galerie.appendChild(img);
        });

        corps.appendChild(galerie);

        if (chemins.length > 1) {
            const points = document.createElement("div");
            points.className = "galerie-points";

            chemins.forEach((_, n) => {
                const point = document.createElement("i");
                if (n === 0) point.className = "actif";
                points.appendChild(point);
            });

            galerie.addEventListener("scroll", () => {
                const courant = Math.round(galerie.scrollLeft / Math.max(1, galerie.clientWidth));
                points.querySelectorAll("i").forEach((point, n) => point.classList.toggle("actif", n === courant));
            });

            corps.appendChild(points);
        }
    } else {
        const vide = document.createElement("div");
        vide.className = "galerie-vide";
        vide.appendChild(iconeVitrine("box"));
        corps.appendChild(vide);
    }

    ligne(corps, "strong", prix(p.prix)).className = "pp-prix";
    ligne(corps, "h2", p.nom).className = "pp-nom";

    const infos = document.createElement("div");
    infos.className = "pp-infos";

    const stock = document.createElement("span");
    stock.className = "pp-stock" + (p.stock > 0 ? "" : " rupture");
    stock.textContent = p.stock > 0 ? p.stock + " en stock" : "Rupture de stock";
    infos.appendChild(stock);

    const categorie = document.createElement("span");
    categorie.className = "pp-categorie";
    categorie.textContent = p.categorie;
    infos.appendChild(categorie);

    corps.appendChild(infos);

    if (p.description) {
        ligne(corps, "h3", "Description").className = "menu-titre";
        ligne(corps, "p", p.description).className = "pp-description";
    }

    /* La boutique */

    const carteBoutique = document.createElement("button");
    carteBoutique.type = "button";
    carteBoutique.className = "pp-boutique";

    const avatar = document.createElement("div");
    avatar.className = "conversation-avatar";

    if (boutique.image_path) {
        const logo = document.createElement("img");
        logo.src = urlPhoto(boutique.image_path);
        logo.alt = "";
        avatar.appendChild(logo);
    } else {
        avatar.appendChild(iconeVitrine("store-plein"));
    }

    const texte = document.createElement("div");
    texte.className = "conversation-corps";

    const nom = document.createElement("strong");
    nom.textContent = boutique.nom;
    if (boutique.verifiee) nom.appendChild(badgeVerifieVitrine());
    texte.appendChild(nom);

    const detail = document.createElement("p");
    detail.textContent = boutique.nb_avis > 0
        ? "Note " + String(boutique.note_moyenne).replace(".", ",") + " sur 5 · " + boutique.nb_avis + (boutique.nb_avis > 1 ? " avis" : " avis")
        : "Voir la boutique";
    texte.appendChild(detail);

    carteBoutique.appendChild(avatar);
    carteBoutique.appendChild(texte);
    carteBoutique.addEventListener("click", fermerProduit);
    corps.appendChild(carteBoutique);

    $("pp-commander").disabled = p.stock <= 0;
    majEnregistrerProduit();

    ouvrirFenetre("produit");
    corps.scrollTop = 0;
}

function fermerProduit() {
    fermerFenetre("produit");
    produitOuvert = null;
}

$("pp-commander").addEventListener("click", () => {
    if (produitOuvert) ouvrirCommande(produitOuvert);
});

$("pp-discuter").addEventListener("click", () => {
    const bouton = $("v-discuter");
    if (bouton) bouton.click();
});

$("pp-enregistrer").addEventListener("click", async () => {
    if (!produitOuvert) return;
    if (!connecte) { allerSeConnecter(); return; }

    const { data, error } = await sb.rpc("basculer_enregistrement_produit", { p_produit: produitOuvert.id });

    if (error) { alert("⚠️ " + error.message); return; }

    produitOuvert.enregistre = data === true;
    majEnregistrerProduit();
});


/* ---------- Note et avis clients ---------- */

function majNoteBoutique() {
    const zone = $("v-note");
    if (!zone) return;

    zone.textContent = "";

    if (!boutique.nb_avis) {
        zone.hidden = true;
        return;
    }

    zone.appendChild(etoiles(boutique.note_moyenne));
    zone.appendChild(document.createTextNode(
        " " + String(boutique.note_moyenne).replace(".", ",") + " · " + boutique.nb_avis +
        (boutique.nb_avis > 1 ? " avis" : " avis")));
    zone.hidden = false;
}

async function chargerAvis() {
    const { data, error } = await sb.rpc("avis_boutique", { p_slug: slug });

    if (error || !data) return;

    infosAvis = data;
    boutique.note_moyenne = data.note_moyenne;
    boutique.nb_avis = data.nb_avis;
    majNoteBoutique();

    const resume = $("v-avis-resume");
    resume.textContent = "";

    if (data.nb_avis > 0) {
        ligne(resume, "strong", String(data.note_moyenne).replace(".", ","));
        resume.appendChild(etoiles(data.note_moyenne));
        ligne(resume, "small", data.nb_avis + (data.nb_avis > 1 ? " avis" : " avis"));
    } else {
        ligne(resume, "p", "Aucun avis pour le moment.");
    }

    const liste = $("v-avis-liste");
    liste.textContent = "";

    (data.avis || []).forEach(a => {
        const ligneAvis = document.createElement("div");
        ligneAvis.className = "avis-ligne";

        const haut = document.createElement("div");
        haut.className = "avis-haut";
        haut.appendChild(ligne(haut, "strong", a.auteur));
        haut.appendChild(etoiles(a.note));
        ligne(haut, "small", new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }));
        ligneAvis.appendChild(haut);

        if (a.commentaire) ligne(ligneAvis, "p", a.commentaire);

        liste.appendChild(ligneAvis);
    });

    $("v-donner-avis").hidden = !data.peut_noter;
    $("v-donner-avis").textContent = data.mon_avis ? "Modifier mon avis" : "Donner mon avis";
    $("v-avis-aide").hidden = !!data.peut_noter || !!(data.nb_avis > 0 && connecte);
}

function majEtoilesSaisie() {
    document.querySelectorAll("#avis-etoiles button").forEach((b, n) => {
        b.textContent = "";
        b.appendChild(iconeVitrine(n < noteChoisie ? "star-plein" : "star-ligne"));
    });
}

function ouvrirAvis() {
    if (!connecte) { allerSeConnecter(); return; }

    const zone = $("avis-etoiles");

    if (!zone.children.length) {
        for (let i = 1; i <= 5; i++) {
            const b = document.createElement("button");
            b.type = "button";
            b.setAttribute("aria-label", i + " sur 5");
            b.addEventListener("click", () => { noteChoisie = i; majEtoilesSaisie(); });
            zone.appendChild(b);
        }
    }

    const mon = infosAvis && infosAvis.mon_avis;

    noteChoisie = mon ? mon.note : 0;
    $("avis-commentaire").value = mon && mon.commentaire ? mon.commentaire : "";
    $("avis-supprimer").hidden = !mon;

    majEtoilesSaisie();
    ouvrirFenetre("avis-modal");
}

async function envoyerAvis() {
    if (!noteChoisie) {
        alert("⚠️ Choisissez une note de 1 à 5 étoiles.");
        return;
    }

    const { error } = await sb.rpc("laisser_avis", {
        p_slug: slug,
        p_note: noteChoisie,
        p_commentaire: $("avis-commentaire").value.trim() || null
    });

    if (error) { alert("⚠️ " + error.message); return; }

    fermerFenetre("avis-modal");
    await chargerAvis();
}

async function supprimerAvis() {
    if (!confirm("Supprimer votre avis ?")) return;

    const { error } = await sb.rpc("supprimer_mon_avis", { p_slug: slug });

    if (error) { alert("⚠️ " + error.message); return; }

    fermerFenetre("avis-modal");
    await chargerAvis();
}

$("v-donner-avis").addEventListener("click", ouvrirAvis);

async function ouvrirCommande(p) {
    const { data: { session } } = await sb.auth.getSession();

    if (!session) {
        location.href = "index.html?connexion=1&retour=" +
            encodeURIComponent("vitrine.html?b=" + slug);
        return;
    }

    const { data: profil } = await sb.from("profils").select("role,nom").maybeSingle();

    if (!profil || profil.role !== "acheteur") {
        alert("⚠️ Seuls les comptes acheteurs peuvent commander. Connectez-vous avec un compte acheteur.");
        return;
    }

    ouvrirFormulaire(p, profil.nom);
}

function ouvrirFormulaire(p, nom) {
    choisi = p;
    $("c-client").value = nom || "";
    $("c-produit").textContent = p.nom + " — " + prix(p.prix);
    $("c-quantite").value = "1";
    $("c-quantite").max = Math.min(p.stock, 20);

    /* Modes de paiement proposés par la boutique */
    const choix = $("c-paiement");
    choix.innerHTML = "";

    const livraison = document.createElement("option");
    livraison.value = "livraison";
    livraison.textContent = "💵 Payer à la livraison";
    choix.appendChild(livraison);

    if (boutique.paiement_mobile) {
        const mobile = document.createElement("option");
        mobile.value = "mobile_money";
        mobile.textContent = "📱 Mobile money (" + boutique.paiement_operateur + ")";
        choix.appendChild(mobile);
    }

    $("c-paiement-bloc").hidden = !boutique.paiement_mobile;

    $("commande").classList.add("active");
}

function fermerCommande() {
    $("commande").classList.remove("active");
}

async function envoyerCommande() {
    const quantite = Number($("c-quantite").value);
    const client = $("c-client").value.trim();
    const telephone = $("c-telephone").value.trim();

    if (!Number.isInteger(quantite) || quantite < 1 || quantite > Math.min(choisi.stock, 20)) {
        alert("⚠️ Quantité invalide (maximum " + Math.min(choisi.stock, 20) + ").");
        return;
    }

    if (client === "") { alert("⚠️ Entrez votre nom."); return; }

    if (telephone.length < 6) { alert("⚠️ Entrez un numéro de téléphone valide."); return; }

    const bt = $("c-bouton");
    bt.disabled = true;

    const mode = $("c-paiement").value || "livraison";

    const { data: idCommande, error } = await sb.rpc("commander_vitrine", {
        p_slug: slug,
        p_produit: choisi.id,
        p_quantite: quantite,
        p_client: client,
        p_telephone: telephone,
        p_mode: mode
    });

    bt.disabled = false;

    if (error) { alert("⚠️ " + error.message); return; }

    $("c-client").value = "";
    $("c-telephone").value = "";
    fermerCommande();

    /* Mobile money : on passe directement aux instructions de paiement */
    if (mode === "mobile_money" && idCommande) {
        location.href = "index.html?payer=" + encodeURIComponent(idCommande);
        return;
    }

    alert("✅ Commande envoyée ! Vous paierez à la livraison. " +
        "Retrouvez-la dans Mon compte, sur la page d'accueil.");

    charger();
}

charger();


/* ---------- Nouveaux arrivages (statuts) ---------- */

let connecte = false;

sb.auth.getSession().then(({ data }) => { connecte = !!data.session; });
sb.auth.onAuthStateChange((evenement, session) => { connecte = !!session; });

async function chargerStatutsBoutique() {
    const { data, error } = await sb.rpc("statuts_boutique", { p_slug: slug });

    if (error || !Array.isArray(data) || data.length === 0) return;

    const bouton = $("v-statuts");
    if (!bouton) return;

    bouton.textContent = "📣 Nouveaux arrivages (" + data.length + ")";
    bouton.hidden = false;

    bouton.addEventListener("click", () => {
        window.ouvrirStatuts(
            [{ slug: slug, nom: boutique ? boutique.nom : "Boutique", statuts: data }],
            0,
            {
                urlPhoto: urlPhoto,
                voirBoutique: false,
                rpc: (nomFonction, args) => sb.rpc(nomFonction, args),
                connecte: () => connecte,
                demanderConnexion: () => {
                    location.href = "index.html?connexion=1&retour=" +
                        encodeURIComponent("vitrine.html?b=" + slug);
                }
            }
        );
    });
}

chargerStatutsBoutique();


/* ---------- Discuter avec la boutique ---------- */

const boutonDiscuter = $("v-discuter");

if (boutonDiscuter) {
    boutonDiscuter.addEventListener("click", async function () {
        if (!connecte) {
            location.href = "index.html?connexion=1&retour=" +
                encodeURIComponent("vitrine.html?b=" + slug);
            return;
        }

        boutonDiscuter.disabled = true;

        const { data, error } = await sb.rpc("ouvrir_conversation", { p_slug: slug });

        boutonDiscuter.disabled = false;

        if (error || !data) {
            alert("⚠️ " + (error ? error.message : "Impossible d'ouvrir la discussion."));
            return;
        }

        location.href = "index.html?conversation=" + encodeURIComponent(data);
    });
}


/* ---------- Paramètres : compte ---------- */

window.remplirParametresCompte = function (zone) {
    const titre = document.createElement("label");
    titre.textContent = "Compte";
    zone.appendChild(titre);

    const bouton = document.createElement("button");
    bouton.type = "button";

    if (connecte) {
        bouton.className = "bouton-danger";
        bouton.textContent = "Se déconnecter";
        bouton.addEventListener("click", async () => {
            await sb.auth.signOut();
            location.reload();
        });
    } else {
        bouton.className = "bouton-secondaire";
        bouton.textContent = "Se connecter ou créer un compte";
        bouton.addEventListener("click", () => {
            location.href = "index.html?connexion=1&retour=" +
                encodeURIComponent("vitrine.html?b=" + slug);
        });
    }

    zone.appendChild(bouton);
};


/* ---------- Suivre la boutique ---------- */

const boutonSuivre = $("v-suivre");

if (boutonSuivre) {
    boutonSuivre.addEventListener("click", async () => {
        if (!connecte) { allerSeConnecter(); return; }

        boutonSuivre.disabled = true;

        const { data, error } = await sb.rpc("basculer_abonnement", { p_slug: slug });

        boutonSuivre.disabled = false;

        if (error) { alert("⚠️ " + error.message); return; }

        const suivi = data === true;

        boutique.suivi = suivi;
        boutique.abonnes = Math.max(0, (boutique.abonnes || 0) + (suivi ? 1 : -1));
        majBoutonSuivre();
    });
}
