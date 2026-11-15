/* =====================================
   DUKANI — ADMINISTRATION DES PUBLICITÉS
   Réservé au compte inscrit dans la table « admins ».
===================================== */

const SUPABASE_URL = "https://aowfjpaclhrmmhpuxauq.supabase.co";
const SUPABASE_CLE = "sb_publishable_bHKXQAMowU0qoVOp5RqlmA_Qm_LrKC6";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CLE);

const $ = id => document.getElementById(id);

let annonces = [];
let tarifs = [];
let ongletActif = "demandes";


/* ---------- Outils ---------- */

function element(tag, classe, texte) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte) e.textContent = texte;
    return e;
}

function urlPhoto(chemin) {
    return SUPABASE_URL + "/storage/v1/object/public/produits/" +
        chemin.split("/").map(encodeURIComponent).join("/");
}

function date(iso) {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function montant(n, devise) {
    return Number(n).toLocaleString("fr-FR") + " " + (devise === "USD" ? "$" : "FC");
}

function message(texte) {
    const zone = $("admin-message");
    zone.textContent = texte;
    zone.hidden = false;
}

function bouton(texte, action, classe) {
    const b = element("button", classe || "", texte);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
}


/* ---------- Démarrage ---------- */

async function demarrer() {
    const { data: { session } } = await sb.auth.getSession();

    if (!session) {
        message("Connectez-vous d'abord avec votre compte sur la page d'accueil, puis revenez ici.");
        return;
    }

    const { data, error } = await sb.rpc("est_admin");

    if (error || data !== true) {
        message("Cette page est réservée à l'administrateur de Dukani.");
        return;
    }

    $("admin-contenu").hidden = false;

    await tout();
}

async function tout() {
    await Promise.all([chargerResume(), chargerAnnonces(), chargerTarifs(), chargerInstructions(), chargerBoutiquesAdmin()]);
    afficherOnglet(ongletActif);
}


/* ---------- Résumé ---------- */

async function chargerResume() {
    const { data, error } = await sb.rpc("admin_resume");
    const zone = $("admin-resume");

    zone.textContent = "";

    if (error || !data) return;

    const carte = (valeur, libelle) => {
        const c = element("div", "resume-carte");
        c.appendChild(element("strong", "", valeur));
        c.appendChild(element("small", "", libelle));
        zone.appendChild(c);
    };

    const encaisse = (data.encaisse || []).map(e => montant(e.total, e.devise)).join(" · ");

    carte(String(data.en_attente), "À traiter");
    carte(String(data.actives), "En ligne");
    carte(encaisse || "0", "Encaissé");
}


/* ---------- Publicités ---------- */

async function chargerAnnonces() {
    const { data, error } = await sb.rpc("admin_publicites");

    if (error) {
        message("⚠️ " + error.message);
        return;
    }

    annonces = data || [];
}

async function traiter(id, action, confirmation) {
    if (confirmation && !confirm(confirmation)) return;

    const { error } = await sb.rpc("admin_traiter_publicite", { p_id: id, p_action: action });

    if (error) {
        alert("⚠️ " + error.message);
        return;
    }

    await tout();
}

function carteAnnonce(a) {
    const carte = element("div", "produit-item");

    if (a.image_path) {
        const img = element("img", "photo-statut");
        img.src = urlPhoto(a.image_path);
        img.alt = a.titre;
        img.loading = "lazy";
        carte.appendChild(img);
    }

    carte.appendChild(element("h3", "", a.titre));
    if (a.texte) carte.appendChild(element("p", "", a.texte));

    carte.appendChild(element("p", "", "Boutique : " + (a.boutique || "(supprimée)")));
    if (a.email) carte.appendChild(element("p", "", "Email : " + a.email));
    if (a.telephone) carte.appendChild(element("p", "", "Téléphone : " + a.telephone));

    carte.appendChild(element("p", "",
        a.duree_jours + (a.duree_jours > 1 ? " jours" : " jour") + " : " + montant(a.prix, a.devise)));

    carte.appendChild(element("p", "",
        a.reference_paiement
            ? "Référence de paiement : " + a.reference_paiement
            : "Aucune référence de paiement saisie"));

    if (a.debut) {
        carte.appendChild(element("p", "", "Du " + date(a.debut) + " au " + date(a.fin)));
        carte.appendChild(element("p", "", "Vues : " + a.vues + " · Clics : " + a.clics));
    } else {
        carte.appendChild(element("p", "", "Demandée le " + date(a.created_at)));
    }

    const actions = element("div", "actions-produit");

    if (a.etat === "en_attente" || a.etat === "refusee") {
        actions.appendChild(bouton(
            a.etat === "refusee" ? "Activer" : "Paiement reçu : mettre en ligne",
            () => traiter(a.id, "activer",
                "Mettre en ligne cette publicité pour " + a.duree_jours + " jour(s), à partir de maintenant ?")));
    }

    if (a.etat === "en_attente") {
        actions.appendChild(bouton("Refuser", () => traiter(a.id, "refuser", "Refuser cette demande ?")));
    }

    if (a.etat === "active") {
        actions.appendChild(bouton("Mettre en pause", () => traiter(a.id, "pause")));
    }

    if (a.etat === "pause") {
        actions.appendChild(bouton("Reprendre", () => traiter(a.id, "reprendre")));
    }

    actions.appendChild(bouton("Supprimer", () => traiter(a.id, "supprimer", "Supprimer définitivement cette publicité ?")));
    carte.appendChild(actions);

    return carte;
}

function afficherOnglet(nom) {
    ongletActif = nom;

    document.querySelectorAll("#admin-onglets button").forEach(b => {
        b.classList.toggle("actif", b.getAttribute("data-onglet") === nom);
    });

    const liste = $("admin-liste");
    liste.textContent = "";

    $("admin-tarifs").hidden = nom !== "tarifs";
    $("admin-boutiques").hidden = nom !== "boutiques";
    liste.hidden = nom === "tarifs" || nom === "boutiques";

    if (nom === "tarifs" || nom === "boutiques") return;

    const filtres = {
        demandes: a => a.etat === "en_attente",
        actives: a => a.etat === "active" || a.etat === "pause",
        historique: a => a.etat === "terminee" || a.etat === "refusee"
    };

    const visibles = annonces.filter(filtres[nom]);

    if (visibles.length === 0) {
        liste.appendChild(element("p", "fil-vide", "Rien à afficher ici."));
        return;
    }

    visibles.forEach(a => liste.appendChild(carteAnnonce(a)));
}

$("admin-onglets").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b) afficherOnglet(b.getAttribute("data-onglet"));
});


