window.addEventListener("load", async () => {
    const stav = document.getElementById("offlineStav");

    if (!window.isSecureContext ||
        !("serviceWorker" in navigator)) {
        stav.textContent =
            "Offline režim potřebuje HTTPS nebo localhost.";
        return;
    }

    try {
        const registrace =
            await navigator.serviceWorker.register("./sw.js", {
                scope: "./",
                updateViaCache: "none"
            });

        function sledovat(worker) {
            if (!worker) return;

            worker.addEventListener("statechange", () => {
                if (
                    worker.state === "redundant" &&
                    !registrace.active
                ) {
                    stav.textContent =
                        "Příprava offline režimu selhala. " +
                        "Zkontroluj soubory a připojení.";
                }

                if (
                    worker.state === "installed" &&
                    registrace.active
                ) {
                    stav.textContent =
                        "Aktualizace připravena. Po uložení práce " +
                        "zavři všechna okna aplikace a znovu ji otevři.";
                }
            });
        }

        sledovat(registrace.installing);

        registrace.addEventListener("updatefound", () => {
            sledovat(registrace.installing);
        });

        await navigator.serviceWorker.ready;

        stav.textContent = registrace.waiting
            ? "Aktualizace čeká na zavření všech oken aplikace."
            : "Offline soubory jsou p\u0159ipraven\u00e9. Verze 10.";
    } catch (error) {
        console.error("Chyba offline režimu:", error);

        stav.textContent =
            "Offline režim se nepodařilo připravit.";
    }
});