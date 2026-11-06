
let db;
let SQL;
let upravovaneId = null;
let pripraveno = false;
let ukladaSe = false;

const formular = document.getElementById("formular");
const seznam = document.getElementById("seznam");
const hledat = document.getElementById("hledat");
const filtrUmisteni = document.getElementById("filtrUmisteni");
const filtrTridy = document.getElementById("filtrTridy");
const poleNazvu = document.getElementById("nazev");
const navrhyNazvu = document.getElementById("navrhyNazvu");
let nazvySpotrebicu = [];

function normalizovatText(text) {
    return String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs").trim();
}

function navrhnoutNazvy() {
    const dotaz = normalizovatText(poleNazvu.value);
    navrhyNazvu.replaceChildren();
    if (!dotaz || ukladaSe) {
        navrhyNazvu.hidden = true;
        return;
    }
    const navrhy = nazvySpotrebicu
        .filter(nazev => normalizovatText(nazev).includes(dotaz))
        .slice(0, 8);
    for (const nazev of navrhy) {
        const tlacitko = document.createElement("button");
        tlacitko.type = "button";
        tlacitko.textContent = nazev;
        tlacitko.addEventListener("click", () => {
            poleNazvu.value = nazev;
            poleNazvu.focus();
            navrhyNazvu.hidden = true;
        });
        navrhyNazvu.appendChild(tlacitko);
    }
    navrhyNazvu.hidden = navrhy.length === 0;
}

poleNazvu.addEventListener("input", navrhnoutNazvy);
poleNazvu.addEventListener("focus", navrhnoutNazvy);
poleNazvu.addEventListener("keydown", event => {
    if (event.key === "Escape") navrhyNazvu.hidden = true;
});
document.addEventListener("focusin", event => {
    if (event.target !== poleNazvu && !navrhyNazvu.contains(event.target)) {
        navrhyNazvu.hidden = true;
    }
});
document.addEventListener("pointerdown", event => {
    if (event.target !== poleNazvu && !navrhyNazvu.contains(event.target)) {
        navrhyNazvu.hidden = true;
    }
});
hledat.addEventListener("input", () => { if (pripraveno) vykreslitTabulku(); });
filtrUmisteni.addEventListener("change", () => { if (pripraveno) vykreslitTabulku(); });
filtrTridy.addEventListener("change", () => { if (pripraveno) vykreslitTabulku(); });
document.getElementById("zrusitFiltry").addEventListener("click", () => {
    hledat.value = "";
    filtrUmisteni.value = "";
    filtrTridy.value = "";
    if (pripraveno) vykreslitTabulku();
});


const vyberTridy = document.getElementById("trida");

vyberTridy.addEventListener("change", () => {
    for (const moznost of vyberTridy.options) {
        moznost.defaultSelected =
            moznost.value === vyberTridy.value;
    }
});