/* ---------- Boutiques vérifiées ---------- */

async function chargerBoutiquesAdmin() {
    const { data, error } = await sb.rpc("admin_boutiques");
    const liste = $("liste-boutiques-admin");

    liste.textContent = "";

    if (error || !Array.isArray(data)) {
        liste.appendChild(element("p", "fil-vide", "⚠️ Impossible de charger les boutiques."));
        return;
    }

    if (data.length === 0) {
        liste.appendChild(element("p", "fil-vide", "Aucune boutique pour le moment."));
        return;
    }

    data.forEach(b => {
        const carte = element("div", "produit-item");

        carte.appendChild(element("h3", "", b.nom));
        if (b.email) carte.appendChild(element("p", "", "Email : " + b.email));
        if (b.telephone) carte.appendChild(element("p", "", "Téléphone : " + b.telephone));
        carte.appendChild(element("p", "", b.nb_produits + " produit(s) · " + b.abonnes + " abonné(s)"));
        carte.appendChild(element("p", "", b.verifiee ? "Boutique vérifiée" : "Non vérifiée"));

        const actions = element("div", "actions-produit");

        actions.appendChild(bouton(b.verifiee ? "Retirer le badge" : "Marquer comme vérifiée", async () => {
            const { error: erreur } = await sb.rpc("admin_verifier_boutique", {
                p_slug: b.slug,
                p_verifiee: !b.verifiee
            });

            if (erreur) { alert("⚠️ " + erreur.message); return; }

            await chargerBoutiquesAdmin();
        }));

        carte.appendChild(actions);
        liste.appendChild(carte);
    });
}


/* ---------- Tarifs ---------- */

async function chargerTarifs() {
    const { data, error } = await sb.from("pub_tarifs").select("*")
        .order("devise").order("duree_jours");

    tarifs = !error && data ? data : [];

    const liste = $("liste-tarifs");
    liste.textContent = "";

    if (tarifs.length === 0) {
        liste.appendChild(element("p", "fil-vide", "Aucun tarif. Ajoutez-en un ci-dessous."));
        return;
    }

    tarifs.forEach(t => {
        const carte = element("div", "produit-item");

        carte.appendChild(element("h3", "",
            t.duree_jours + (t.duree_jours > 1 ? " jours" : " jour") + " : " + montant(t.prix, t.devise)));
        carte.appendChild(element("p", "", t.actif ? "Proposé aux boutiques" : "Désactivé"));

        const actions = element("div", "actions-produit");

        actions.appendChild(bouton(t.actif ? "Désactiver" : "Activer", async () => {
            const { error: erreur } = await sb.from("pub_tarifs").update({ actif: !t.actif }).eq("id", t.id);
            if (erreur) { alert("⚠️ " + erreur.message); return; }
            await chargerTarifs();
        }));

        actions.appendChild(bouton("Supprimer", async () => {
            if (!confirm("Supprimer ce tarif ?")) return;
            const { error: erreur } = await sb.from("pub_tarifs").delete().eq("id", t.id);
            if (erreur) { alert("⚠️ " + erreur.message); return; }
            await chargerTarifs();
        }));

        carte.appendChild(actions);
        liste.appendChild(carte);
    });
}

async function ajouterTarif() {
    const duree = Number($("tarif-duree").value);
    const prix = Number($("tarif-prix").value);

    if (!Number.isInteger(duree) || duree < 1 || duree > 365) {
        alert("⚠️ La durée doit être un nombre entier de jours (1 à 365).");
        return;
    }

    if (!Number.isFinite(prix) || prix < 0 || $("tarif-prix").value === "") {
        alert("⚠️ Entrez un prix valide.");
        return;
    }

    const { error } = await sb.from("pub_tarifs").insert({
        duree_jours: duree,
        prix: prix,
        devise: $("tarif-devise").value
    });

    if (error) { alert("⚠️ " + error.message); return; }

    $("tarif-duree").value = "";
    $("tarif-prix").value = "";

    await chargerTarifs();
}


/* ---------- Instructions de paiement ---------- */

async function chargerInstructions() {
    const { data } = await sb.from("pub_reglages").select("instructions").eq("id", 1).maybeSingle();
    $("instructions").value = data ? data.instructions : "";
}

async function enregistrerInstructions() {
    const { error } = await sb.from("pub_reglages")
        .update({ instructions: $("instructions").value.trim() })
        .eq("id", 1);

    if (error) { alert("⚠️ " + error.message); return; }

    alert("✅ Instructions enregistrées.");
}


demarrer();
