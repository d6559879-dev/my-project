/* =====================================
   SHOPBUILDER — place de marché
   (accueil public + espace acheteur)
===================================== */

const SUPABASE_URL = "https://aowfjpaclhrmmhpuxauq.supabase.co";
const SUPABASE_CLE = "sb_publishable_bHKXQAMowU0qoVOp5RqlmA_Qm_LrKC6";

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

async function chargerBoutiques() {
    const terme = $("recherche").value.trim().slice(0, 60);
    const zone = $("liste-boutiques");

    const { data, error } = await sb.rpc("marche_boutiques", {
        p_recherche: terme || null
    });

    zone.innerHTML = "";

    if (error) {
        ligne(zone, "p", "⚠️ Impossible de charger les boutiques. Réessayez.");
        return;
    }

    if (!data || data.length === 0) {
        ligne(zone, "p", terme ? "Aucune boutique trouvée." : "Aucune boutique pour le moment.");
        return;
    }

    data.forEach(b => {
        const carte = document.createElement("a");
        carte.className = "produit-item carte-boutique";
        carte.href = "vitrine.html?b=" + encodeURIComponent(b.slug);

        if (b.apercu) {
            const photo = document.createElement("img");
            photo.src = urlPhoto(b.apercu);
            photo.alt = b.nom;
            photo.className = "photo-boutique";
            photo.loading = "lazy";
            carte.appendChild(photo);
        } else {
            ligne(carte, "div", "🏪").className = "sans-photo";
        }

        ligne(carte, "h3", b.nom);
        if (b.description) ligne(carte, "p", b.description);
        ligne(carte, "p", "📦 " + b.nb + (b.nb > 1 ? " produits" : " produit"));

        zone.appendChild(carte);
    });
}

$("recherche").addEventListener("input", function () {
    clearTimeout(minuteurRecherche);
    minuteurRecherche = setTimeout(chargerBoutiques, 300);
});


/* ---------- Connexion acheteur ---------- */

function erreurAuth(message, succes) {
    const zone = $("a-erreur");
    zone.textContent = message || "";
    zone.style.color = succes ? "#15803d" : "";
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
                options: { data: { nom: nom, role: "acheteur" } }
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

    ["a-nom", "a-email", "a-mdp", "a-confirm"].forEach(id => { $(id).value = ""; });
    erreurAuth("");
    if (modeInscription) basculerAuth();
    fermer("auth");

    /* Retour vers la boutique où l'achat a commencé */

    const retour = params.get("retour");

    if (role === "acheteur" && retour &&
        /^vitrine\.html\?b=[a-z0-9-]{3,60}$/.test(retour)) {
        location.href = retour;
    }
}

function ouvrirCompte() {
    if (!utilisateur) { ouvrirAuth(); return; }

    $("c-nom").textContent = nomProfil || "-";
    $("c-email").textContent = utilisateur.email || "-";
    $("c-acheteur").hidden = role === "vendeur";
    $("c-vendeur").hidden = role !== "vendeur";

    ouvrir("compte");
}

async function deconnexion() {
    await sb.auth.signOut();

    utilisateur = null;
    role = null;
    nomProfil = "";

    ["compte", "mes-commandes"].forEach(fermer);
    $("liste-mes-commandes").innerHTML = "";
}

sb.auth.onAuthStateChange(function (evenement, session) {
    if (session && (!utilisateur || utilisateur.id !== session.user.id)) {
        setTimeout(() => ouvrirSession(session.user), 0);
    } else if (!session && utilisateur) {
        utilisateur = null;
        role = null;
    }
});


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
        ligne(liste, "p", "Aucune commande pour le moment.").style.color = "#4d6a88";
    } else {
        data.forEach(c => {
            const carte = document.createElement("div");
            carte.className = "produit-item";

            ligne(carte, "h3", c.quantite + " × " + c.nom_produit);
            ligne(carte, "p", "🏪 " + (c.boutique_nom || "Boutique") + " · " +
                new Date(c.created_at).toLocaleDateString("fr-FR"));
            ligne(carte, "p", icones[c.statut] + " " + c.statut);
            ligne(carte, "strong", Number(c.total).toLocaleString("fr-FR") + " " +
                (c.devise === "USD" ? "$" : "FC")).className = "produit-prix";

            liste.appendChild(carte);
        });
    }

    fermer("compte");
    ouvrir("mes-commandes");
}

["a-nom", "a-email", "a-mdp", "a-confirm"].forEach(id => {
    $(id).addEventListener("keydown", e => {
        if (e.key === "Enter") validerAuth();
    });
});


/* ---------- Démarrage ---------- */

chargerBoutiques();

sb.auth.getSession().then(({ data }) => {
    if (!data.session && params.get("connexion")) ouvrirAuth();
});
