/**
 * ============================================================
 * PORTFOLIO TRACKER — Google Apps Script
 * ============================================================
 * Struttura del Google Sheet:
 *   1. "Acquisti"       → dati grezzi importati dal CSV
 *   2. "Mappatura"      → mapping Yahoo ↔ Google Finance ticker
 *   3. "Portafoglio"    → aggregazione VWAP per ticker + prezzi live
 *   4. "Cambi"          → tassi di cambio EUR/USD, HUF/USD ecc.
 *   5. "Dividendi"      → dividendi TTM da Yahoo Finance
 *   6. "Geo"            → esposizione geografica per ticker
 *   7. "Dashboard"      → metriche aggregate e riepilogo
 *
 * ── METODO A: da script.google.com (crea il foglio automaticamente) ──
 *   1. Vai su https://script.google.com → Nuovo progetto
 *   2. Incolla tutto questo codice sostituendo il contenuto esistente
 *   3. Salva (Ctrl+S), dai un nome al progetto (es. "Portfolio Tracker")
 *   4. In alto: seleziona la funzione "creaFoglioCompleto" → clicca ▶ Esegui
 *   5. Autorizza le permissioni richieste
 *   6. Al termine il Google Sheet viene creato nel Drive e si apre automaticamente
 *
 * ── METODO B: da un Google Sheet esistente ──
 *   1. Apri il foglio → Extensions → Apps Script
 *   2. Incolla questo codice sostituendo tutto il contenuto
 *   3. Salva (Ctrl+S) e ricarica la pagina del foglio
 *   4. Dal menu 📊 Portfolio Tracker → ⚙️ Setup iniziale
 *
 * ── AGGIORNAMENTO AUTOMATICO ──
 *   - Dal menu 📊 Portfolio Tracker → ⏰ Aggiornamento automatico → Imposta orario
 *   - L'ora scelta viene salvata nelle PropertiesService e il trigger viene
 *     creato/aggiornato automaticamente senza dover aprire Apps Script.
 *   - Fuso orario usato: impostazione del progetto Apps Script (Europe/Budapest)
 * ============================================================
 */

// ── Costanti ──────────────────────────────────────────────────────────────────

const SHEET_ACQUISTI    = "Acquisti";
const SHEET_MAPPATURA   = "Mappatura";
const SHEET_PORTAFOGLIO = "Portafoglio";
const SHEET_CAMBI       = "Cambi";
const SHEET_DIVIDENDI   = "Dividendi";
const SHEET_GEO         = "Geo";
const SHEET_DASHBOARD   = "Dashboard";

// Colori tema
const COLOR_HEADER  = "#1a1a2e";
const COLOR_HEADER2 = "#16213e";
const COLOR_ACCENT  = "#378ADD";
const COLOR_GREEN   = "#1D9E75";
const COLOR_RED     = "#D85A30";
const COLOR_AMBER   = "#EF9F27";
const COLOR_BG_ALT  = "#f7f6f3";
const COLOR_WHITE   = "#ffffff";

// ── CREA FOGLIO COMPLETO DA ZERO (Metodo A — da script.google.com) ───────────

/**
 * Crea un nuovo Google Sheet "Portfolio Tracker" nel Drive dell'utente,
 * lo popola con tutti i fogli e apre il link al termine.
 * Eseguire UNA SOLA VOLTA: seleziona questa funzione → clicca ▶ Esegui
 */
function creaFoglioCompleto() {
  const ss  = SpreadsheetApp.create("📊 Portfolio Tracker");
  const id  = ss.getId();
  const url = "https://docs.google.com/spreadsheets/d/" + id;

  setupSheetSu(ss);

  // Installa il trigger onOpen sul NUOVO foglio così il menu appare automaticamente
  ScriptApp.newTrigger("onOpen")
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  Logger.log("✅ Creato con successo! Aprilo qui: " + url);
  Logger.log("📋 Copia questo link e aprilo nel browser: " + url);

  // Mostra il link nella console di esecuzione
  // (showModalDialog non funziona in contesto headless)
  try {
    const html = HtmlService
      .createHtmlOutput(
        `<p style="font-family:Arial;font-size:14px">✅ Foglio creato con successo!</p>
         <p><a href="${url}" target="_blank" style="font-size:16px;color:#378ADD">
         📊 Apri Portfolio Tracker</a></p>
         <p style="color:#888;font-size:12px">Dopo l'apertura il menu Portfolio Tracker apparirà in alto.</p>`
      )
      .setTitle("Portfolio Tracker creato!")
      .setWidth(380).setHeight(160);
    SpreadsheetApp.getUi().showModalDialog(html, "✅ Fatto!");
  } catch(e) {
    Logger.log("Apri manualmente il link qui sopra.");
  }
}

function setupSheetSu(ss) {
  creaFoglioAcquisti(ss);
  creaFoglioMappatura(ss);
  creaFoglioPortafoglio(ss);
  creaFoglioCambi(ss);
  creaFoglioDividendi(ss);
  creaFoglioGeo(ss);
  creaFoglioDashboard(ss);

  // Rimuovi foglio vuoto di default
  ["Foglio1","Sheet1"].forEach(name => {
    const s = ss.getSheetByName(name);
    if (s && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  // Dashboard in primo piano
  const dash = ss.getSheetByName(SHEET_DASHBOARD);
  if (dash) { ss.setActiveSheet(dash); ss.moveActiveSheet(1); }

  creaMenu();
  try { ss.toast("Setup completato! Apri il foglio e usa il menu Portfolio Tracker.", "✓ Setup", 15); } catch(e) { Logger.log("Setup completato!"); }
}

// ── ENTRY POINT PRINCIPALE ────────────────────────────────────────────────────

function aggiornaPortafoglio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    SpreadsheetApp.getActiveSpreadsheet().toast("Aggiornamento in corso...", "Portfolio Tracker", 30);

    aggiornaCambi(ss);
    aggiornaCalcoliPortafoglio(ss);   // 1. scrive struttura + formule GF (senza dividendi)
    SpreadsheetApp.flush();
    Utilities.sleep(4000);            // 2. attende che GOOGLEFINANCE carichi i prezzi
    aggiornaPrezziYahoo(ss);          // 3. compila prezzi mancanti con Yahoo Finance
    aggiornaDividendi(ss);            // 4. popola foglio Dividendi da Yahoo Finance
    aggiornaColonneDividendi(ss);     // 5. copia dividendi da foglio Dividendi → Portafoglio
    aggiornaDashboard(ss);            // 6. aggiorna metriche Dashboard
    ensurePortafoglioFilter(ss);      // 7. assicura filtri attivi sul foglio Portafoglio

    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Aggiornamento completato! " + new Date().toLocaleString("it-IT"),
      "Portfolio Tracker ✓", 5
    );
  } catch(e) {
    ui.alert("Errore durante l'aggiornamento:\n" + e.message);
  }
}

// ── SETUP INIZIALE ────────────────────────────────────────────────────────────

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupSheetSu(ss);
}

function creaMenu() {
  // getUi() non è disponibile in contesto headless (es. script.google.com standalone)
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu("📊 Portfolio Tracker")
      .addItem("🔄 Aggiorna tutto", "aggiornaPortafoglio")
      .addSeparator()
      .addItem("💱 Aggiorna cambi", "aggiornaCambi")
      .addItem("📈 Ricalcola portafoglio", "aggiornaCalcoliPortafoglio")
      .addItem("💰 Aggiorna dividendi", "aggiornaDividendi")
      .addSeparator()
      .addSubMenu(ui.createMenu("⏰ Aggiornamento automatico")
        .addItem("▶ Attiva / Cambia orario", "dialogImpostaOrarioTrigger")
        .addItem("⏹ Disattiva", "disattivaTriggerGiornaliero")
        .addItem("ℹ️ Stato attuale", "mostraStatoTrigger")
      )
      .addSeparator()
      .addItem("⚙️ Setup iniziale (solo prima volta)", "setupSheet")
      .addSeparator()
      .addItem("🗺️ Aggiorna mappatura da CSV", "importaMappatura")
      .addItem("📂 Importa CSV Acquisti", "importaCSVAcquisti")
      .addItem("🧹 Normalizza numeri Acquisti", "pulisciAcquisti")
      .addItem("🔍 Diagnostica prezzi mancanti", "diagnosticaPrezzi")
      .addItem("💰 Diagnostica dividendi", "diagnosticaDividendi")
      .addItem("🧪 Test dividendi (log)", "testDividendi")
      .addItem("🔽 Ripristina filtri Portafoglio", "ensurePortafoglioFilter")
      .addToUi();
  } catch(e) {
    // Contesto headless: il menu verrà creato automaticamente al primo apertura del foglio
    Logger.log("Menu non creato (contesto headless) — verrà aggiunto all\'apertura del foglio.");
  }
}

// ── GESTIONE TRIGGER GIORNALIERO ──────────────────────────────────────────────

/**
 * Chiave usata in PropertiesService per salvare l\'ora del trigger (0–23).
 * L\'ID del trigger viene salvato per poterlo cancellare senza scorrere tutti i trigger.
 */
const PROP_TRIGGER_HOUR = "autoUpdateHour";
const PROP_TRIGGER_ID   = "autoUpdateTriggerId";

/**
 * Mostra un dialog HTML con un selettore orario (00:00–23:00).
 * L\'utente sceglie l\'ora e conferma → viene chiamata impostaOrarioTrigger(ora).
 */