// Otevření lokálního úložiště pro SQLite soubor
function otevritUloziste() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("EvidenceDB", 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore("soubory");
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function nacistSoubor() {
    const uloziste = await otevritUloziste();

    return new Promise((resolve, reject) => {
        const tx = uloziste.transaction("soubory", "readonly");
        const request = tx.objectStore("soubory").get("sqlite");

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => uloziste.close();
    });
}

async function ulozitSoubor() {
    const data = db.export();
    const uloziste = await otevritUloziste();

    return new Promise((resolve, reject) => {
        const tx = uloziste.transaction("soubory", "readwrite");

        tx.objectStore("soubory").put(data, "sqlite");

        tx.oncomplete = () => {
            uloziste.close();
            resolve();
        };

        tx.onabort = tx.onerror = () => {
            uloziste.close();
            reject(tx.error);
        };
    });
}

// Inicializace SQLite
async function inicializovat() {
    SQL = await initSqlJs({
        locateFile: file => "vendor/" + file
    });

    const ulozenaData = await nacistSoubor();

    db = ulozenaData
        ? new SQL.Database(new Uint8Array(ulozenaData))
        : new SQL.Database();

    db.run(`
        CREATE TABLE IF NOT EXISTS spotrebice (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            evidencni_cislo TEXT NOT NULL UNIQUE,
            nazev TEXT NOT NULL
        );
    `);

    const sloupce = new Set(db.exec("PRAGMA table_info(spotrebice);")[0].values.map(r => r[1]));
    if (!sloupce.has("umisteni")) db.run("ALTER TABLE spotrebice ADD COLUMN umisteni TEXT NOT NULL DEFAULT '';");
    if (!sloupce.has("trida")) db.run("ALTER TABLE spotrebice ADD COLUMN trida TEXT CHECK (trida IN ('1', '2'));");
    await ulozitSoubor();
    vykreslitTabulku();
    pripraveno = true;
}

// INSERT – přidání spotřebiče
formular.addEventListener("submit", async event => {
    event.preventDefault();
    if (!pripraveno || ukladaSe) return;
    const cislo = document.getElementById("cislo").value.trim();
    const nazev = document.getElementById("nazev").value.trim();
    const umisteni = document.getElementById("umisteni").value.trim();
    const trida = document.getElementById("trida").value;
    if (!cislo || !nazev || !umisteni || !["1", "2"].includes(trida)) {
        alert("Vyplň všechna pole a vyber třídu 1 nebo 2.");
        return;
    }
    const pridavani = upravovaneId === null;
    try {
        await provedZmenu(() => {
            if (upravovaneId === null) {
                db.run("INSERT INTO spotrebice (evidencni_cislo, nazev, umisteni, trida) VALUES (?, ?, ?, ?);",
                    [cislo, nazev, umisteni, trida]);
            } else {
                db.run("UPDATE spotrebice SET evidencni_cislo = ?, nazev = ?, umisteni = ?, trida = ? WHERE id = ?;",
                    [cislo, nazev, umisteni, trida, upravovaneId]);
            }
        });
        zrusitUpravu();
        vykreslitTabulku();
        const viditelny = [...seznam.children].some(radek =>
            radek.dataset.cislo === cislo);
        document.getElementById("stavUlozeni").textContent =
            (pridavani ? "Spotřebič přidán." : "Změny uloženy.") +
            (viditelny ? "" : " Záznam je skrytý aktuálním filtrem.");
        if (pridavani) {
            document.getElementById("cislo").focus({preventScroll: true});
        }
    } catch (error) {
        alert("Chyba při ukládání: " + error.message);
    }
});

// SELECT – načtení spotřebičů

function vykreslitTabulku() {
    const vysledek = db.exec("SELECT id, evidencni_cislo, nazev, umisteni, trida FROM spotrebice ORDER BY id ASC;");
    const vsechny = vysledek[0]?.values || [];
    nazvySpotrebicu = [...new Set(vsechny.map(radek => radek[2]))]
        .sort((a, b) => a.localeCompare(b, "cs"));
    const vybraneUmisteni = filtrUmisteni.value;
    const umisteniSeznam = [...new Set(vsechny.map(radek => radek[3]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "cs"));
    // Zachováme i filtr, jehož poslední záznam byl právě smazán nebo upraven.
    if (vybraneUmisteni && !umisteniSeznam.includes(vybraneUmisteni)) {
        umisteniSeznam.push(vybraneUmisteni);
    }
    filtrUmisteni.replaceChildren(new Option("Všechna umístění", ""));
    for (const hodnota of umisteniSeznam) {
        filtrUmisteni.add(new Option(hodnota, hodnota));
    }
    filtrUmisteni.value = vybraneUmisteni;
    const dotaz = normalizovatText(hledat.value);
    const zobrazene = vsechny.filter(([, cislo, nazev, umisteni, trida]) => {
        const shodaTextu = !dotaz || normalizovatText(cislo).includes(dotaz) ||
            normalizovatText(nazev).includes(dotaz);
        const shodaUmisteni = !filtrUmisteni.value || umisteni === filtrUmisteni.value;
        const shodaTridy = !filtrTridy.value ||
            (filtrTridy.value === "nevyplneno" ? !trida : trida === filtrTridy.value);
        return shodaTextu && shodaUmisteni && shodaTridy;
    });
    document.getElementById("pocetZaznamu").textContent =
        "Zobrazeno " + zobrazene.length + " z " + vsechny.length + " spotřebičů.";
    seznam.replaceChildren();
    for (const [id, cislo, nazev, umisteni, trida] of zobrazene) {
        const radek = document.createElement("tr");
        radek.dataset.cislo = cislo;
        for (const text of [cislo, nazev, umisteni || "—", trida ? "tř. " + trida : "Nevyplněno"]) {
            const td = document.createElement("td");
            td.textContent = text;
            radek.appendChild(td);
        }
        const akce = document.createElement("td");
        const upravit = document.createElement("button");
        upravit.type = "button";
        upravit.textContent = "Upravit";
        upravit.className = "btn-upravit";
        upravit.addEventListener("click", () => upravitSpotrebic(id, cislo, nazev, umisteni, trida));
        const smazat = document.createElement("button");
        smazat.type = "button";
        smazat.textContent = "Smazat";
        smazat.className = "btn-smazat";
        smazat.addEventListener("click", () => smazatSpotrebic(id, nazev));
        akce.append(upravit, smazat);
        radek.appendChild(akce);
        seznam.appendChild(radek);
    }
    if (zobrazene.length === 0) {
        const radek = document.createElement("tr");
        const bunka = document.createElement("td");
        bunka.colSpan = 5;
        bunka.textContent = vsechny.length ? "Žádný spotřebič neodpovídá hledání a filtrům." : "Zatím nejsou uložené žádné spotřebiče.";
        radek.appendChild(bunka);
        seznam.appendChild(radek);
    }
}

async function exportExcel() {
    if (!db) {
        alert("Databáze ještě není připravena.");
        return;
    }

    try {
        const vysledek = db.exec(`
            SELECT evidencni_cislo, nazev, umisteni, trida
            FROM spotrebice
            ORDER BY id ASC;
        `);

        const zaznamy = vysledek.length
            ? vysledek[0].values
            : [];

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Spotřebiče");

        sheet.columns = [
            {
                header: "Evidenční číslo",
                key: "cislo",
                width: 8.71
            },
            {
                header: "Název spotřebiče",
                key: "nazev",
                width: 45.29
            },
            {
                header: "Umístění",
                key: "umisteni",
                width: 11.43
            },
            {
                header: "Třída spotřebiče",
                key: "trida",
                width: 20
            }
        ];

        zaznamy.forEach(([cislo, nazev, umisteni, trida]) => {
            const row = sheet.addRow({
                cislo: String(cislo),
                nazev: String(nazev),
                umisteni: String(umisteni || ""),
                trida: trida ? "tř. " + trida : ""
            });

            // Zajistí textový formát buňky
            row.getCell(1).numFmt = "@";
        });

        // Formátování hlavičky
        const header = sheet.getRow(1);

        header.font = {
            bold: true,
            color: { argb: "FFFFFFFF" }
        };

        header.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF2563EB" }
        };

        header.height = 25;

        // Filtry v Excelu
        sheet.autoFilter = {
            from: "A1",
            to: "D1"
        };

        // Zamrazení prvního řádku
        sheet.views = [{
            state: "frozen",
            ySplit: 1
        }];

        // Generování souboru
        const buffer = await workbook.xlsx.writeBuffer();

        const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "evidence_spotrebicu.xlsx";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 60000);

    } catch (error) {
        console.error(error);
        alert("Chyba exportu: " + error.message);
    }
}


