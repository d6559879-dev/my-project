/* =====================================
   SHOPBUILDER — version Supabase
===================================== */

const SUPABASE_URL = "https://aowfjpaclhrmmhpuxauq.supabase.co";
const SUPABASE_CLE = "sb_publishable_bHKXQAMowU0qoVOp5RqlmA_Qm_LrKC6";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CLE);

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
function fermerCreation() { fermer("creation"); }

async function creerBoutique() {
    const nom = $("nom-boutique").value.trim();

    if (nom === "") {
        alert("⚠️ Veuillez entrer le nom de votre boutique.");
        return;
    }

    const existait = !!boutique;

    const { error } = await sb.from("boutiques").upsert({
        user_id: utilisateur.id,
        nom: nom,
        description: $("description").value.trim(),
        telephone: $("telephone").value.trim(),
        devise: $("devise").value
    }, { onConflict: "user_id" });

    if (error) { echec(error); return; }

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
    $("lien-vitrine").textContent = lienVitrine() || "-";

    ouvrir("ma-boutique");
}

function fermerMaBoutique() { fermer("ma-boutique"); }

function modifierBoutique() {
    $("nom-boutique").value = boutique ? boutique.nom : "";
    $("description").value = boutique ? boutique.description || "" : "";
    $("telephone").value = boutique ? boutique.telephone || "" : "";
    $("devise").value = boutique ? boutique.devise : "FC";

    fermerMaBoutique();
    ouvrirCreation();
}

async function supprimerBoutique() {
    if (!confirm("⚠️ Voulez-vous vraiment supprimer cette boutique ?")) return;

    const { error } = await sb.from("boutiques")
        .delete().eq("user_id", utilisateur.id);

    if (error) { echec(error); return; }

    await charger();
    fermerMaBoutique();
    alert("🗑️ Boutique supprimée.");
}


/* ---------- Photo ---------- */

async function compresser(fichier) {
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

    const ratio = Math.min(1, 600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

    return new Promise(ok => canvas.toBlob(ok, "image/jpeg", 0.7));
}

function viderApercu() {
    $("image-produit").value = "";
    $("apercu-produit").src = "";
    $("apercu-produit").style.display = "none";
}

$("image-produit").addEventListener("change", function () {
    const fichier = this.files[0];

    if (!fichier) { viderApercu(); return; }

    if (!fichier.type.startsWith("image/")) {
        alert("⚠️ Choisis un fichier image valide.");
        viderApercu();
        return;
    }

    const lecteur = new FileReader();
    lecteur.onload = e => {
        $("apercu-produit").src = e.target.result;
        $("apercu-produit").style.display = "block";
    };
    lecteur.readAsDataURL(fichier);
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

    let chemin = null;

    try {
        const photo = await compresser($("image-produit").files[0]);

        if (photo) {
            chemin = utilisateur.id + "/" + crypto.randomUUID() + ".jpg";

            const { error } = await sb.storage.from("produits")
                .upload(chemin, photo, { contentType: "image/jpeg" });

            if (error) { chemin = null; throw error; }
        }

        const { error } = await sb.from("produits").insert({
            nom: nom,
            prix: Number(prixSaisi),
            stock: Number(stock),
            categorie: $("categorie-produit").value,
            image_path: chemin
        });

        if (error) {
            if (chemin) await sb.storage.from("produits").remove([chemin]);
            throw error;
        }
    } catch (e) {
        echec(e);
        return;
    }

    $("nom-produit").value = "";
    $("prix-produit").value = "";
    $("stock-produit").value = "";
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
        vide.style.cssText = "text-align:center;color:#4d6a88;margin-top:25px;";
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

    const { error } = await sb.from("produits").update({
        nom: nom.trim(),
        prix: Number(nouveauPrix),
        stock: Number(stock),
        categorie: categorie.trim()
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

    if (p.image_path) {
        await sb.storage.from("produits").remove([p.image_path]);
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

async function changerStatut(id, statut) {
    let resultat;

    if (statut === "annulée") {
        if (!confirm("Annuler cette commande ? Le stock sera remis.")) return;
        resultat = await sb.rpc("annuler_commande", { p_commande: id });
    } else {
        resultat = await sb.from("commandes")
            .update({ statut: statut })
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

function afficherCommandes() {
    const liste = $("liste-commandes");
    const icones = { "en attente": "⏳", "livrée": "✅", "annulée": "❌" };

    liste.innerHTML = "";

    if (commandes.length === 0) {
        const vide = ligne(liste, "p", "Aucune commande pour le moment.");
        vide.style.cssText = "text-align:center;color:#4d6a88;margin-top:25px;";
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
        ligne(carte, "strong", prix(c.total)).className = "produit-prix";

        const actions = document.createElement("div");
        actions.className = "actions-produit";

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
    zone.style.color = succes ? "#15803d" : "";
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
                options: { data: { nom: nom, role: "vendeur" } }
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
    setTimeout(charger, 0);
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