function dialogImpostaOrarioTrigger() {
  const props   = PropertiesService.getScriptProperties();
  const oraCorr = props.getProperty(PROP_TRIGGER_HOUR);
  const attivo  = oraCorr !== null;

  let opzioni = "";
  for (let h = 0; h < 24; h++) {
    const label    = h.toString().padStart(2, "0") + ":00";
    const selected = (attivo && parseInt(oraCorr) === h) ? " selected" : "";
    opzioni += `<option value="${h}"${selected}>${label}</option>`;
  }

  const statoHtml = attivo
    ? `<p style="color:#1D9E75;margin:0 0 12px">✅ Attivo — impostato alle <strong>${String(oraCorr).padStart(2,"0")}:00</strong></p>`
    : `<p style="color:#888;margin:0 0 12px">⏸ Non attivo — nessun aggiornamento automatico configurato.</p>`;

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 14px; padding: 16px; color: #222; }
      select { font-size: 16px; padding: 6px 10px; margin: 8px 0 16px; width: 100%;
               border-radius: 4px; border: 1px solid #ccc; }
      .btn { display: inline-block; padding: 9px 20px; border: none; border-radius: 4px;
             font-size: 14px; cursor: pointer; font-weight: bold; }
      .btn-primary { background: #378ADD; color: #fff; margin-right: 8px; }
      .btn-secondary { background: #eee; color: #333; }
      p.note { color: #999; font-size: 11px; margin-top: 14px; line-height: 1.4; }
    </style>
    ${statoHtml}
    <label for="ora"><strong>Scegli l\'ora di aggiornamento:</strong></label><br>
    <select id="ora">${opzioni}</select><br>
    <button class="btn btn-primary" onclick="conferma()">💾 Salva</button>
    <button class="btn btn-secondary" onclick="google.script.host.close()">Annulla</button>
    <p class="note">
      ⚠️ Verifica che il fuso orario del progetto Apps Script sia <strong>Europe/Budapest</strong>
      (⚙️ Project Settings → Time zone).<br>
      Google eseguirà lo script entro i 60 minuti successivi all\'ora scelta.
    </p>
    <script>
      function conferma() {
        const ora = parseInt(document.getElementById("ora").value);
        document.querySelector(".btn-primary").disabled = true;
        document.querySelector(".btn-primary").textContent = "Salvataggio...";
        google.script.run
          .withSuccessHandler(() => google.script.host.close())
          .withFailureHandler(err => {
            alert("Errore: " + err.message);
            document.querySelector(".btn-primary").disabled = false;
            document.querySelector(".btn-primary").textContent = "💾 Salva";
          })
          .impostaOrarioTrigger(ora);
      }
    </script>
  `)
    .setTitle("⏰ Aggiornamento automatico")
    .setWidth(390)
    .setHeight(280);

  SpreadsheetApp.getUi().showModalDialog(html, "⏰ Aggiornamento automatico");
}

/**
 * Crea (o ricrea) il trigger giornaliero all\'ora indicata.
 * Chiamata dal dialog HTML tramite google.script.run.
 * @param {number} ora  Ora intera 0–23 nel fuso orario del progetto Apps Script
 */
function impostaOrarioTrigger(ora) {
  if (typeof ora !== "number" || ora < 0 || ora > 23) {
    throw new Error("Ora non valida: " + ora);
  }

  const props = PropertiesService.getScriptProperties();

  // Elimina il trigger precedente se esiste
  _eliminaTriggerEsistente(props);

  // Crea il nuovo trigger giornaliero
  const trigger = ScriptApp.newTrigger("aggiornaPortafoglio")
    .timeBased()
    .everyDays(1)
    .atHour(ora)
    .create();

  // Salva ora e ID nelle proprietà per gestioni future
  props.setProperty(PROP_TRIGGER_HOUR, String(ora));
  props.setProperty(PROP_TRIGGER_ID,   trigger.getUniqueId());

  Logger.log("Trigger creato: aggiornaPortafoglio ogni giorno alle "
             + String(ora).padStart(2,"0") + ":00 (ID: " + trigger.getUniqueId() + ")");

  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Aggiornamento automatico attivo ogni giorno alle "
    + String(ora).padStart(2,"0") + ":00",
    "⏰ Trigger salvato", 6
  );
}

/**
 * Disattiva il trigger giornaliero e rimuove le proprietà salvate.
 */
function disattivaTriggerGiornaliero() {
  const props   = PropertiesService.getScriptProperties();
  const rimosso = _eliminaTriggerEsistente(props);

  props.deleteProperty(PROP_TRIGGER_HOUR);
  props.deleteProperty(PROP_TRIGGER_ID);

  const msg = rimosso
    ? "Aggiornamento automatico disattivato con successo."
    : "Nessun trigger attivo trovato da rimuovere.";

  SpreadsheetApp.getUi().alert("⏹ " + msg);
}

/**
 * Mostra un alert con lo stato attuale del trigger.
 */
function mostraStatoTrigger() {
  const props = PropertiesService.getScriptProperties();
  const ora   = props.getProperty(PROP_TRIGGER_HOUR);
  const id    = props.getProperty(PROP_TRIGGER_ID);

  if (!ora) {
    SpreadsheetApp.getUi().alert(
      "⏸ Aggiornamento automatico NON attivo.\n\n"
      + "Usa il menu ▶ Attiva / Cambia orario per configurarlo."
    );
    return;
  }

  // Verifica che il trigger esista ancora in Apps Script
  // (potrebbe essere stato eliminato manualmente dall\'utente dall\'interfaccia Triggers)
  const triggers = ScriptApp.getProjectTriggers();
  const esiste   = triggers.some(t => t.getUniqueId() === id);

  if (esiste) {
    SpreadsheetApp.getUi().alert(
      "✅ Aggiornamento automatico ATTIVO\n\n"
      + "🕐 Ora impostata: " + String(ora).padStart(2,"0") + ":00\n"
      + "📌 Trigger ID: " + id + "\n\n"
      + "Google eseguirà aggiornaPortafoglio ogni giorno\n"
      + "entro i 60 minuti successivi all\'ora scelta."
    );
  } else {
    // Il trigger è stato eliminato esternamente — pulizia automatica
    props.deleteProperty(PROP_TRIGGER_HOUR);
    props.deleteProperty(PROP_TRIGGER_ID);
    SpreadsheetApp.getUi().alert(
      "⚠️ Trigger non trovato in Apps Script.\n\n"
      + "Era impostato alle " + String(ora).padStart(2,"0") + ":00\n"
      + "ma è stato rimosso esternamente dall\'interfaccia Triggers.\n\n"
      + "Usa ▶ Attiva / Cambia orario per ricrearlo."
    );
  }
}

/**
 * Helper interno: elimina il trigger salvato nelle proprietà, se esiste.
 * Come fallback rimuove tutti i trigger su aggiornaPortafoglio (evita duplicati).
 * @param {GoogleAppsScript.Properties.Properties} props
 * @returns {boolean} true se almeno un trigger è stato rimosso
 */
function _eliminaTriggerEsistente(props) {
  const savedId  = props.getProperty(PROP_TRIGGER_ID);
  const triggers = ScriptApp.getProjectTriggers();
  let rimosso    = false;

  triggers.forEach(t => {
    if (t.getHandlerFunction() === "aggiornaPortafoglio") {
      // Rimuovi se corrisponde all\'ID salvato OPPURE (fallback) se non abbiamo un ID salvato
      if (!savedId || t.getUniqueId() === savedId) {
        ScriptApp.deleteTrigger(t);
        rimosso = true;
        Logger.log("Trigger rimosso: " + t.getUniqueId());
      }
    }
  });

  return rimosso;
}

// ── FOGLIO ACQUISTI ───────────────────────────────────────────────────────────

function creaFoglioAcquisti(ss) {
  let sh = ss.getSheetByName(SHEET_ACQUISTI);
  if (!sh) sh = ss.insertSheet(SHEET_ACQUISTI, 0);
  sh.clearContents();

  const headers = ["Yahoo Ticker", "Nome", "Quantità", "Valuta", "Prezzo Acquisto", "Data", "Broker", "Note"];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeader(sh, 1, headers.length);

  // Dati di esempio (i tuoi 62 ticker con quantità aggregate)
  const dati = [
    ["ABBV","AbbVie",15,"USD",0,"","",""],
    ["MO","Altria Group",95,"USD",0,"","",""],
    ["DIVO","Amplify CWP Enhanced Div ETF",427,"USD",0,"","",""],
    ["QDVO","Amplify Dividend & Income ETF",133,"USD",0,"","",""],
    ["IDVO","Amplify Intl Dividend ETF",123,"USD",0,"","",""],
    ["AAPL","Apple",1,"USD",0,"","",""],
    ["G.MI","Generali",76,"EUR",0,"","",""],
    ["BAYN.DE","Bayer",10,"EUR",0,"","",""],
    ["BTI","British American Tobacco",80,"USD",0,"","",""],
    ["CP","Canadian Pacific",50,"USD",0,"","",""],
    ["CVX","Chevron",16,"USD",0,"","",""],
    ["BSN.DE","Danone",20,"EUR",0,"","",""],
    ["ENI.MI","Eni",70,"EUR",0,"","",""],
    ["XOM","ExxonMobil",20,"USD",0,"","",""],
    ["FGEQ.DE","Franklin Global Quality Div ETF",1802,"EUR",0,"","",""],
    ["FGQP.L","Franklin Global Quality Div GBP ETF",1130,"USD",0,"","",""],
    ["FUSD.DE","Franklin FTSE USA ETF",1640,"EUR",0,"","",""],
    ["FLXD.DE","Franklin EU Quality Div ETF",161,"EUR",0,"","",""],
    ["HPRD.L","HSBC FTSE EPRA NAREIT Dev ETF",550,"USD",0,"","",""],
    ["ISP.MI","Intesa Sanpaolo",695,"EUR",0,"","",""],
    ["INTU","Intuit",3,"USD",0,"","",""],
    ["EHDL.DE","iShares EM Dividend ETF",26,"EUR",0,"","",""],
    ["SPHD","Invesco S&P500 High Div ETF",98,"USD",0,"","",""],
    ["IMAE.AS","iShares Core MSCI Europe ETF",228,"EUR",0,"","",""],
    ["EUNL.DE","iShares Core MSCI World ETF",30,"EUR",0,"","",""],
    ["IQQ6.DE","iShares Dev Mkts Property Yield ETF",514,"EUR",0,"","",""],
    ["IQQA.DE","iShares Core MSCI USA ETF",330,"EUR",0,"","",""],
    ["IQQP.DE","iShares Core MSCI Europe ETF",210,"EUR",0,"","",""],
    ["QDVW.DE","WisdomTree MSCI World Qual Div ETF",2509,"EUR",0,"","",""],
    ["EWSX.L","iShares STOXX EU Select Div ETF",6023,"USD",0,"","",""],
    ["EXSA.DE","iShares Core STOXX Europe 600 ETF",44,"EUR",0,"","",""],
    ["EXSH.DE","iShares STOXX EU Select Div 30 ETF",186,"EUR",0,"","",""],
    ["ISPA.DE","iShares MSCI EU High Div Yield ETF",357,"EUR",0,"","",""],
    ["IUKD.MI","iShares UK Dividend ETF",1158,"EUR",0,"","",""],
    ["JNJ","Johnson & Johnson",13,"USD",0,"","",""],
    ["JGPI.DE","JPM Global Eq Premium Income ETF",1058,"EUR",0,"","",""],
    ["JEQP.DE","JPM Nasdaq Eq Premium Income ETF",582,"EUR",0,"","",""],
    ["KPR.F","Klépierre",8,"EUR",0,"","",""],
    ["PBA","Pembina Pipeline",28,"USD",0,"","",""],
    ["O","Realty Income",89,"USD",0,"","",""],
    ["SAN.PA","Santander",12,"EUR",0,"","",""],
    ["SCHY","Schwab Intl High Div ETF",107,"USD",0,"","",""],
    ["SCHD","Schwab US Dividend ETF",4024,"USD",0,"","",""],
    ["SRG.MI","Snam Rete Gas",110,"EUR",0,"","",""],
    ["SPYW.DE","SPDR S&P Euro Div Aristocrats ETF",1026,"EUR",0,"","",""],
    ["ZPRG.DE","SPDR S&P Global Div Aristocrats ETF",1795,"EUR",0,"","",""],
    ["SPYD.DE","SPDR S&P US Div Aristocrats ETF",180,"EUR",0,"","",""],
    ["SU","Suncor Energy",40,"USD",0,"","",""],
    ["BNS","Bank of Nova Scotia",24,"USD",0,"","",""],
    ["TD","Toronto-Dominion Bank",40,"USD",0,"","",""],
    ["UCG.MI","UniCredit",45,"EUR",0,"","",""],
    ["UNA.AS","Unilever",29,"EUR",0,"","",""],
    ["UNP","Union Pacific",11,"USD",0,"","",""],
    ["TDIV.AS","VanEck Dev Markets Div Leaders ETF",302,"EUR",0,"","",""],
    ["VHYL.AS","Vanguard FTSE All-World High Div ETF",347,"EUR",0,"","",""],
    ["VWRD.L","Vanguard FTSE All-World ETF USD Dist",165,"USD",0,"","",""],
    ["VGWL.DE","Vanguard FTSE All-World ETF USD Acc",83,"EUR",0,"","",""],
    ["VGEU.DE","Vanguard FTSE Dev Europe ETF",317,"EUR",0,"","",""],
    ["VYM","Vanguard High Div Yield ETF",31,"USD",0,"","",""],
    ["VICI","VICI Properties",200,"USD",0,"","",""],
    ["VNA.DE","Vonovia",36,"EUR",0,"","",""],
    ["ZV.MI","Zignago Vetro",50,"EUR",0,"","",""],
  ];

  if (dati.length > 0) {
    sh.getRange(2, 1, dati.length, headers.length).setValues(dati);
  }

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 220);
  sh.setColumnWidth(3, 80);
  sh.setColumnWidth(4, 70);
  sh.setColumnWidth(5, 120);
  sh.setColumnWidth(6, 90);
  sh.setColumnWidth(7, 100);
  sh.setColumnWidth(8, 140);
  sh.setFrozenRows(1);

  // Nota informativa
  sh.getRange("A1").setNote(
    "ISTRUZIONI:\n" +
    "• Puoi avere più righe per lo stesso ticker (acquisti multipli)\n" +
    "• Il foglio Portafoglio aggrega automaticamente per ticker\n" +
    "• Prezzo Acquisto: usa il punto come decimale (es. 23.19)\n" +
    "• Puoi incollare direttamente dal tuo CSV di acquisti"
  );
}

// ── FOGLIO MAPPATURA ──────────────────────────────────────────────────────────

function creaFoglioMappatura(ss) {
  let sh = ss.getSheetByName(SHEET_MAPPATURA);
  if (!sh) sh = ss.insertSheet(SHEET_MAPPATURA, 1);
  sh.clearContents();

  const headers = ["Yahoo Ticker", "Google Ticker", "Nome", "Borsa Yahoo", "Borsa Google", "Valuta", "Note"];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeader(sh, 1, headers.length);

  const mappatura = [
    ["ABBV","NYSE:ABBV","AbbVie","NYSE","NYSE","USD",""],
    ["MO","NYSE:MO","Altria Group","NYSE","NYSE","USD",""],
    ["AAPL","NASDAQ:AAPL","Apple","NASDAQ","NASDAQ","USD",""],
    ["BTI","NYSE:BTI","British American Tobacco","NYSE","NYSE","USD","ADR su NYSE"],
    ["CP","NYSE:CP","Canadian Pacific Kansas City","NYSE","NYSE","USD",""],
    ["CVX","NYSE:CVX","Chevron","NYSE","NYSE","USD",""],
    ["XOM","NYSE:XOM","ExxonMobil","NYSE","NYSE","USD",""],
    ["INTU","NASDAQ:INTU","Intuit","NASDAQ","NASDAQ","USD",""],
    ["JNJ","NYSE:JNJ","Johnson & Johnson","NYSE","NYSE","USD",""],
    ["PBA","NYSE:PBA","Pembina Pipeline","NYSE","NYSE","USD","ADR su NYSE"],
    ["O","NYSE:O","Realty Income","NYSE","NYSE","USD",""],
    ["SU","NYSE:SU","Suncor Energy","NYSE","NYSE","USD",""],
    ["BNS","NYSE:BNS","Bank of Nova Scotia","NYSE","NYSE","USD","ADR su NYSE"],
    ["TD","NYSE:TD","Toronto-Dominion Bank","NYSE","NYSE","USD","ADR su NYSE"],
    ["UNP","NYSE:UNP","Union Pacific","NYSE","NYSE","USD",""],
    ["VICI","NYSE:VICI","VICI Properties","NYSE","NYSE","USD",""],
    ["DIVO","NYSEARCA:DIVO","Amplify CWP Enhanced Dividend Income ETF","NYSEARCA","NYSEARCA","USD",""],
    ["QDVO","NYSEARCA:QDVO","Amplify Dividend & Income ETF","NYSEARCA","NYSEARCA","USD",""],
    ["IDVO","NYSEARCA:IDVO","Amplify International Dividend Income ETF","NYSEARCA","NYSEARCA","USD",""],
    ["SPHD","NYSEARCA:SPHD","Invesco S&P500 High Div Low Vol ETF","NYSEARCA","NYSEARCA","USD",""],
    ["SCHD","NYSEARCA:SCHD","Schwab US Dividend Equity ETF","NYSEARCA","NYSEARCA","USD",""],
    ["SCHY","NYSEARCA:SCHY","Schwab International Dividend Equity ETF","NYSEARCA","NYSEARCA","USD",""],
    ["VYM","NYSEARCA:VYM","Vanguard High Dividend Yield ETF","NYSEARCA","NYSEARCA","USD",""],
    ["VWRD.L","LON:VWRD","Vanguard FTSE All-World UCITS ETF USD Dist","LSE","LON","USD",""],
    ["HPRD.L","LON:HPRD","HSBC FTSE EPRA/NAREIT Developed UCITS ETF","LSE","LON","USD",""],
    ["EWSX.L","LON:EWSX","iShares STOXX Europe Select Dividend 30 UCITS ETF","LSE","LON","USD",""],
    ["FGQP.L","LON:FGQP","Franklin Global Quality Dividend UCITS ETF GBP Hdg","LSE","LON","USD","Verificare disponibilità"],
    ["G.MI","BIT:G","Generali","Borsa Italiana","BIT","EUR",""],
    ["ENI.MI","BIT:ENI","Eni","Borsa Italiana","BIT","EUR",""],
    ["ISP.MI","BIT:ISP","Intesa Sanpaolo","Borsa Italiana","BIT","EUR",""],
    ["UCG.MI","BIT:UCG","UniCredit","Borsa Italiana","BIT","EUR",""],
    ["SRG.MI","BIT:SRG","Snam Rete Gas","Borsa Italiana","BIT","EUR",""],
    ["ZV.MI","BIT:ZV","Zignago Vetro","Borsa Italiana","BIT","EUR",""],
    ["IUKD.MI","MIL:IUKD","iShares UK Dividend UCITS ETF","Borsa Italiana","BIT","EUR",""],
    ["BAYN.DE","ETR:BAYN","Bayer","XETRA","ETR","EUR",""],
    ["BSN.DE","ETR:BSN","Danone (XETRA)","XETRA","ETR","EUR","Alt: EPA:BN se ETR:BSN non funziona"],
    ["VNA.DE","ETR:VNA","Vonovia","XETRA","ETR","EUR",""],
    ["FUSD.DE","FRA:FUSD","Franklin FTSE USA UCITS ETF","XETRA","ETR","EUR",""],
    ["FLXD.DE","FRA:FLXD","Franklin European Quality Dividend UCITS ETF","XETRA","ETR","EUR",""],
    ["EHDL.DE","FRA:EHDL","iShares EM Dividend UCITS ETF","XETRA","ETR","EUR",""],
    ["EUNL.DE","FRA:EUNL","iShares Core MSCI World UCITS ETF","XETRA","ETR","EUR",""],
    ["IQQ6.DE","FRA:IQQ6","iShares Developed Mkts Property Yield UCITS ETF","XETRA","ETR","EUR",""],
    ["IQQA.DE","FRA:IQQA","iShares Core MSCI USA UCITS ETF","XETRA","ETR","EUR",""],
    ["IQQP.DE","FRA:IQQP","iShares Core MSCI Europe UCITS ETF","XETRA","ETR","EUR",""],
    ["QDVW.DE","FRA:QDVW","WisdomTree Global Quality Dividend Growth UCITS ETF","XETRA","ETR","EUR",""],
    ["EXSA.DE","FRA:EXSA","iShares Core STOXX Europe 600 UCITS ETF","XETRA","ETR","EUR",""],
    ["EXSH.DE","FRA:EXSH","iShares STOXX Europe Select Dividend 30 UCITS ETF","XETRA","ETR","EUR",""],
    ["ISPA.DE","FRA:ISPA","iShares MSCI Europe High Dividend Yield UCITS ETF","XETRA","ETR","EUR",""],
    ["SPYW.DE","FRA:SPYW","SPDR S&P Euro Dividend Aristocrats UCITS ETF","XETRA","ETR","EUR",""],
    ["ZPRG.DE","ETR:ZPRG","SPDR S&P Global Dividend Aristocrats UCITS ETF","XETRA","ETR","EUR",""],
    ["SPYD.DE","FRA:SPYD","SPDR S&P US Dividend Aristocrats UCITS ETF","XETRA","ETR","EUR",""],
    ["JGPI.DE","FRA:JGPI","JPM Global Equity Premium Income Active UCITS ETF","XETRA","ETR","EUR",""],
    ["JEQP.DE","FRA:JEQP","JPM Nasdaq Equity Premium Income Active UCITS ETF","XETRA","ETR","EUR",""],
    ["FGEQ.DE","FRA:FGEQ","Franklin Global Quality Dividend UCITS ETF","XETRA","ETR","EUR",""],
    ["VGWL.DE","FRA:VGWL","Vanguard FTSE All-World UCITS ETF USD Acc","XETRA","ETR","EUR",""],
    ["VGEU.DE","FRA:VGEU","Vanguard FTSE Developed Europe UCITS ETF","XETRA","ETR","EUR",""],
    ["KPR.F","FRA:KPR","Klépierre","Frankfurt","FRA","EUR",""],
    ["SAN.PA","EPA:SAN","Santander","Euronext Paris","EPA","EUR",""],
    ["IMAE.AS","AMS:IMAE","iShares Core MSCI Europe UCITS ETF","Euronext Amsterdam","AMS","EUR",""],
    ["UNA.AS","AMS:UNA","Unilever","Euronext Amsterdam","AMS","EUR",""],
    ["TDIV.AS","AMS:TDIV","VanEck Morningstar Dev Markets Div Leaders ETF","Euronext Amsterdam","AMS","EUR",""],
    ["VHYL.AS","AMS:VHYL","Vanguard FTSE All-World High Dividend Yield UCITS ETF","Euronext Amsterdam","AMS","EUR",""],
  ];

  sh.getRange(2, 1, mappatura.length, headers.length).setValues(mappatura);

  [100, 130, 220, 100, 100, 70, 160].forEach((w, i) => sh.setColumnWidth(i+1, w));
  sh.setFrozenRows(1);

  // Named range per lookup
  ss.setNamedRange("MappaturaTicker", sh.getRange(2, 1, mappatura.length, 2));
}

// ── FOGLIO PORTAFOGLIO ────────────────────────────────────────────────────────

function creaFoglioPortafoglio(ss) {
  let sh = ss.getSheetByName(SHEET_PORTAFOGLIO);
  if (!sh) sh = ss.insertSheet(SHEET_PORTAFOGLIO, 2);
  sh.clearContents();

  const headers = [
    "Yahoo Ticker","Google Ticker","Nome","Valuta",
    "Quantità Totale","Prezzo Medio Acq.","Costo Totale",
    "Prezzo Attuale","Data Chiusura","Var. %","Valore Attuale",
    "Valore USD","% Portafoglio","P&L","P&L %",
    "Div TTM/az","Div TTM Totale","Yield TTM %",
    "Broker","Ultimo Aggiornamento"
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeader(sh, 1, headers.length);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);

  // Filtri su tutte le colonne (attivati sull'intera riga header)
  sh.getRange(1, 1, 1, headers.length).createFilter();

  [100,130,200,70, 90,120,110, 110,90,70,120, 100,90,100,70, 90,110,80, 140,140]
    .forEach((w, i) => sh.setColumnWidth(i+1, w));
}

// ── FOGLIO CAMBI ──────────────────────────────────────────────────────────────

function creaFoglioCambi(ss) {
  let sh = ss.getSheetByName(SHEET_CAMBI);
  if (!sh) sh = ss.insertSheet(SHEET_CAMBI, 3);
  sh.clearContents();

  sh.getRange("A1:D1").setValues([["Coppia valuta","Ticker Google Finance","Tasso","Ultimo aggiornamento"]]);
  formatHeader(sh, 1, 4);

  const cambi = [
    ["EUR/USD","CURRENCY:EURUSD","",""],
    ["HUF/USD","CURRENCY:HUFUSD","",""],
    ["GBP/USD","CURRENCY:GBPUSD","",""],
    ["USD/EUR","CURRENCY:USDEUR","",""],
    ["USD/HUF","CURRENCY:USDHUF","",""],
  ];
  sh.getRange(2, 1, cambi.length, 4).setValues(cambi);

  // Formula GOOGLEFINANCE per i tassi
  // Nota: usiamo setFormula con sintassi EN-US (virgola) — Apps Script la converte
  // automaticamente. Se il foglio è in italiano e le formule danno errore,
  // aggiornaCambi() le riscrive via UrlFetch da Yahoo Finance.
  for (let i = 0; i < cambi.length; i++) {
    sh.getRange(i+2, 3).setFormula(`=GOOGLEFINANCE(B${i+2},"price")`);
    sh.getRange(i+2, 4).setValue(new Date());
  }

  [120, 160, 100, 160].forEach((w,i) => sh.setColumnWidth(i+1, w));

  // Named ranges per i tassi
  // C2 = EUR/USD  C3 = HUF/USD  C4 = GBP/USD  C5 = USD/EUR  C6 = USD/HUF
  ss.setNamedRange("TassoEURUSD", sh.getRange("C2"));
  ss.setNamedRange("TassoUSDHUF", sh.getRange("C6")); // C6 = USD/HUF (riga 6, non C5)
  ss.setNamedRange("TassoGBPUSD", sh.getRange("C4"));
}

// ── FOGLIO DIVIDENDI ──────────────────────────────────────────────────────────

function creaFoglioDividendi(ss) {
  let sh = ss.getSheetByName(SHEET_DIVIDENDI);
  if (!sh) sh = ss.insertSheet(SHEET_DIVIDENDI, 4);
  sh.clearContents();

  const headers = ["Yahoo Ticker", "Nome", "Valuta", "Div TTM/az", "Yield TTM %", "Fonte", "Ultimo Aggiorn."];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeader(sh, 1, headers.length);
  sh.setFrozenRows(1);

  [100, 200, 70, 100, 90, 80, 130].forEach((w,i) => sh.setColumnWidth(i+1, w));

  sh.getRange("A2").setNote(
    "Questa tabella viene popolata automaticamente da Apps Script.\n" +
    "I dati vengono recuperati da Yahoo Finance via UrlFetch.\n" +
    "Fonte: 'GF' = GOOGLEFINANCE yieldpct | 'YF' = Yahoo Finance API"
  );
}

// ── FOGLIO GEO ────────────────────────────────────────────────────────────────

function creaFoglioGeo(ss) {
  let sh = ss.getSheetByName(SHEET_GEO);
  if (!sh) sh = ss.insertSheet(SHEET_GEO, 5);
  sh.clearContents();

  const headers = ["Yahoo Ticker","Nome","Nord America %","Europa %","Asia Pacific %","Mercati Em. %","Globale %","Note"];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeader(sh, 1, headers.length);

  const geo = [
    ["ABBV","AbbVie",100,0,0,0,0,""],
    ["MO","Altria Group",100,0,0,0,0,""],
    ["AAPL","Apple",100,0,0,0,0,""],
    ["BTI","British American Tobacco",40,40,0,0,20,"Revenue globale"],
    ["CP","Canadian Pacific Kansas City",100,0,0,0,0,""],
    ["CVX","Chevron",80,0,0,0,20,""],
    ["XOM","ExxonMobil",80,0,0,0,20,""],
    ["INTU","Intuit",100,0,0,0,0,""],
    ["JNJ","Johnson & Johnson",55,25,0,0,20,""],
    ["PBA","Pembina Pipeline",100,0,0,0,0,""],
    ["O","Realty Income",85,15,0,0,0,""],
    ["SU","Suncor Energy",100,0,0,0,0,""],
    ["BNS","Bank of Nova Scotia",65,0,0,0,35,"Forte presenza LatAm"],
    ["TD","Toronto-Dominion Bank",100,0,0,0,0,""],
    ["UNP","Union Pacific",100,0,0,0,0,""],
    ["VICI","VICI Properties",100,0,0,0,0,""],
    ["DIVO","Amplify CWP Enhanced Div ETF",100,0,0,0,0,"USA large cap"],
    ["QDVO","Amplify Dividend & Income ETF",100,0,0,0,0,"USA covered call"],
    ["FUSD.DE","Franklin FTSE USA ETF",100,0,0,0,0,""],
    ["IQQA.DE","iShares Core MSCI USA ETF",100,0,0,0,0,""],
    ["JEQP.DE","JPM Nasdaq Eq Premium Income ETF",100,0,0,0,0,""],
    ["SPHD","Invesco S&P500 High Div Low Vol ETF",100,0,0,0,0,""],
    ["SCHD","Schwab US Dividend Equity ETF",100,0,0,0,0,""],
    ["SPYD.DE","SPDR S&P US Div Aristocrats ETF",100,0,0,0,0,""],
    ["VYM","Vanguard High Dividend Yield ETF",100,0,0,0,0,""],
    ["G.MI","Generali",0,75,0,0,25,""],
    ["BAYN.DE","Bayer",35,40,0,0,25,""],
    ["BSN.DE","Danone",25,45,0,0,30,""],
    ["ENI.MI","Eni",0,35,0,0,65,"Italia/Africa/Medio Oriente"],
    ["ISP.MI","Intesa Sanpaolo",0,90,0,0,10,""],
    ["KPR.F","Klépierre",0,100,0,0,0,"REIT centri commerciali EU"],
    ["SAN.PA","Santander",20,45,0,0,35,"Forte LatAm"],
    ["SRG.MI","Snam Rete Gas",0,100,0,0,0,""],
    ["UCG.MI","UniCredit",0,90,0,0,10,""],
    ["UNA.AS","Unilever",20,30,20,0,30,""],
    ["VNA.DE","Vonovia",0,100,0,0,0,""],
    ["ZV.MI","Zignago Vetro",0,80,0,0,20,""],
    ["FLXD.DE","Franklin EU Quality Div ETF",0,100,0,0,0,""],
    ["IMAE.AS","iShares Core MSCI Europe ETF",0,100,0,0,0,""],
    ["IQQP.DE","iShares Core MSCI Europe ETF",0,100,0,0,0,""],
    ["IUKD.MI","iShares UK Dividend ETF",0,100,0,0,0,""],
    ["EWSX.L","iShares STOXX EU Select Div ETF",0,100,0,0,0,""],
    ["EXSA.DE","iShares Core STOXX Europe 600 ETF",0,100,0,0,0,""],
    ["EXSH.DE","iShares STOXX EU Select Div 30 ETF",0,100,0,0,0,""],
    ["ISPA.DE","iShares MSCI EU High Div Yield ETF",0,100,0,0,0,""],
    ["SPYW.DE","SPDR S&P Euro Div Aristocrats ETF",0,100,0,0,0,""],
    ["VGEU.DE","Vanguard FTSE Dev Europe ETF",0,100,0,0,0,""],
    ["IQQ6.DE","iShares Dev Mkts Property Yield ETF",63,15,22,0,0,"FTSE EPRA/NAREIT Dev - dati JustETF"],
    ["HPRD.L","HSBC FTSE EPRA/NAREIT Dev ETF",63,15,22,0,0,"FTSE EPRA/NAREIT Dev - dati JustETF"],
    ["EHDL.DE","iShares EM Dividend UCITS ETF",0,0,0,100,0,""],
    ["IDVO","Amplify International Dividend ETF",0,55,30,0,15,"ex-US"],
    ["FGEQ.DE","Franklin Global Quality Div ETF",50,30,0,0,20,""],
    ["FGQP.L","Franklin Global Quality Div GBP ETF",50,30,0,0,20,""],
    ["EUNL.DE","iShares Core MSCI World ETF",65,20,10,0,5,""],
    ["QDVW.DE","WisdomTree MSCI World Qual Div ETF",60,25,10,0,5,""],
    ["JGPI.DE","JPM Global Eq Premium Income ETF",60,20,15,0,5,""],
    ["SCHY","Schwab Intl High Div ETF",0,45,30,0,25,"ex-US"],
    ["ZPRG.DE","SPDR S&P Global Div Aristocrats ETF",40,35,15,0,10,""],
    ["TDIV.AS","VanEck Dev Markets Div Leaders ETF",50,30,15,0,5,""],
    ["VHYL.AS","Vanguard FTSE All-World High Div ETF",55,25,15,0,5,""],
    ["VWRD.L","Vanguard FTSE All-World ETF USD Dist",60,20,15,0,5,""],
    ["VGWL.DE","Vanguard FTSE All-World ETF USD Acc",60,20,15,0,5,""],
  ];

  sh.getRange(2, 1, geo.length, headers.length).setValues(geo);

  // Formattazione condizionale per le percentuali
  [100, 200, 110, 90, 110, 110, 80, 160].forEach((w,i) => sh.setColumnWidth(i+1, w));
  sh.setFrozenRows(1);

  sh.getRange(2, 3, geo.length, 5).setNumberFormat("0.0\"%\"");

  sh.getRange("A1").setNote(
    "Modifica liberamente le percentuali geografiche.\n" +
    "La somma per riga dovrebbe essere 100.\n" +
    "Queste vengono usate dalla Dashboard per il grafico geografico."
  );
}

// ── FOGLIO DASHBOARD ──────────────────────────────────────────────────────────

function creaFoglioDashboard(ss) {
  let sh = ss.getSheetByName(SHEET_DASHBOARD);
  if (!sh) sh = ss.insertSheet(SHEET_DASHBOARD, 6);
  sh.clearContents();
  sh.setTabColor("#378ADD");

  // Titolo
  sh.getRange("A1:F1").merge()
    .setValue("📊 PORTFOLIO DASHBOARD")
    .setBackground(COLOR_HEADER)
    .setFontColor(COLOR_WHITE)
    .setFontSize(16)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sh.setRowHeight(1, 45);

  // Sottotitolo data
  sh.getRange("A2:F2").merge()
    .setFormula('="Ultimo aggiornamento: "&TEXT(NOW(),"dd/mm/yyyy HH:mm")')
    .setBackground("#2d2d44")
    .setFontColor("#aaaacc")
    .setFontSize(10)
    .setHorizontalAlignment("center");

  // ── SEZIONE VALORI ──────────────────────────────────────────────────────────
  sh.getRange("A4").setValue("VALORE PORTAFOGLIO").setFontWeight("bold").setFontColor("#888780");

  const metriche = [
    ["Valore Totale (USD)", `=IFERROR(SUMIF(Portafoglio!D:D,"USD",Portafoglio!L:L)+SUMIF(Portafoglio!D:D,"EUR",Portafoglio!L:L),0)`, "USD"],
    ["Valore Totale (EUR)", `=IFERROR(D5/TassoEURUSD,0)`, "EUR"],
    ["Valore Totale (HUF)", `=IFERROR(D5*TassoUSDHUF,0)`, "HUF"],
    // FIX: costo in valuta locale → converti EUR e GBP in USD prima di sommare
    ["Costo Totale (USD)", `=IFERROR(SUMIF(Portafoglio!D:D,"USD",Portafoglio!G:G)+SUMIF(Portafoglio!D:D,"EUR",Portafoglio!G:G)*TassoEURUSD+SUMIF(Portafoglio!D:D,"GBP",Portafoglio!G:G)*TassoGBPUSD,0)`, "USD"],
    ["P&L Non Realizzato (USD)", `=IFERROR(D5-D8,0)`, "USD"],
    ["P&L %", `=IFERROR(D9/D8,0)`, "%"],
  ];

  metriche.forEach((m, i) => {
    const row = 5 + i;
    sh.getRange(row, 1).setValue(m[0]).setFontColor("#5f5e5a");
    sh.getRange(row, 4).setFormula(m[1]);
    sh.getRange(row, 5).setValue(m[2]).setFontColor("#888780");

    if (m[2] === "USD") sh.getRange(row, 4).setNumberFormat('"$"#,##0.00');
    else if (m[2] === "EUR") sh.getRange(row, 4).setNumberFormat('"€"#,##0.00');
    else if (m[2] === "HUF") sh.getRange(row, 4).setNumberFormat('"Ft "#,##0');
    else if (m[2] === "%") sh.getRange(row, 4).setNumberFormat('0.00%');
  });

  // ── SEZIONE DIVIDENDI ───────────────────────────────────────────────────────
  sh.getRange("A12").setValue("DIVIDENDI").setFontWeight("bold").setFontColor("#888780");

  const divMetriche = [
    // Div TTM Totale (USD) — col Q (17) è già in USD dopo aggiornaColonneDividendi
    // FIX: rimosso SUMPRODUCT separato per EUR (la conversione è già applicata dallo script)
    ["Div. TTM Totale (USD)", `=IFERROR(SUM(Portafoglio!Q2:Q200),0)`, "USD"],
    ["Div. TTM Totale (EUR)", `=IFERROR(D13/TassoEURUSD,0)`, "EUR"],
    ["Div. TTM Totale (HUF)", `=IFERROR(D13*TassoUSDHUF,0)`, "HUF"],
    ["Yield TTM %", `=IFERROR(D13/D5,0)`, "%"],
  ];

  divMetriche.forEach((m, i) => {
    const row = 13 + i;
    sh.getRange(row, 1).setValue(m[0]).setFontColor("#5f5e5a");
    sh.getRange(row, 4).setFormula(m[1]);
    sh.getRange(row, 5).setValue(m[2]).setFontColor("#888780");
    if (m[2] === "USD") sh.getRange(row, 4).setNumberFormat('"$"#,##0.00');
    else if (m[2] === "EUR") sh.getRange(row, 4).setNumberFormat('"€"#,##0.00');
    else if (m[2] === "HUF") sh.getRange(row, 4).setNumberFormat('"Ft "#,##0');
    else if (m[2] === "%") sh.getRange(row, 4).setNumberFormat('0.00%');
  });

  // ── CAMBI ───────────────────────────────────────────────────────────────────
  sh.getRange("A22").setValue("CAMBI").setFontWeight("bold").setFontColor("#888780");
  sh.getRange("A23").setValue("EUR/USD").setFontColor("#5f5e5a");
  sh.getRange("D23").setFormula("=TassoEURUSD").setNumberFormat("0.0000");
  sh.getRange("A24").setValue("USD/HUF").setFontColor("#5f5e5a");
  sh.getRange("D24").setFormula("=TassoUSDHUF").setNumberFormat("0.00");
  sh.getRange("A25").setValue("GBP/USD").setFontColor("#5f5e5a");
  sh.getRange("D25").setFormula("=TassoGBPUSD").setNumberFormat("0.0000");

  // Larghezze colonne
  [220, 60, 60, 140, 60, 60].forEach((w,i) => sh.setColumnWidth(i+1, w));
  sh.setColumnWidth(3, 20);
  sh.setColumnWidth(6, 20);
}

// ── AGGIORNA CALCOLI PORTAFOGLIO ──────────────────────────────────────────────

function aggiornaCalcoliPortafoglio(ss) {
  const shAcq  = ss.getSheetByName(SHEET_ACQUISTI);
  const shMap  = ss.getSheetByName(SHEET_MAPPATURA);
  const shPort = ss.getSheetByName(SHEET_PORTAFOGLIO);
  const shDiv  = ss.getSheetByName(SHEET_DIVIDENDI);

  // Leggi acquisti
  const acqData = shAcq.getDataRange().getValues();
  const acqHeaders = acqData[0];
  // Supporta sia gli header del foglio Acquisti ("Yahoo Ticker", "Quantità"...)
  // che quelli del CSV originale ("Simbolo", "Qtá", "Prezzo"...)
  const idxYahoo  = ["Yahoo Ticker","Simbolo","Symbol"]
                      .reduce((a,h) => a>=0 ? a : acqHeaders.indexOf(h), -1);
  const idxQty    = ["Quantità","Qtá","Qta","Qty","Quantity"]
                      .reduce((a,h) => a>=0 ? a : acqHeaders.indexOf(h), -1);
  const idxPrezzo = ["Prezzo Acquisto","Prezzo","Price"]
                      .reduce((a,h) => a>=0 ? a : acqHeaders.indexOf(h), -1);
  const idxValuta = ["Valuta","Currency"]
                      .reduce((a,h) => a>=0 ? a : acqHeaders.indexOf(h), -1);
  const idxBroker = acqHeaders.indexOf("Broker");

  // FIX: verifica che le colonne obbligatorie esistano
  if (idxYahoo < 0) throw new Error("Colonna ticker non trovata nel foglio Acquisti. Header trovati: " + acqHeaders.join(", "));
  if (idxQty < 0)   throw new Error("Colonna quantità non trovata nel foglio Acquisti. Header trovati: " + acqHeaders.join(", "));

  // Leggi mappatura
  const mapData = shMap.getDataRange().getValues();
  const mapMap = {};
  for (let i = 1; i < mapData.length; i++) {
    if (mapData[i][0]) mapMap[mapData[i][0]] = mapData[i][1]; // Yahoo → Google
  }

  // Leggi nomi dalla mappatura
  const nomiMap = {};
  for (let i = 1; i < mapData.length; i++) {
    if (mapData[i][0]) nomiMap[mapData[i][0]] = mapData[i][2];
  }

  // Leggi dividendi
  const divData = shDiv.getDataRange().getValues();
  const divMap = {};
  for (let i = 1; i < divData.length; i++) {
    if (divData[i][0]) {
      divMap[divData[i][0]] = {
        ttm: divData[i][3] || 0,
        fwd: divData[i][4] || 0,
      };
    }
  }

  // Leggi tasso EUR/USD
  const shCambi = ss.getSheetByName(SHEET_CAMBI);
  const tassoEURUSD = shCambi.getRange("C2").getValue() || 1.08;
  const tassoGBPUSD = shCambi.getRange("C4").getValue() || 1.27;

  // Aggrega per ticker
  const agg = {};
  for (let i = 1; i < acqData.length; i++) {
    const row = acqData[i];
    const sym    = row[idxYahoo] ? String(row[idxYahoo]).trim() : "";
    // Normalizza quantità e prezzo dal foglio Acquisti.
    // Il CSV originale usa: punto = migliaia, virgola = decimale.
    // Dopo import in GSheet con locale IT, i valori possono essere:
    //   - numero già convertito da GSheet (es. 4709, 23.19)
    //   - stringa con formato originale (es. "4.709", "23,19")
    //   - stringa con formato GSheet-IT (es. "4.709" interpretato come 4.709)
    function parseQty(val) {
      if (typeof val === "number") {
        // GSheet con locale IT può interpretare "4.709" come 4.709 invece di 4709.
        // Euristico: se il numero ha esattamente 3 cifre decimali che formano
        // un intero senza resto → era quasi certamente un separatore delle migliaia.
        // Es: 4.709 → 4.709 === 4709/1000 → riconosciuto come migliaia → 4709
        // Ma 23.19 → 23.19 non ha 3 decimali esatti → rimane 23.19
        const str = val.toString();
        const dotIdx = str.indexOf(".");
        if (dotIdx !== -1) {
          const decimals = str.slice(dotIdx + 1);
          if (decimals.length === 3 && Number.isInteger(val * 1000)) {
            // Era un separatore delle migliaia mal interpretato
            return Math.round(val * 1000);
          }
        }
        return val;
      }
      const s = String(val || "0").trim();
      if (!s || s === "0") return 0;
      // Formato "4.709" (punto migliaia) → 4709
      if (s.includes(".") && s.includes(",")) {
        // es. "4.709,50" → punto migliaia, virgola decimale
        return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
      }
      if (s.includes(",") && !s.includes(".")) {
        // es. "4709,5" → virgola decimale
        return parseFloat(s.replace(",", ".")) || 0;
      }
      if (s.includes(".")) {
        const parts = s.split(".");
        if (parts.length === 2 && parts[1].length === 3 && parseInt(parts[1]) > 0) {
          // es. "4.709" → separatore migliaia → 4709
          return parseFloat(parts[0] + parts[1]) || 0;
        }
        // es. "23.19" → decimale americano
        return parseFloat(s) || 0;
      }
      return parseFloat(s) || 0;
    }

    function parsePrezzo(val) {
      if (typeof val === "number") return val;
      const s = String(val || "0").trim();
      if (!s || s === "0") return 0;
      if (s.includes(".") && s.includes(",")) {
        // es. "1.234,56" → 1234.56
        return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
      }
      if (s.includes(",") && !s.includes(".")) {
        // es. "23,19" → 23.19
        return parseFloat(s.replace(",", ".")) || 0;
      }
      return parseFloat(s) || 0;
    }

    const qty    = parseQty(row[idxQty]);
    const prezzo = parsePrezzo(row[idxPrezzo]);
    const valuta = row[idxValuta] ? String(row[idxValuta]).trim().toUpperCase() : "USD";
    const broker = row[idxBroker] ? String(row[idxBroker]).trim() : "";
    if (!sym || qty === 0) continue;

    if (!agg[sym]) {
      agg[sym] = { qty: 0, cost: 0, valuta, brokers: new Set() };
    }
    agg[sym].qty  += qty;
    agg[sym].cost += qty * prezzo;
    if (broker) agg[sym].brokers.add(broker);
  }

  // Costruisci righe portafoglio
  const now = new Date();
  const rows = [];

  for (const [sym, d] of Object.entries(agg)) {
    const googleTicker = mapMap[sym] || sym;
    const nome         = nomiMap[sym] || sym;
    const avgPrice     = d.qty > 0 ? d.cost / d.qty : 0;
    const brokers      = [...d.brokers].join(", ");
    const divTTM       = divMap[sym] ? divMap[sym].ttm : 0;
  
    rows.push([sym, googleTicker, nome, d.valuta, d.qty, avgPrice, d.cost,
      "", "", "", "", "", "", "", "",        // prezzi live H-O: prezzo, data chius., var%, val.loc, val.usd, %port, p&l, p&l%
      divTTM, 0, 0,                          // dividendi TTM (colonne P=div/az, Q=tot, R=yield)
      brokers, now]);
  }

  // Scrivi sul foglio
  const shPortData = shPort.getDataRange().getValues();
  const lastRow = shPort.getLastRow();
  if (lastRow > 1) shPort.getRange(2, 1, lastRow - 1, 20).clearContent();

  if (rows.length > 0) {
    shPort.getRange(2, 1, rows.length, 20).setValues(rows);
  }

  // Aggiungi formule GOOGLEFINANCE per prezzi live (colonna H = prezzo attuale)
  for (let i = 0; i < rows.length; i++) {
    const r      = i + 2;
    const gTick  = `B${r}`;  // Google Ticker
    const valuta = rows[i][3];
    const avgP   = `F${r}`;  // prezzo medio acquisto

    // Prezzo attuale (chiusura precedente)
    shPort.getRange(r, 8).setFormula(
      `=IFERROR(GOOGLEFINANCE(${gTick},"closeyest"),"")`
    );
    // Var % vs prezzo medio acquisto
    shPort.getRange(r, 9).setFormula(`=IFERROR(TEXT(GOOGLEFINANCE(${gTick},"date"),"dd/mm/yyyy"),"")`); // Data chiusura
    shPort.getRange(r, 10).setFormula(
      `=IFERROR(IF(${avgP}>0,(H${r}-${avgP})/${avgP},""),(H${r}-${avgP})/${avgP})`
    );
    // Valore attuale in valuta locale
    shPort.getRange(r, 11).setFormula(`=IFERROR(E${r}*H${r},"")`);
    // Valore in USD
    if (valuta === "EUR") {
      shPort.getRange(r, 12).setFormula(`=IFERROR(K${r}*TassoEURUSD,"")`);
    } else if (valuta === "GBP") {
      shPort.getRange(r, 12).setFormula(`=IFERROR(K${r}*TassoGBPUSD,"")`);
    } else {
      shPort.getRange(r, 12).setFormula(`=IFERROR(K${r},"")`);
    }
    // % portafoglio — placeholder, calcolata sotto dopo flush
    // (evita riferimento circolare L/SUM(L))
    shPort.getRange(r, 13).setValue("");
    // P&L assoluto in USD (col 14 = N)
    // FIX: era scritto su col 15 due volte, la prima scrittura veniva sovrascritta
    shPort.getRange(r, 14).setFormula(
      `=IFERROR(L${r}-G${r}*IF(D${r}="EUR",TassoEURUSD,IF(D${r}="GBP",TassoGBPUSD,1)),"")`
    );
    // P&L % (col 15 = O)
    shPort.getRange(r, 15).setFormula(
      `=IFERROR(N${r}/(G${r}*IF(D${r}="EUR",TassoEURUSD,IF(D${r}="GBP",TassoGBPUSD,1))),"")`
    );
    // Div TTM totale in USD (col 17 = Q)
    // FIX: era scritto su col 18 due volte, la prima scrittura veniva sovrascritta
    if (valuta === "EUR") {
      shPort.getRange(r, 17).setFormula(`=IFERROR(E${r}*P${r}*TassoEURUSD,"")`);
    } else if (valuta === "GBP") {
      shPort.getRange(r, 17).setFormula(`=IFERROR(E${r}*P${r}*TassoGBPUSD,"")`);
    } else {
      shPort.getRange(r, 17).setFormula(`=IFERROR(E${r}*P${r},"")`);
    }
    // Yield TTM % (col 18 = R) — valore decimale (es. 0.045 = 4.5%)
    shPort.getRange(r, 18).setFormula(
      `=IFERROR(IF(H${r}>0,P${r}/H${r},""),"")`
    );
      
  }

  // Formattazione numeri
  if (rows.length > 0) {
    const n = rows.length;
    shPort.getRange(2, 5, n, 1).setNumberFormat("#,##0.0000");   // Qty
    shPort.getRange(2, 6, n, 2).setNumberFormat("#,##0.00");     // Prezzo medio, Costo
    shPort.getRange(2, 8, n, 1).setNumberFormat("#,##0.0000");   // Prezzo attuale
    shPort.getRange(2, 9, n, 1).setNumberFormat("dd/mm/yyyy");   // Data chiusura
    shPort.getRange(2, 10, n, 1).setNumberFormat("+0.00%;-0.00%"); // Var %
    shPort.getRange(2, 11, n, 1).setNumberFormat("#,##0.00");    // Valore locale
    shPort.getRange(2, 12, n, 1).setNumberFormat('"$"#,##0.00'); // Valore USD
    shPort.getRange(2, 13, n, 1).setNumberFormat("0.00%");       // % portafoglio

    // Calcola % portafoglio dopo flush (evita riferimento circolare)
    SpreadsheetApp.flush();
    Utilities.sleep(2000);
    const valUSDRange = shPort.getRange(2, 12, n, 1).getValues();
    const totUSD = valUSDRange.reduce(function(s, row) {
      return s + (typeof row[0] === "number" ? row[0] : 0);
    }, 0);
    if (totUSD > 0) {
      const pctValues = valUSDRange.map(function(row) {
        const v = typeof row[0] === "number" ? row[0] : 0;
        return [v / totUSD];
      });
      shPort.getRange(2, 13, n, 1).setValues(pctValues);
    }
    shPort.getRange(2, 14, n, 1).setNumberFormat('"$"#,##0.00'); // P&L USD
    shPort.getRange(2, 15, n, 1).setNumberFormat("+0.00%;-0.00%"); // P&L %
    shPort.getRange(2, 16, n, 1).setNumberFormat("#,##0.0000");  // Div TTM/az
    shPort.getRange(2, 17, n, 1).setNumberFormat('"$"#,##0.00'); // Div TTM tot
    shPort.getRange(2, 18, n, 1).setNumberFormat("0.00%");       // Yield TTM
      
    // Formattazione condizionale Var % (verde/rosso)
    coloraVariazioni(shPort, 10, 2, n);
    coloraVariazioni(shPort, 15, 2, n);
  }
}

// ── AGGIORNA DIVIDENDI (Yahoo Finance) ────────────────────────────────────────

function aggiornaCambi(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_CAMBI);
  if (!sh) return;

  const pairs = [
    ["EUR/USD", "EUR", "USD"],
    ["HUF/USD", "HUF", "USD"],
    ["GBP/USD", "GBP", "USD"],
    ["USD/EUR", "USD", "EUR"],
    ["USD/HUF", "USD", "HUF"],
  ];

  const now = new Date();
  pairs.forEach(function(pair, i) {
    const from = pair[1], to = pair[2];
    const row  = i + 2;
    let rate   = null;

    // Prova GOOGLEFINANCE
    try {
      const gfTicker = "CURRENCY:" + from + to;
      sh.getRange(row, 2).setValue(gfTicker);
      sh.getRange(row, 3).setFormula('=GOOGLEFINANCE("' + gfTicker + '","price")');
      SpreadsheetApp.flush();
      const val = sh.getRange(row, 3).getValue();
      if (typeof val === "number" && val > 0) rate = val;
    } catch(e) {}

    // Fallback Yahoo Finance
    if (!rate) {
      try {
        const sym  = from + to + "=X";
        const url  = "https://query1.finance.yahoo.com/v8/finance/chart/" + sym + "?interval=1d&range=1d";
        const resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
        const json = JSON.parse(resp.getContentText());
        const meta = (json && json.chart && json.chart.result && json.chart.result[0])
                     ? json.chart.result[0].meta : {};
        rate = meta.regularMarketPrice || meta.previousClose || null;
        if (rate) sh.getRange(row, 3).setValue(rate);
      } catch(e) {}
    }

    sh.getRange(row, 4).setValue(now);
  });

  SpreadsheetApp.flush();
}

function aggiornaDividendi(ss) {
  /**
   * Recupera dividendi TTM sommando i pagamenti reali dell'ultimo anno
   * dall'endpoint v8/finance/chart con events=dividends&range=1y.
   * Fallback: usa meta.trailingAnnualDividendRate se nessun evento trovato.
   */
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const shPort = ss.getSheetByName(SHEET_PORTAFOGLIO);
  const shDiv  = ss.getSheetByName(SHEET_DIVIDENDI);

  const portData = shPort.getDataRange().getValues();
  if (portData.length < 2) return;

  const rows = [];
  let successCount = 0;

  for (let i = 1; i < portData.length; i++) {
    const sym  = portData[i][0];
    const nome = portData[i][2];
    const val  = portData[i][3];
    if (!sym) continue;

    let divTTM   = 0;
    let prevClose = 0;
    let fonte     = "N/D";

    try {
      const url = "https://query1.finance.yahoo.com/v8/finance/chart/"
                + encodeURIComponent(String(sym))
                + "?interval=1mo&range=1y&events=dividends&includePrePost=false";
      const resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json"
        }
      });

      if (resp.getResponseCode() === 200) {
        const json   = JSON.parse(resp.getContentText());
        const result = (json && json.chart && json.chart.result && json.chart.result[0])
                       ? json.chart.result[0] : null;

        if (result) {
          // Metodo 1: somma eventi dividendi dall'history (più preciso)
          if (result.events && result.events.dividends) {
            const divEvents = Object.values(result.events.dividends);
            const total = divEvents.reduce(function(sum, d) {
              return sum + (d.amount || 0);
            }, 0);
            if (total > 0) {
              divTTM = Math.round(total * 10000) / 10000;
              fonte  = "YF-hist";
              successCount++;
              Logger.log(sym + ": dividendi da history = " + divTTM + " (" + divEvents.length + " pagamenti)");
            }
          }

          // Metodo 2 (fallback): trailingAnnualDividendRate dai metadati
          // Usato per ETF come DIVO, QDVO, IDVO che potrebbero non avere eventi storici
          if (divTTM === 0 && result.meta) {
            const rate = result.meta.trailingAnnualDividendRate;
            if (rate && rate > 0) {
              divTTM = Math.round(rate * 10000) / 10000;
              fonte  = "YF-meta";
              successCount++;
              Logger.log(sym + ": dividendi da meta = " + divTTM);
            }
          }

          if (divTTM === 0) {
            Logger.log(sym + ": nessun dividendo trovato (events=" +
              JSON.stringify(result.events ? Object.keys(result.events) : null) +
              ", meta.trailing=" + (result.meta ? result.meta.trailingAnnualDividendRate : "N/A") + ")");
          }

          // Estrai prev_close dalla stessa risposta Yahoo per calcolare lo yield
          // in modo indipendente dal prezzo già scritto in colonna H (che potrebbe
          // non essere ancora aggiornato al momento del fetch dividendi)
          if (result.meta) {
            const pc = result.meta.previousClose || result.meta.regularMarketPrice || 0;
            if (pc > 0) prevClose = pc;
          }
        }
      } else {
        Logger.log(sym + ": HTTP " + resp.getResponseCode());
      }
    } catch(e) {
      Logger.log(sym + ": errore - " + e);
    }

    // Yield su prev_close da Yahoo (stessa fonte usata da fetch_data.py)
    // Fallback: prezzo già in col H se la chiamata non ha restituito meta
    const prezzoPerYield = prevClose > 0 ? prevClose : (typeof portData[i][7] === "number" ? portData[i][7] : 0);
    const yieldTTM = (divTTM > 0 && prezzoPerYield > 0)
                     ? Math.round(divTTM / prezzoPerYield * 10000) / 100 : 0;

    rows.push([sym, nome, val, divTTM, yieldTTM, fonte, new Date()]);
    Utilities.sleep(200);
  }

  Logger.log("aggiornaDividendi: " + successCount + "/" + (portData.length - 1) + " ticker con dividendi trovati");

  const lastRow = shDiv.getLastRow();
  if (lastRow > 1) shDiv.getRange(2, 1, lastRow - 1, 7).clearContent();
  if (rows.length > 0) {
    shDiv.getRange(2, 1, rows.length, 7).setValues(rows);
    shDiv.getRange(2, 4, rows.length, 1).setNumberFormat("#,##0.0000");
    shDiv.getRange(2, 5, rows.length, 1).setNumberFormat("0.00");
  }
}


function aggiornaPrezziYahoo(ss) {
  /**
   * Recupera prezzi da Yahoo Finance per TUTTI i ticker del portafoglio.
   * Sovrascrive il valore GF solo se GF ha restituito vuoto/zero.
   * Usa Yahoo ticker (col A) per garantire compatibilità totale.
   */
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_PORTAFOGLIO);
  if (!sh) return;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  // Leggi tutto il foglio (colonne A=1 e H=8, I=9)
  const symData    = sh.getRange(2, 1, lastRow - 1, 1).getValues();   // Yahoo ticker
  const prezziData = sh.getRange(2, 8, lastRow - 1, 1).getValues();   // Prezzi attuali
  let fixed = 0;

  for (let i = 0; i < symData.length; i++) {
    const sym      = symData[i][0];
    const prezzoGF = prezziData[i][0];
    if (!sym) continue;

    // Salta solo se GF ha già un numero valido > 0
    const hasPrice = (typeof prezzoGF === "number" && prezzoGF > 0);
    if (hasPrice) continue;

    // Fetch da Yahoo Finance
    try {
      const url  = "https://query1.finance.yahoo.com/v8/finance/chart/"
                 + encodeURIComponent(String(sym))
                 + "?interval=1d&range=5d";
      const resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: {"User-Agent": "Mozilla/5.0"}
      });

      if (resp.getResponseCode() !== 200) {
        Logger.log("aggiornaPrezziYahoo: HTTP " + resp.getResponseCode() + " per " + sym);
        continue;
      }

      const json   = JSON.parse(resp.getContentText());
      const result = (json && json.chart && json.chart.result && json.chart.result[0])
                     ? json.chart.result[0] : null;
      if (!result) { Logger.log("aggiornaPrezziYahoo: nessun risultato per " + sym); continue; }

      const closes     = (result.indicators && result.indicators.quote && result.indicators.quote[0])
                         ? result.indicators.quote[0].close : null;
      const timestamps = result.timestamp || null;

      if (!closes || closes.length < 1) {
        Logger.log("aggiornaPrezziYahoo: nessuna chiusura per " + sym);
        continue;
      }

      // Prendi il penultimo valore non-null (previous close)
      let prevClose = null, prevTs = null;
      const startIdx = closes.length >= 2 ? closes.length - 2 : closes.length - 1;
      for (let j = startIdx; j >= 0; j--) {
        if (closes[j] !== null && closes[j] !== undefined && closes[j] > 0) {
          prevClose = closes[j];
          prevTs    = timestamps ? timestamps[j] : null;
          break;
        }
      }

      if (prevClose && prevClose > 0) {
        sh.getRange(i + 2, 8).setValue(Math.round(prevClose * 10000) / 10000);
        if (prevTs) {
          const closeDate = new Date(prevTs * 1000);
          sh.getRange(i + 2, 9).setValue(closeDate);
          sh.getRange(i + 2, 9).setNumberFormat("dd/mm/yyyy");
        }
        Logger.log("aggiornaPrezziYahoo: " + sym + " = " + prevClose);
        fixed++;
      }
    } catch(e) {
      Logger.log("aggiornaPrezziYahoo: errore per " + sym + ": " + e);
    }
    Utilities.sleep(200);
  }

  Logger.log("aggiornaPrezziYahoo completato: " + fixed + " prezzi aggiornati via Yahoo Finance");
}

function aggiornaColonneDividendi(ss) {
  /**
   * Copia i dividendi TTM dal foglio Dividendi → foglio Portafoglio
   * colonne P (Div TTM/az) e Q (Div TTM Totale).
   * Va chiamata DOPO aggiornaDividendi().
   */
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const shPort = ss.getSheetByName(SHEET_PORTAFOGLIO);
  const shDiv  = ss.getSheetByName(SHEET_DIVIDENDI);
  if (!shPort || !shDiv) return;

  // Leggi mappa dividendi: Yahoo ticker → divTTM
  const divData = shDiv.getDataRange().getValues();
  const divMap  = {};
  for (let i = 1; i < divData.length; i++) {
    const sym    = divData[i][0];
    const divTTM = divData[i][3];  // col D = Div TTM/az
    if (sym) divMap[sym] = (typeof divTTM === "number" ? divTTM : 0);
  }

  // Leggi portafoglio
  const portData = shPort.getDataRange().getValues();
  if (portData.length < 2) return;

  // Leggi tasso EUR/USD dal foglio Cambi
  const shCambi = ss.getSheetByName(SHEET_CAMBI);
  const tassoEURUSD = shCambi ? (shCambi.getRange("C2").getValue() || 1.08) : 1.08;
  const tassoGBPUSD = shCambi ? (shCambi.getRange("C4").getValue() || 1.27) : 1.27; // C4 = GBP/USD

  // FIX: accumula i valori e scrivi in batch (era cella-per-cella: ~186 operazioni API)
  const divRows = [];
  for (let i = 1; i < portData.length; i++) {
    const sym    = portData[i][0];   // Yahoo ticker (col A)
    const valuta = portData[i][3];   // Valuta (col D)
    const qty    = portData[i][4];   // Qty (col E)
    const prezzo = portData[i][7];   // Prezzo attuale (col H)
    if (!sym || !qty) { divRows.push([0, 0, 0]); continue; }

    const divTTM = divMap[sym] || 0;

    // Div TTM Totale in USD — FIX: aggiunta conversione GBP mancante
    let divTotUSD = divTTM * qty;
    if (valuta === "EUR")      divTotUSD = divTotUSD * tassoEURUSD;
    else if (valuta === "GBP") divTotUSD = divTotUSD * tassoGBPUSD;

    // Yield TTM % — FIX: salvato come decimale (0.045) coerente con la formula GOOGLEFINANCE
    // La colonna R è formattata come "0.00%" quindi 0.045 appare come "4.50%"
    const yieldTTM = (prezzo && typeof prezzo === "number" && prezzo > 0 && divTTM > 0)
                     ? divTTM / prezzo : 0;

    divRows.push([
      divTTM,
      Math.round(divTotUSD * 100) / 100,
      Math.round(yieldTTM * 10000) / 10000
    ]);
  }

  // Scrittura batch in una sola operazione (col P=16, Q=17, R=18)
  if (divRows.length > 0) {
    shPort.getRange(2, 16, divRows.length, 3).setValues(divRows);
  }

  // Formattazione
  const n = portData.length - 1;
  if (n > 0) {
    shPort.getRange(2, 16, n, 1).setNumberFormat("#,##0.0000");   // Div TTM/az
    shPort.getRange(2, 17, n, 1).setNumberFormat('"$"#,##0.00');  // Div TTM Totale
    // FIX: yield salvato come decimale (0.045) → formattare come percentuale
    shPort.getRange(2, 18, n, 1).setNumberFormat("0.00%");        // Yield TTM %
  }

  Logger.log("aggiornaColonneDividendi: completato per " + (portData.length-1) + " ticker");
}

// ── UTILITY: assicura che il filtro automatico sia presente sul foglio ────────

function ensurePortafoglioFilter(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_PORTAFOGLIO);
  if (!sh) return;
  // Se il filtro non esiste ancora, crealo sulla riga header
  if (!sh.getFilter()) {
    const lastCol = sh.getLastColumn() || 20;
    sh.getRange(1, 1, 1, lastCol).createFilter();
  }
}

function aggiornaDashboard(ss) {
  const shDash = ss.getSheetByName(SHEET_DASHBOARD);
  // La Dashboard usa formule che si aggiornano automaticamente
  // Questa funzione aggiorna solo il timestamp
  shDash.getRange("A2").setFormula('="Ultimo aggiornamento: "&TEXT(NOW(),"dd/mm/yyyy HH:mm")');
  SpreadsheetApp.flush();
}

// ── UTILITY ───────────────────────────────────────────────────────────────────

function formatHeader(sh, row, numCols) {
  const range = sh.getRange(row, 1, 1, numCols);
  range.setBackground(COLOR_HEADER)
       .setFontColor(COLOR_WHITE)
       .setFontWeight("bold")
       .setFontSize(10)
       .setVerticalAlignment("middle")
       .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.setRowHeight(row, 36);
}

function coloraVariazioni(sh, col, startRow, numRows) {
  const range = sh.getRange(startRow, col, numRows, 1);
  const rules = sh.getConditionalFormatRules();

  const rulePos = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0)
    .setFontColor(COLOR_GREEN)
    .setRanges([range])
    .build();

  const ruleNeg = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0)
    .setFontColor(COLOR_RED)
    .setRanges([range])
    .build();

  rules.push(rulePos, ruleNeg);
  sh.setConditionalFormatRules(rules);
}

// ── IMPORTA MAPPATURA DA CSV ─────────────────────────────────────────────────
/**
 * Aggiorna il foglio Mappatura incollando i dati dal CSV ticker_mapping.
 * I dati corretti sono già hardcodati qui sotto — aggiorna automaticamente
 * tutti i 62 ticker con i Google Finance ticker corretti.
 */
function importaCSVAcquisti() {
  /**
   * Importa il contenuto del CSV Acquisti senza che Google Sheets
   * interpreti i separatori decimali/migliaia.
   *
   * COME USARE:
   * 1. Apri il file PurchaseExport.csv con un editor di testo (Notepad, TextEdit)
   * 2. Seleziona tutto (Ctrl+A) e copia (Ctrl+C)
   * 3. Nel foglio "📥 Acquisti" clicca sulla cella A1
   * 4. Incolla come TESTO SEMPLICE: Edit → Paste Special → Paste values only
   *    OPPURE usa questo menu: Portfolio Tracker → 📂 Importa CSV Acquisti
   *    che mostra una finestra dove incollare il testo grezzo del CSV
   */
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Mostra dialog per incollare il CSV
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 12px; }
      textarea { width: 100%; height: 300px; font-family: monospace; font-size: 11px;
                 border: 1px solid #ccc; border-radius: 4px; padding: 6px; }
      .btn { background: #1a73e8; color: white; border: none; padding: 8px 20px;
             border-radius: 4px; cursor: pointer; font-size: 13px; margin-top: 8px; }
      .btn:hover { background: #1557b0; }
      p { color: #555; margin: 0 0 8px; }
    </style>
    <p>Incolla qui il contenuto del file <strong>PurchaseExport.csv</strong><br>
       (apri il file con Notepad/TextEdit, Ctrl+A, Ctrl+C, poi Ctrl+V qui sotto):</p>
    <textarea id="csv" placeholder="Incolla il contenuto del CSV qui..."></textarea>
    <br>
    <button class="btn" onclick="
      var csv = document.getElementById('csv').value;
      google.script.run
        .withSuccessHandler(function(msg){ alert(msg); google.script.host.close(); })
        .withFailureHandler(function(err){ alert('Errore: ' + err); })
        .processCSVAcquisti(csv);
    ">📥 Importa</button>
    <button style="margin-left:8px;padding:8px 16px;border:1px solid #ccc;border-radius:4px;cursor:pointer"
            onclick="google.script.host.close()">Annulla</button>
  `)
  .setWidth(600).setHeight(420)
  .setTitle("📂 Importa CSV Acquisti");

  ui.showModalDialog(html, "Importa CSV Acquisti");
}

function processCSVAcquisti(csvText) {
  /**
   * Processa il testo grezzo del CSV e scrive i dati nel foglio Acquisti
   * con il parsing corretto: punto=migliaia, virgola=decimale.
   */
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_ACQUISTI);
  if (!sh) return "Foglio Acquisti non trovato.";

  if (!csvText || !csvText.trim()) return "Nessun testo CSV fornito.";

  // Parse CSV rispettando le virgolette
  function parseCSVLine(line) {
    var result = [];
    var inQuote = false;
    var field = '';
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        result.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    result.push(field.trim());
    return result;
  }

  function parseQty(val) {
    val = String(val).trim().replace(/"/g, '');
    if (!val) return 0;
    // "4.709" → 4709 (punto=migliaia, 3 cifre dopo)
    if (val.includes('.') && !val.includes(',')) {
      var parts = val.split('.');
      if (parts.length === 2 && parts[1].length === 3) {
        return parseFloat(parts[0] + parts[1]) || 0;
      }
      return parseFloat(val) || 0;
    }
    // "4.709,5" → 4709.5
    if (val.includes('.') && val.includes(',')) {
      return parseFloat(val.replace(/\./g,'').replace(',','.')) || 0;
    }
    return parseFloat(val) || 0;
  }

  function parsePrice(val) {
    val = String(val).trim().replace(/"/g, '');
    if (!val) return 0;
    // "23,19" → 23.19 (virgola=decimale)
    if (val.includes(',') && !val.includes('.')) {
      return parseFloat(val.replace(',', '.')) || 0;
    }
    // "1.234,56" → 1234.56
    if (val.includes(',') && val.includes('.')) {
      return parseFloat(val.replace(/\./g,'').replace(',','.')) || 0;
    }
    return parseFloat(val) || 0;
  }

  var lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return "CSV vuoto o con solo intestazione.";

  var headers = parseCSVLine(lines[0]).map(function(h){ return h.replace(/"/g,'').trim(); });

  // Trova indici colonne
  function findIdx(names) {
    for (var i = 0; i < names.length; i++) {
      var idx = headers.indexOf(names[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  var idxSym    = findIdx(['Simbolo','Symbol','Yahoo Ticker']);
  var idxNome   = findIdx(['Nome','Name']);
  var idxQty    = findIdx(['Qtá','Qta','Qty','Quantità','Quantity']);
  var idxVal    = findIdx(['Valuta','Currency']);
  var idxPrezzo = findIdx(['Prezzo','Price','Prezzo Acquisto']);
  var idxData   = findIdx(['Data','Date']);
  var idxExch   = findIdx(['Exchange','Borsa']);
  var idxBroker = findIdx(['Broker']);

  if (idxSym < 0) return "Colonna Simbolo non trovata. Headers: " + headers.join(", ");

  // Header output foglio
  var outHeaders = ["Yahoo Ticker","Nome","Quantità","Valuta","Prezzo Acquisto","Data","Broker","Note"];
  var outRows = [outHeaders];

  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var cols = parseCSVLine(line);

    var sym    = idxSym    >= 0 ? cols[idxSym].replace(/"/g,'').trim()    : '';
    if (!sym) continue;
    var nome   = idxNome   >= 0 ? cols[idxNome].replace(/"/g,'').trim()   : '';
    var qty    = idxQty    >= 0 ? parseQty(cols[idxQty])                  : 0;
    var val    = idxVal    >= 0 ? cols[idxVal].replace(/"/g,'').trim().toUpperCase() : 'USD';
    var prezzo = idxPrezzo >= 0 ? parsePrice(cols[idxPrezzo])             : 0;
    var data   = idxData   >= 0 ? cols[idxData].replace(/"/g,'').trim()   : '';
    var broker = idxBroker >= 0 ? cols[idxBroker].replace(/"/g,'').trim() : '';

    outRows.push([sym, nome, qty, val, prezzo, data, broker, '']);
  }

  if (outRows.length < 2) return "Nessuna riga valida trovata nel CSV.";

  // Scrivi nel foglio Acquisti
  sh.clearContents();
  sh.getRange(1, 1, outRows.length, outHeaders.length).setValues(outRows);

  // Formatta header
  formatHeader(sh, 1, outHeaders.length);
  sh.setFrozenRows(1);

  // Formatta colonne numeriche
  var n = outRows.length - 1;
  sh.getRange(2, 3, n, 1).setNumberFormat("#,##0.0000");  // Quantità
  sh.getRange(2, 5, n, 1).setNumberFormat("#,##0.0000");  // Prezzo

  Logger.log("processCSVAcquisti: " + n + " righe importate correttamente");
  return "✅ " + n + " righe importate correttamente nel foglio Acquisti!\nOra esegui 🔄 Aggiorna tutto.";
}

function pulisciAcquisti() {
  /**
   * Normalizza i valori numerici nel foglio Acquisti dopo un import CSV.
   * Converte:
   *   Quantità:  "4.709"  → 4709   (punto = migliaia)
   *             "4.709,5" → 4709.5
   *   Prezzo:   "23,19"  → 23.19  (virgola = decimale)
   *             "1.234,56"→ 1234.56
   * Da eseguire subito dopo aver importato il CSV nel foglio Acquisti.
   */
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const sh  = ss.getSheetByName(SHEET_ACQUISTI);
  if (!sh) { SpreadsheetApp.getUi().alert("Foglio Acquisti non trovato."); return; }

  const data    = sh.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h).trim(); });

  const idxQty    = ["Quantità","Qtá","Qta","Qty"].reduce(function(a,h){return a>=0?a:headers.indexOf(h);},-1);
  const idxPrezzo = ["Prezzo Acquisto","Prezzo","Price"].reduce(function(a,h){return a>=0?a:headers.indexOf(h);},-1);

  if (idxQty < 0 && idxPrezzo < 0) {
    SpreadsheetApp.getUi().alert("Colonne Quantità e Prezzo non trovate. Verifica gli header del foglio.");
    return;
  }

  function toNum(val, isMigliaia) {
    if (typeof val === "number") return val;
    var s = String(val).trim().replace(/\s/g, "");
    if (!s) return 0;
    // Formato con entrambi: "1.234,56" oppure "1,234.56"
    if (s.includes(".") && s.includes(",")) {
      var dotPos   = s.lastIndexOf(".");
      var commaPos = s.lastIndexOf(",");
      if (commaPos > dotPos) {
        // virgola è decimale: "1.234,56"
        return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
      } else {
        // punto è decimale: "1,234.56"
        return parseFloat(s.replace(/,/g, "")) || 0;
      }
    }
    if (s.includes(",") && !s.includes(".")) {
      // Solo virgola: potrebbe essere decimale "23,19" o migliaia "4,709"
      var parts = s.split(",");
      if (parts.length === 2 && parts[1].length === 3) {
        // migliaia: "4,709" → 4709
        return parseFloat(parts[0] + parts[1]) || 0;
      }
      // decimale: "23,19" → 23.19
      return parseFloat(s.replace(",", ".")) || 0;
    }
    if (s.includes(".") && !s.includes(",")) {
      var parts2 = s.split(".");
      if (isMigliaia && parts2.length === 2 && parts2[1].length === 3) {
        // migliaia: "4.709" → 4709
        return parseFloat(parts2[0] + parts2[1]) || 0;
      }
      // decimale: "23.19" → 23.19
      return parseFloat(s) || 0;
    }
    return parseFloat(s) || 0;
  }

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var changed = false;
    if (idxQty >= 0) {
      var qtyVal = row[idxQty];
      if (typeof qtyVal !== "number" || String(qtyVal).includes(",")) {
        var newQty = toNum(qtyVal, true);  // punto = migliaia per le quantità
        if (newQty !== qtyVal) {
          sh.getRange(i + 1, idxQty + 1).setValue(newQty);
          changed = true;
        }
      }
    }
    if (idxPrezzo >= 0) {
      var prezVal = row[idxPrezzo];
      if (typeof prezVal !== "number" || String(prezVal).includes(",")) {
        var newPrez = toNum(prezVal, false);  // virgola = decimale per i prezzi
        if (newPrez !== prezVal) {
          sh.getRange(i + 1, idxPrezzo + 1).setValue(newPrez);
          changed = true;
        }
      }
    }
    if (changed) count++;
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    count + " righe normalizzate. Ora esegui Aggiorna tutto.",
    "🧹 Normalizzazione completata", 5
  );
  Logger.log("pulisciAcquisti: " + count + " righe aggiornate");
}

function importaMappatura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_MAPPATURA);
  if (!sh) {
    sh = ss.insertSheet(SHEET_MAPPATURA);
  }
  sh.clearContents();

  const headers = ["Yahoo Ticker","Google Ticker","Nome","Borsa Yahoo","Borsa Google","Valuta","Note"];
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  formatHeader(sh, 1, headers.length);

  const mappatura = [
    ["ABBV","NYSE:ABBV","AbbVie","NYSE","NYSE","USD",""],
    ["MO","NYSE:MO","Altria Group","NYSE","NYSE","USD",""],
    ["AAPL","NASDAQ:AAPL","Apple","NASDAQ","NASDAQ","USD",""],
    ["BTI","NYSE:BTI","British American Tobacco","NYSE","NYSE","USD","ADR su NYSE"],
    ["CP","NYSE:CP","Canadian Pacific Kansas City","NYSE","NYSE","USD",""],
    ["CVX","NYSE:CVX","Chevron","NYSE","NYSE","USD",""],
    ["XOM","NYSE:XOM","ExxonMobil","NYSE","NYSE","USD",""],
    ["INTU","NASDAQ:INTU","Intuit","NASDAQ","NASDAQ","USD",""],
    ["JNJ","NYSE:JNJ","Johnson & Johnson","NYSE","NYSE","USD",""],
    ["PBA","NYSE:PBA","Pembina Pipeline","NYSE","NYSE","USD","ADR su NYSE"],
    ["O","NYSE:O","Realty Income","NYSE","NYSE","USD",""],
    ["SU","NYSE:SU","Suncor Energy","NYSE","NYSE","USD",""],
    ["BNS","NYSE:BNS","Bank of Nova Scotia","NYSE","NYSE","USD","ADR su NYSE"],
    ["TD","NYSE:TD","Toronto-Dominion Bank","NYSE","NYSE","USD","ADR su NYSE"],
    ["UNP","NYSE:UNP","Union Pacific","NYSE","NYSE","USD",""],
    ["VICI","NYSE:VICI","VICI Properties","NYSE","NYSE","USD",""],
    ["DIVO","NYSEARCA:DIVO","Amplify CWP Enhanced Dividend Income ETF","NYSEARCA","NYSEARCA","USD",""],
    ["QDVO","NYSEARCA:QDVO","Amplify Dividend & Income ETF","NYSEARCA","NYSEARCA","USD",""],
    ["IDVO","NYSEARCA:IDVO","Amplify International Dividend Income ETF","NYSEARCA","NYSEARCA","USD",""],
    ["SPHD","NYSEARCA:SPHD","Invesco S&P500 High Div Low Vol ETF","NYSEARCA","NYSEARCA","USD",""],
    ["SCHD","NYSEARCA:SCHD","Schwab US Dividend Equity ETF","NYSEARCA","NYSEARCA","USD",""],
    ["SCHY","NYSEARCA:SCHY","Schwab International Dividend Equity ETF","NYSEARCA","NYSEARCA","USD",""],
    ["VYM","NYSEARCA:VYM","Vanguard High Dividend Yield ETF","NYSEARCA","NYSEARCA","USD",""],
    ["VWRD.L","LON:VWRD","Vanguard FTSE All-World UCITS ETF USD Dist","LSE","LON","USD",""],
    ["HPRD.L","LON:HPRD","HSBC FTSE EPRA/NAREIT Developed UCITS ETF","LSE","LON","USD",""],
    ["EWSX.L","LON:EWSX","iShares STOXX Europe Select Dividend 30 UCITS ETF","LSE","LON","USD",""],
    ["FGQP.L","LON:FGQP","Franklin Global Quality Dividend UCITS ETF GBP Hdg","LSE","LON","USD","Verificare disponibilità"],
    ["G.MI","BIT:G","Generali","Borsa Italiana","BIT","EUR",""],
    ["ENI.MI","BIT:ENI","Eni","Borsa Italiana","BIT","EUR",""],
    ["ISP.MI","BIT:ISP","Intesa Sanpaolo","Borsa Italiana","BIT","EUR",""],
    ["UCG.MI","BIT:UCG","UniCredit","Borsa Italiana","BIT","EUR",""],
    ["SRG.MI","BIT:SRG","Snam Rete Gas","Borsa Italiana","BIT","EUR",""],
    ["ZV.MI","BIT:ZV","Zignago Vetro","Borsa Italiana","BIT","EUR",""],
    ["IUKD.MI","MIL:IUKD","iShares UK Dividend UCITS ETF","Borsa Italiana","MIL","EUR",""],
    ["BAYN.DE","ETR:BAYN","Bayer","XETRA","ETR","EUR",""],
    ["BSN.DE","ETR:BSN","Danone (XETRA)","XETRA","ETR","EUR","Alt: EPA:BN se non funziona"],
    ["VNA.DE","ETR:VNA","Vonovia","XETRA","ETR","EUR",""],
    ["FUSD.DE","FRA:FUSD","Franklin FTSE USA UCITS ETF","XETRA","FRA","EUR",""],
    ["FLXD.DE","FRA:FLXD","Franklin European Quality Dividend UCITS ETF","XETRA","FRA","EUR",""],
    ["EHDL.DE","FRA:EHDL","iShares EM Dividend UCITS ETF","XETRA","FRA","EUR",""],
    ["EUNL.DE","FRA:EUNL","iShares Core MSCI World UCITS ETF","XETRA","FRA","EUR",""],
    ["IQQ6.DE","FRA:IQQ6","iShares Developed Mkts Property Yield UCITS ETF","XETRA","FRA","EUR",""],
    ["IQQA.DE","FRA:IQQA","iShares Core MSCI USA UCITS ETF","XETRA","FRA","EUR",""],
    ["IQQP.DE","FRA:IQQP","iShares Core MSCI Europe UCITS ETF","XETRA","FRA","EUR",""],
    ["QDVW.DE","FRA:QDVW","WisdomTree Global Quality Dividend Growth UCITS ETF","XETRA","FRA","EUR",""],
    ["EXSA.DE","FRA:EXSA","iShares Core STOXX Europe 600 UCITS ETF","XETRA","FRA","EUR",""],
    ["EXSH.DE","FRA:EXSH","iShares STOXX Europe Select Dividend 30 UCITS ETF","XETRA","FRA","EUR",""],
    ["ISPA.DE","FRA:ISPA","iShares MSCI Europe High Dividend Yield UCITS ETF","XETRA","FRA","EUR",""],
    ["SPYW.DE","FRA:SPYW","SPDR S&P Euro Dividend Aristocrats UCITS ETF","XETRA","FRA","EUR",""],
    ["ZPRG.DE","ETR:ZPRG","SPDR S&P Global Dividend Aristocrats UCITS ETF","XETRA","ETR","EUR",""],
    ["SPYD.DE","FRA:SPYD","SPDR S&P US Dividend Aristocrats UCITS ETF","XETRA","FRA","EUR",""],
    ["JGPI.DE","FRA:JGPI","JPM Global Equity Premium Income Active UCITS ETF","XETRA","FRA","EUR",""],
    ["JEQP.DE","FRA:JEQP","JPM Nasdaq Equity Premium Income Active UCITS ETF","XETRA","FRA","EUR",""],
    ["FGEQ.DE","FRA:FGEQ","Franklin Global Quality Dividend UCITS ETF","XETRA","FRA","EUR",""],
    ["VGWL.DE","FRA:VGWL","Vanguard FTSE All-World UCITS ETF USD Acc","XETRA","FRA","EUR",""],
    ["VGEU.DE","FRA:VGEU","Vanguard FTSE Developed Europe UCITS ETF","XETRA","FRA","EUR",""],
    ["KPR.F","FRA:KPR","Klépierre","Frankfurt","FRA","EUR",""],
    ["SAN.PA","EPA:SAN","Santander","Euronext Paris","EPA","EUR",""],
    ["IMAE.AS","AMS:IMAE","iShares Core MSCI Europe UCITS ETF","Euronext Amsterdam","AMS","EUR",""],
    ["UNA.AS","AMS:UNA","Unilever","Euronext Amsterdam","AMS","EUR",""],
    ["TDIV.AS","AMS:TDIV","VanEck Morningstar Dev Markets Div Leaders ETF","Euronext Amsterdam","AMS","EUR",""],
    ["VHYL.AS","AMS:VHYL","Vanguard FTSE All-World High Dividend Yield UCITS ETF","Euronext Amsterdam","AMS","EUR",""],
  ];

  sh.getRange(2, 1, mappatura.length, headers.length).setValues(mappatura);
  [100,130,220,100,100,70,180].forEach((w,i) => sh.setColumnWidth(i+1, w));
  sh.setFrozenRows(1);

  // Evidenzia in giallo le righe con "Verificare disponibilità"
  for (let i = 0; i < mappatura.length; i++) {
    if (mappatura[i][6] && mappatura[i][6].includes("Verificare")) {
      sh.getRange(i+2, 1, 1, headers.length)
        .setBackground("#FFF9C4");
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    mappatura.length + " ticker importati correttamente nel foglio Mappatura.",
    "🗺️ Mappatura aggiornata", 5
  );
}

// ── ON OPEN (aggiunge menu automaticamente) ───────────────────────────────────

function diagnosticaPrezzi() {
  /**
   * Mostra un riepilogo dei ticker senza prezzo nel foglio Portafoglio.
   * Utile per verificare quali posizioni non sono valorizzate nel totale.
   */
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_PORTAFOGLIO);
  if (!sh) { SpreadsheetApp.getUi().alert("Foglio Portafoglio non trovato."); return; }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert("Nessun dato nel foglio Portafoglio."); return; }

  // Leggi Yahoo ticker (A), Google ticker (B), prezzo (H=8), valore USD (L=12)
  const data = sh.getRange(2, 1, lastRow - 1, 12).getValues();

  const mancanti = [];
  const presenti = [];
  let totalePresente = 0;

  data.forEach(function(row) {
    const yahooTk = row[0];
    const googleTk = row[1];
    const prezzo   = row[7];   // col H
    const valUSD   = row[11];  // col L
    if (!yahooTk) return;

    const hasPrice = typeof prezzo === "number" && prezzo > 0;
    if (hasPrice) {
      presenti.push(yahooTk);
      if (typeof valUSD === "number") totalePresente += valUSD;
    } else {
      mancanti.push(yahooTk + " (GF: " + googleTk + ")");
    }
  });

  let msg = "✅ Ticker valorizzati: " + presenti.length + "\n";
  msg    += "💰 Valore totale valorizzato: $" + Math.round(totalePresente).toLocaleString() + "\n\n";

  if (mancanti.length > 0) {
    msg += "❌ Ticker SENZA prezzo (" + mancanti.length + "):\n";
    msg += mancanti.join("\n");
    msg += "\n\nSuggerimento: esegui 'Aggiorna tutto' oppure verifica il ticker Yahoo Finance nel foglio Acquisti.";
  } else {
    msg += "✅ Tutti i ticker sono valorizzati!";
  }

  SpreadsheetApp.getUi().alert("🔍 Diagnostica prezzi", msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function testDividendi() {
  /**
   * Funzione di test — eseguila manualmente da Apps Script per vedere
   * esattamente cosa restituisce Yahoo Finance per ABBV.
   * Vai su Extensions → Apps Script → seleziona testDividendi → ▶ Esegui
   * Poi controlla il log (View → Logs)
   */
  const sym = "ABBV";

  // Test endpoint 1: v8/finance/chart con range 1y per includere dividendi
  Logger.log("=== TEST 1: v8 chart 1y ===");
  try {
    const url1 = "https://query1.finance.yahoo.com/v8/finance/chart/" + sym
               + "?interval=3mo&range=1y&events=dividends";
    const r1 = UrlFetchApp.fetch(url1, {muteHttpExceptions:true,
      headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
    Logger.log("Status: " + r1.getResponseCode());
    if (r1.getResponseCode() === 200) {
      const j1  = JSON.parse(r1.getContentText());
      const res = j1.chart.result[0];
      Logger.log("meta.regularMarketPrice: " + res.meta.regularMarketPrice);
      const evts = res.events;
      Logger.log("events: " + JSON.stringify(evts ? Object.keys(evts) : null));
      if (evts && evts.dividends) {
        const divs = Object.values(evts.dividends);
        const total = divs.reduce(function(s,d){return s+d.amount;}, 0);
        Logger.log("Dividendi TTM dalla history: " + total + " (" + divs.length + " pagamenti)");
      }
    }
  } catch(e) { Logger.log("ERR1: " + e); }

  // Test endpoint 2: finance.yahoo.com scrape del campo trailingAnnualDividendRate
  Logger.log("=== TEST 2: quoteSummary v10 ===");
  try {
    const url2 = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/" + sym
               + "?modules=summaryDetail";
    const r2 = UrlFetchApp.fetch(url2, {muteHttpExceptions:true,
      headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
    Logger.log("Status: " + r2.getResponseCode());
    if (r2.getResponseCode() === 200) {
      const j2  = JSON.parse(r2.getContentText());
      const sd  = j2.quoteSummary.result[0].summaryDetail;
      Logger.log("trailingAnnualDividendRate: " + JSON.stringify(sd.trailingAnnualDividendRate));
      Logger.log("dividendRate: " + JSON.stringify(sd.dividendRate));
    }
  } catch(e) { Logger.log("ERR2: " + e); }
}

function diagnosticaDividendi() {
  /**
   * Confronta i dividendi nel foglio Dividendi con quelli attesi.
   * Mostra i ticker con dividendi = 0 che potrebbero causare discrepanze.
   */
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const shDiv = ss.getSheetByName(SHEET_DIVIDENDI);
  if (!shDiv) { SpreadsheetApp.getUi().alert("Foglio Dividendi non trovato."); return; }

  const data = shDiv.getDataRange().getValues();
  if (data.length < 2) { SpreadsheetApp.getUi().alert("Foglio Dividendi vuoto."); return; }

  const zeroDivRows = [];
  let totalDiv = 0;
  let countOk  = 0;

  for (let i = 1; i < data.length; i++) {
    const sym    = data[i][0];
    const nome   = data[i][1];
    const divTTM = data[i][3];
    const fonte  = data[i][5];
    if (!sym) continue;

    const div = typeof divTTM === "number" ? divTTM : 0;
    if (div === 0) {
      zeroDivRows.push(sym + " (" + nome + ")");
    } else {
      totalDiv += div;
      countOk++;
    }
  }

  let msg = "📊 DIAGNOSTICA DIVIDENDI\n\n";
  msg += "✅ Ticker con dividendi: " + countOk + "\n";
  msg += "❌ Ticker con dividendo = 0: " + zeroDivRows.length + "\n\n";

  if (zeroDivRows.length > 0) {
    msg += "Ticker senza dividendi:\n";
    msg += zeroDivRows.join("\n");
    msg += "\n\nSuggerimento: esegui 💰 Aggiorna dividendi e controlla il log\n";
    msg += "di Apps Script (Extensions → Apps Script → Execution log)";
  } else {
    msg += "✅ Tutti i ticker hanno dividendi valorizzati!";
  }

  SpreadsheetApp.getUi().alert("🔍 Diagnostica dividendi", msg,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function onOpen() {
  creaMenu();
}