function upravitSpotrebic(id, cislo, nazev, umisteni, trida) {
    if (!pripraveno || ukladaSe) return;
    upravovaneId = id;
    document.getElementById("cislo").value = cislo;
    document.getElementById("nazev").value = nazev;
    document.getElementById("umisteni").value = umisteni || "";
    document.getElementById("trida").value = trida || "";
    document.getElementById("nadpisFormulare").textContent = "Upravit spotřebič";
    document.getElementById("ulozitSpotrebic").textContent = "Uložit změny";
    document.getElementById("zrusitUpravu").hidden = false;
    formular.scrollIntoView({behavior: "smooth", block: "start"});
    document.getElementById("cislo").focus({preventScroll: true});
}

function zrusitUpravu() {
    if (ukladaSe) return;

    const umisteni = document.getElementById("umisteni").value;
    const trida = document.getElementById("trida").value;

    upravovaneId = null;
    formular.reset();
    navrhyNazvu.hidden = true;

    document.getElementById("umisteni").value = umisteni;
    document.getElementById("trida").value = trida;

    document.getElementById("nadpisFormulare").textContent =
        "Přidat spotřebič";

    document.getElementById("ulozitSpotrebic").textContent =
        "+ Přidat spotřebič";

    document.getElementById("zrusitUpravu").hidden = true;
}

document.getElementById("zrusitUpravu").addEventListener("click", zrusitUpravu);

