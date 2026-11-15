/* Visionneuse de statuts (nouveaux arrivages).
   Partagée par l'accueil de la place de marché et les vitrines. */

(function () {
    var DUREE = 6000;
    var REACTIONS = [
        { cle: "coeur", emoji: "❤️" },
        { cle: "pouce", emoji: "👍" },
        { cle: "feu", emoji: "🔥" },
        { cle: "amour", emoji: "😍" }
    ];
    var CLE_VUS = "dukani_statuts_vus";

    var groupes = [];
    var g = 0;
    var i = 0;
    var options = {};
    var minuteur = null;
    var el = null;
    var ui = {};
    var inter = null;
    var statutCourant = null;

    function lireVus() {
        try {
            return JSON.parse(localStorage.getItem(CLE_VUS)) || [];
        } catch (e) {
            return [];
        }
    }

    function marquerVu(id) {
        var vus = lireVus();
        if (vus.indexOf(id) >= 0) return;
        vus.push(id);
        try { localStorage.setItem(CLE_VUS, JSON.stringify(vus.slice(-300))); } catch (e) {}
    }

    window.statutsToutVus = function (groupe) {
        var vus = lireVus();
        return groupe.statuts.every(function (s) { return vus.indexOf(s.id) >= 0; });
    };

    function ilYa(iso) {
        var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        if (m < 1) return "à l'instant";
        if (m < 60) return "il y a " + m + " min";
        return "il y a " + Math.floor(m / 60) + " h";
    }

    function nouveau(tag, classe, texte) {
        var n = document.createElement(tag);
        if (classe) n.className = classe;
        if (texte) n.textContent = texte;
        return n;
    }

    function construire() {
        if (el) return;

        el = nouveau("div", "statut-viewer");
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-label", "Nouveaux arrivages");

        ui.barres = nouveau("div", "statut-barres");

        var entete = nouveau("div", "statut-entete");
        var qui = nouveau("div", "statut-qui");
        ui.nom = nouveau("strong");
        ui.temps = nouveau("small");
        qui.appendChild(ui.nom);
        qui.appendChild(ui.temps);

        var fermerBt = nouveau("button", "statut-fermer", "✕");
        fermerBt.type = "button";
        fermerBt.setAttribute("aria-label", "Fermer");
        fermerBt.addEventListener("click", fermer);

        entete.appendChild(qui);
        entete.appendChild(fermerBt);

        var scene = nouveau("div", "statut-scene");
        ui.image = nouveau("img");
        ui.image.alt = "";

        var gauche = nouveau("button", "statut-zone gauche");
        gauche.type = "button";
        gauche.setAttribute("aria-label", "Précédent");
        gauche.addEventListener("click", precedent);

        var droite = nouveau("button", "statut-zone droite");
        droite.type = "button";
        droite.setAttribute("aria-label", "Suivant");
        droite.addEventListener("click", suivant);

        scene.appendChild(ui.image);
        scene.appendChild(gauche);
        scene.appendChild(droite);

        var pied = nouveau("div", "statut-pied");
        ui.legende = nouveau("p");

        ui.reactions = nouveau("div", "statut-reactions");
        ui.boutonsReaction = {};
        REACTIONS.forEach(function (r) {
            var b = nouveau("button", "statut-reaction");
            b.type = "button";
            b.setAttribute("aria-label", "Réagir " + r.emoji);
            var e = nouveau("span", "", r.emoji);
            var n = nouveau("small", "", "0");
            b.appendChild(e);
            b.appendChild(n);
            b.addEventListener("click", function () { reagir(r.cle); });
            ui.reactions.appendChild(b);
            ui.boutonsReaction[r.cle] = { bouton: b, nombre: n };
        });

        ui.boutonCommentaires = nouveau("button", "statut-reaction statut-commenter");
        ui.boutonCommentaires.type = "button";
        ui.boutonCommentaires.setAttribute("aria-label", "Commentaires");
        ui.boutonCommentaires.appendChild(nouveau("span", "", "💬"));
        ui.nombreCommentaires = nouveau("small", "", "0");
        ui.boutonCommentaires.appendChild(ui.nombreCommentaires);
        ui.boutonCommentaires.addEventListener("click", ouvrirCommentaires);
        ui.reactions.appendChild(ui.boutonCommentaires);

        ui.lien = nouveau("button", "statut-lien", "🏪 Voir la boutique");
        ui.lien.type = "button";
        pied.appendChild(ui.legende);
        pied.appendChild(ui.reactions);
        pied.appendChild(ui.lien);

        /* Panneau des commentaires */
        ui.panneau = nouveau("div", "statut-panneau");
        var tete = nouveau("div", "statut-panneau-tete");
        tete.appendChild(nouveau("strong", "", "💬 Commentaires"));
        var fermerPanneau = nouveau("button", "statut-fermer", "✕");
        fermerPanneau.type = "button";
        fermerPanneau.setAttribute("aria-label", "Fermer les commentaires");
        fermerPanneau.addEventListener("click", fermerCommentaires);
        tete.appendChild(fermerPanneau);

        ui.liste = nouveau("div", "statut-liste");

        var saisie = nouveau("div", "statut-saisie");
        ui.champ = nouveau("input");
        ui.champ.type = "text";
        ui.champ.maxLength = 300;
        ui.champ.placeholder = "Écrire un commentaire…";
        ui.champ.setAttribute("aria-label", "Votre commentaire");
        ui.champ.addEventListener("focus", function () {
            if (options.connecte && !options.connecte()) {
                ui.champ.blur();
                demanderConnexion();
            }
        });
        ui.champ.addEventListener("keydown", function (e) {
            if (e.key === "Enter") commenter();
        });
        var envoyer = nouveau("button", "", "Envoyer");
        envoyer.type = "button";
        envoyer.addEventListener("click", commenter);
        saisie.appendChild(ui.champ);
        saisie.appendChild(envoyer);

        ui.panneau.appendChild(tete);
        ui.panneau.appendChild(ui.liste);
        ui.panneau.appendChild(saisie);

        el.appendChild(ui.barres);
        el.appendChild(entete);
        el.appendChild(scene);
        el.appendChild(pied);
        el.appendChild(ui.panneau);
        document.body.appendChild(el);

        document.addEventListener("keydown", function (e) {
            if (!el.classList.contains("ouvert")) return;
            if (e.key === "Escape") fermer();
            else if (document.activeElement === ui.champ) return;
            else if (e.key === "ArrowRight") suivant();
            else if (e.key === "ArrowLeft") precedent();
        });
    }

    function afficher() {
        var groupe = groupes[g];
        var s = groupe.statuts[i];
        var courant = null;

        ui.nom.textContent = groupe.nom;
        ui.temps.textContent = ilYa(s.created_at);
        ui.image.src = options.urlPhoto(s.image_path);
        ui.image.alt = s.legende || "Nouvel arrivage";
        ui.legende.textContent = s.legende || "";
        ui.legende.hidden = !s.legende;
        ui.lien.hidden = !options.voirBoutique;
        ui.lien.onclick = function () {
            location.href = "vitrine.html?b=" + encodeURIComponent(groupe.slug);
        };

        ui.barres.textContent = "";
        groupe.statuts.forEach(function (_, n) {
            var barre = nouveau("div", "statut-barre");
            var remplissage = document.createElement("div");
            remplissage.style.width = n < i ? "100%" : "0";
            barre.appendChild(remplissage);
            ui.barres.appendChild(barre);
            if (n === i) courant = remplissage;
        });

        marquerVu(s.id);

        statutCourant = s;
        barreCourante = courant;
        ui.panneau.classList.remove("ouvert");
        inter = null;
        majInteractions();
        chargerInteractions(s.id);

        lancerMinuteur();
    }

    var barreCourante = null;

    function lancerMinuteur() {
        clearTimeout(minuteur);
        if (!barreCourante) return;
        barreCourante.style.transition = "none";
        barreCourante.style.width = "0";
        void barreCourante.offsetWidth;
        barreCourante.style.transition = "width " + DUREE + "ms linear";
        barreCourante.style.width = "100%";
        minuteur = setTimeout(suivant, DUREE);
    }

    function demanderConnexion() {
        fermer();
        if (options.demanderConnexion) options.demanderConnexion();
    }

    function chargerInteractions(id) {
        if (!options.rpc) return Promise.resolve();

        return options.rpc("statut_interactions", { p_statut: id }).then(function (res) {
            if (!statutCourant || statutCourant.id !== id) return;
            if (res && res.data) {
                inter = res.data;
                majInteractions();
            }
        });
    }

    function majInteractions() {
        var reactions = (inter && inter.reactions) || {};
        var mienne = inter ? inter.ma_reaction : null;

        REACTIONS.forEach(function (r) {
            var ref = ui.boutonsReaction[r.cle];
            ref.nombre.textContent = String(reactions[r.cle] || 0);
            ref.bouton.classList.toggle("actif", mienne === r.cle);
        });

        var commentaires = (inter && inter.commentaires) || [];
        ui.nombreCommentaires.textContent = String(commentaires.length);

        if (ui.panneau.classList.contains("ouvert")) rendreCommentaires();
    }

    function reagir(cle) {
        if (options.connecte && !options.connecte()) {
            demanderConnexion();
            return;
        }

        var id = statutCourant.id;

        options.rpc("reagir_statut", { p_statut: id, p_reaction: cle }).then(function (res) {
            if (res && res.error) {
                alert("⚠️ " + res.error.message);
                return;
            }
            chargerInteractions(id);
        });
    }

    function rendreCommentaires() {
        var commentaires = (inter && inter.commentaires) || [];
        ui.liste.textContent = "";

        if (commentaires.length === 0) {
            ui.liste.appendChild(nouveau("p", "statut-vide", "Aucun commentaire. Soyez le premier !"));
            return;
        }

        commentaires.forEach(function (c) {
            var ligne = nouveau("div", "statut-commentaire");

            var haut = nouveau("div", "statut-commentaire-haut");
            var auteur = nouveau("strong", "", c.auteur);
            haut.appendChild(auteur);

            if (c.par_boutique) {
                haut.appendChild(nouveau("span", "statut-etiquette", "🏪 Boutique"));
            }

            haut.appendChild(nouveau("small", "", ilYa(c.created_at)));

            if (c.peut_supprimer) {
                var sup = nouveau("button", "statut-supprimer", "🗑️");
                sup.type = "button";
                sup.setAttribute("aria-label", "Supprimer ce commentaire");
                sup.addEventListener("click", function () { supprimer(c.id); });
                haut.appendChild(sup);
            }

            ligne.appendChild(haut);
            ligne.appendChild(nouveau("p", "", c.texte));
            ui.liste.appendChild(ligne);
        });

        ui.liste.scrollTop = ui.liste.scrollHeight;
    }

    function ouvrirCommentaires() {
        clearTimeout(minuteur);
        ui.panneau.classList.add("ouvert");
        rendreCommentaires();
    }

    function fermerCommentaires() {
        ui.panneau.classList.remove("ouvert");
        lancerMinuteur();
    }

    function commenter() {
        if (options.connecte && !options.connecte()) {
            demanderConnexion();
            return;
        }

        var texte = ui.champ.value.trim();
        if (!texte) return;

        var id = statutCourant.id;

        options.rpc("commenter_statut", { p_statut: id, p_texte: texte }).then(function (res) {
            if (res && res.error) {
                alert("⚠️ " + res.error.message);
                return;
            }
            ui.champ.value = "";
            chargerInteractions(id);
        });
    }

    function supprimer(idCommentaire) {
        if (!confirm("Supprimer ce commentaire ?")) return;

        var id = statutCourant.id;

        options.rpc("supprimer_commentaire", { p_id: idCommentaire }).then(function (res) {
            if (res && res.error) {
                alert("⚠️ " + res.error.message);
                return;
            }
            chargerInteractions(id);
        });
    }

    function suivant() {
        if (i < groupes[g].statuts.length - 1) {
            i++;
        } else if (g < groupes.length - 1) {
            g++;
            i = 0;
        } else {
            fermer();
            return;
        }
        afficher();
    }

    function precedent() {
        if (i > 0) {
            i--;
        } else if (g > 0) {
            g--;
            i = groupes[g].statuts.length - 1;
        }
        afficher();
    }

    function fermer() {
        clearTimeout(minuteur);
        ui.panneau.classList.remove("ouvert");
        el.classList.remove("ouvert");
        ui.image.removeAttribute("src");
        document.body.style.overflow = "";
        if (options.quandFerme) options.quandFerme();
    }

    /* liste : [{ slug, nom, statuts: [{ id, image_path, legende, created_at }] }]
       options : { urlPhoto(chemin), voirBoutique (booléen), quandFerme(),
                   rpc(nom, args), connecte(), demanderConnexion() } */

    window.ouvrirStatuts = function (liste, debut, opts) {
        if (!liste || !liste.length || !opts || !opts.urlPhoto) return;

        construire();

        groupes = liste;
        g = debut || 0;
        i = 0;
        options = opts;

        el.classList.add("ouvert");
        document.body.style.overflow = "hidden";
        afficher();
    };
})();
