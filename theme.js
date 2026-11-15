/* Apparence : automatique (réglage de l'appareil) / clair / sombre.
   Le choix de l'utilisateur remplace toujours celui de son téléphone.
   Ce fichier fournit aussi la fenêtre « Paramètres » des vitrines et de l'espace vendeur. */

(function () {
    var CLE = "dukani_theme";
    var CHOIX = [
        { mode: "auto", icone: "contrast", nom: "Automatique" },
        { mode: "clair", icone: "sun", nom: "Clair" },
        { mode: "sombre", icone: "moon", nom: "Sombre" }
    ];
    var NS = "http://www.w3.org/2000/svg";

    function lire() {
        try {
            var m = localStorage.getItem(CLE);
            for (var i = 0; i < CHOIX.length; i++) if (CHOIX[i].mode === m) return m;
        } catch (e) {}
        return "auto";
    }

    function marquer(mode) {
        var boutons = document.querySelectorAll(".choix-theme button");
        for (var i = 0; i < boutons.length; i++) {
            var actif = boutons[i].getAttribute("data-mode") === mode;
            boutons[i].classList.toggle("actif", actif);
            boutons[i].setAttribute("aria-pressed", actif ? "true" : "false");
        }
    }

    function appliquer(mode) {
        var r = document.documentElement;
        if (mode === "clair") r.setAttribute("data-theme", "light");
        else if (mode === "sombre") r.setAttribute("data-theme", "dark");
        else r.removeAttribute("data-theme");
        marquer(mode);
    }

    window.choisirTheme = function (mode) {
        try { localStorage.setItem(CLE, mode); } catch (e) {}
        appliquer(mode);
    };

    function iconeSvg(nom) {
        var svg = document.createElementNS(NS, "svg");
        var use = document.createElementNS(NS, "use");
        svg.setAttribute("class", "ic");
        svg.setAttribute("aria-hidden", "true");
        use.setAttribute("href", "#ic-" + nom);
        svg.appendChild(use);
        return svg;
    }

    /* Les trois boutons Automatique / Clair / Sombre (réutilisés par le menu de l'accueil) */
    window.creerChoixTheme = function () {
        var groupe = document.createElement("div");
        groupe.className = "choix-theme";

        CHOIX.forEach(function (c) {
            var b = document.createElement("button");
            b.type = "button";
            b.setAttribute("data-mode", c.mode);

            var ic = document.createElement("span");
            ic.className = "choix-icone";
            ic.appendChild(iconeSvg(c.icone));

            var tx = document.createElement("span");
            tx.textContent = c.nom;

            b.appendChild(ic);
            b.appendChild(tx);
            b.addEventListener("click", function () { window.choisirTheme(c.mode); });
            groupe.appendChild(b);
        });

        return groupe;
    };

    window.marquerTheme = function () { marquer(lire()); };

    function creerFenetre() {
        if (document.getElementById("parametres")) return;

        var fenetre = document.createElement("div");
        fenetre.id = "parametres";
        fenetre.className = "fenetre";
        fenetre.addEventListener("click", function (e) {
            if (e.target === fenetre) window.fermerParametres();
        });

        var boite = document.createElement("div");
        boite.className = "creation-box";

        var fermer = document.createElement("button");
        fermer.className = "fermer";
        fermer.type = "button";
        fermer.textContent = "✕";
        fermer.setAttribute("aria-label", "Fermer");
        fermer.addEventListener("click", function () { window.fermerParametres(); });

        var titre = document.createElement("h2");
        titre.textContent = "Paramètres";

        var compte = document.createElement("div");
        compte.id = "parametres-compte";

        var sousTitre = document.createElement("label");
        sousTitre.textContent = "Apparence";

        var aide = document.createElement("p");
        aide.className = "sous-titre";
        aide.textContent = "Automatique suit le réglage de votre téléphone. " +
            "Clair et Sombre le remplacent.";

        boite.appendChild(fermer);
        boite.appendChild(titre);
        boite.appendChild(compte);
        boite.appendChild(sousTitre);
        boite.appendChild(window.creerChoixTheme());
        boite.appendChild(aide);
        fenetre.appendChild(boite);
        document.body.appendChild(fenetre);

        marquer(lire());
    }

    window.ouvrirParametres = function () {
        creerFenetre();
        marquer(lire());

        /* Chaque page remplit la section « Compte » (connexion, déconnexion…) */
        var zone = document.getElementById("parametres-compte");
        zone.textContent = "";
        if (window.remplirParametresCompte) window.remplirParametresCompte(zone);

        document.getElementById("parametres").classList.add("active");
    };

    window.fermerParametres = function () {
        var f = document.getElementById("parametres");
        if (f) f.classList.remove("active");
    };

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") window.fermerParametres();
    });

    appliquer(lire());
    document.addEventListener("DOMContentLoaded", function () {
        creerFenetre();
        appliquer(lire());
    });
})();