async function provedZmenu(zmena) {
    if (!pripraveno || ukladaSe) throw new Error("Počkej na dokončení ukládání.");
    const predchozi = db.export();
    ukladaSe = true;
    try {
        zmena();
        await ulozitSoubor();
    } catch (error) {
        db.close();
        db = new SQL.Database(predchozi);
        throw error;
    } finally {
        ukladaSe = false;
    }
}

async function smazatSpotrebic(id, nazev) {
    if (!pripraveno || ukladaSe) return;
    const potvrzeni = confirm(
        `Opravdu chceš smazat spotřebič "${nazev}"?`
    );

    if (!potvrzeni) return;

    try {
        await provedZmenu(() => db.run(`
            DELETE FROM spotrebice
            WHERE id = ?;
        `, [id]));
        if (upravovaneId === id) zrusitUpravu();
        vykreslitTabulku();

    } catch (error) {
        alert("Chyba při mazání: " + error.message);
    }
}

// Export celé SQLite databáze.
function exportDatabaze() {
    if (!pripraveno || ukladaSe) {
        alert("Počkej na dokončení načítání nebo ukládání.");
        return;
    }

    try {
        const data = db.export();

        const blob = new Blob([data], {
            type: "application/octet-stream"
        });

        const url = URL.createObjectURL(blob);
        const odkaz = document.createElement("a");

        odkaz.href = url;
        odkaz.download = `spotrebice-${Date.now()}.sqlite`;

        document.body.appendChild(odkaz);
        odkaz.click();
        odkaz.remove();

        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        console.error(error);
        alert("Záloha selhala: " + error.message);
    }
}

// Obnova databáze z vybraného souboru.
document.getElementById("souborZalohy")
    .addEventListener("change", async event => {
        const vstup = event.target;
        const soubor = vstup.files[0];

        if (!soubor) return;

        let novaDatabaze = null;
        let zamceno = false;

        try {
            if (!pripraveno || ukladaSe) {
                throw new Error(
                    "Počkej na dokončení načítání nebo ukládání."
                );
            }

            ukladaSe = true;
            zamceno = true;

            const data = new Uint8Array(
                await soubor.arrayBuffer()
            );

            // Původní databázi zatím neměníme.
            novaDatabaze = new SQL.Database(data);

            const kontrola = novaDatabaze.exec(
                "PRAGMA integrity_check;"
            );

            if (kontrola[0]?.values[0]?.[0] !== "ok") {
                throw new Error("Soubor databáze je poškozený.");
            }

            // Ověříme, že soubor obsahuje naši tabulku a sloupce.
            const struktura = novaDatabaze.exec(
                "PRAGMA table_info(spotrebice);"
            );

            const sloupce = new Set(
                (struktura[0]?.values || []).map(radek => radek[1])
            );

            const povinneSloupce = [
                "id",
                "evidencni_cislo",
                "nazev",
                "umisteni",
                "trida"
            ];

            if (!povinneSloupce.every(nazev => sloupce.has(nazev))) {
                throw new Error(
                    "Soubor není záloha současné Evidence spotřebičů."
                );
            }

            const vysledek = novaDatabaze.exec(
                "SELECT COUNT(*) FROM spotrebice;"
            );

            const pocet = vysledek[0].values[0][0];

            const potvrzeno = confirm(
                `Záloha obsahuje ${pocet} záznamů.\n\n` +
                "Obnova nahradí VŠECHNY současné záznamy.\n" +
                "Máš je zazálohované a chceš pokračovat?"
            );

            if (!potvrzeno) return;

            const puvodniDatabaze = db;
            db = novaDatabaze;

            try {
                // Počkáme na dokončení zápisu do IndexedDB.
                await ulozitSoubor();
            } catch (error) {
                db = puvodniDatabaze;
                throw error;
            }

            // Nová databáze je úspěšně uložená.
            novaDatabaze = null;
            puvodniDatabaze.close();

            ukladaSe = false;
            zrusitUpravu();
            vykreslitTabulku();

            alert(`Obnova dokončena. Počet záznamů: ${pocet}.`);
        } catch (error) {
            console.error(error);
            alert("Obnova selhala: " + error.message);
        } finally {
            if (novaDatabaze) {
                novaDatabaze.close();
            }

            if (zamceno) {
                ukladaSe = false;
            }

            vstup.value = "";
        }
    });


// Spuštění aplikace
inicializovat().catch(error => {
    console.error(error);
    alert("Databázi se nepodařilo spustit: " + error.message);
});
