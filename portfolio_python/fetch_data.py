"""
fetch_data.py  —  scarica prezzi e dividendi TTM da Yahoo Finance
Legge il portafoglio da un file CSV oppure da un database MariaDB/MySQL.

Formato CSV atteso:
    Simbolo,Qtá,Valuta
    ABBV,15,USD
    FGEQ.DE,1.802,EUR    ← il punto è separatore delle MIGLIAIA, non dei decimali

Utilizzo:
    # Sorgente CSV (comportamento originale)
    python fetch_data.py                         # legge portfolio.csv
    python fetch_data.py mio_file.csv            # legge un file specifico

    # Sorgente MariaDB/MySQL (database ofbiz)
    python fetch_data.py --db --user UTENTE --password PASSWORD
    python fetch_data.py --db --user UTENTE --password PASSWORD --host 127.0.0.1 --port 3306

Requisiti:
    pip install yfinance
    pip install mysql-connector-python   # solo per --db

Output: data/portfolio_data.json
"""

import yfinance as yf
import json
import os
import sys
import csv
import argparse
from datetime import date, timedelta


# ── Esposizione geografica ───────────────────────────────────────────────────

GEO_FILE = "geo.json"

# Mappa paesi JustETF → chiavi area
JUSTETF_COUNTRY_MAP = {
    "United States": "NA", "Canada": "NA", "Mexico": "NA",
    "United Kingdom": "EU", "Germany": "EU", "France": "EU",
    "Italy": "EU", "Spain": "EU", "Netherlands": "EU",
    "Switzerland": "EU", "Sweden": "EU", "Denmark": "EU",
    "Norway": "EU", "Finland": "EU", "Belgium": "EU",
    "Austria": "EU", "Portugal": "EU", "Ireland": "EU",
    "Luxembourg": "EU", "Poland": "EU", "Greece": "EU",
    "Japan": "AP", "Australia": "AP", "South Korea": "AP",
    "Hong Kong": "AP", "Singapore": "AP", "New Zealand": "AP",
    "China": "EM", "India": "EM", "Brazil": "EM",
    "Taiwan": "EM", "South Africa": "EM", "Russia": "EM",
    "Saudi Arabia": "EM", "Indonesia": "EM", "Thailand": "EM",
    "Malaysia": "EM", "Turkey": "EM", "Mexico": "EM",
}


def load_geo_file() -> dict:
    """Carica geo.json. Ritorna struttura vuota se il file non esiste."""
    if os.path.exists(GEO_FILE):
        with open(GEO_FILE) as f:
            return json.load(f)
    return {"tickers": {}, "_isin_geo": {}, "_country_map": {}}


def save_geo_file(geo: dict):
    with open(GEO_FILE, "w") as f:
        json.dump(geo, f, indent=2, ensure_ascii=False)


def fetch_geo_from_justetf(isin: str, country_map: dict) -> dict | None:
    """
    Recupera l'allocazione geografica di un ETF da JustETF tramite la loro
    API interna (non documentata ma stabile).
    Ritorna un dict tipo {"NA": 63, "EU": 22, ...} o None se fallisce.
    """
    import urllib.request
    url = (
        f"https://www.justetf.com/api/etfs/{isin}/countries"
        f"?locale=en&valuesType=MARKET_VALUE&unitType=PERCENTAGE"
    )
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Referer": f"https://www.justetf.com/en/etf-profile.html?isin={isin}",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        # struttura: {"countries": [{"label": "United States", "value": 62.5}, ...]}
        countries = data.get("countries") or data.get("list") or []
        if not countries:
            return None
        # aggrega per area geografica
        area_totals: dict = {}
        for item in countries:
            label = item.get("label", "")
            val   = float(item.get("value", 0))
            area  = country_map.get(label, "GL")
            area_totals[area] = area_totals.get(area, 0) + val
        # arrotonda e normalizza a 100
        total = sum(area_totals.values())
        if total == 0:
            return None
        result = {k: round(v / total * 100, 1) for k, v in area_totals.items() if v > 0.5}
        return result
    except Exception as e:
        print(f"      [JustETF] fetch fallito per {isin}: {e}")
        return None


def get_geo_for_ticker(sym: str, isin: str | None, is_etf: bool,
                       yf_country: str | None,
                       geo: dict) -> dict:
    """
    Restituisce l'esposizione geografica per un ticker, con questa priorità:
    1. geo.json["tickers"][sym]        → override manuale (massima priorità)
    2. geo.json["_isin_geo"][isin]     → ISIN noto nel file locale
    3. JustETF API (solo ETF con ISIN) → fetch live, salvato in geo.json
    4. yfinance country (titoli singoli) → mappa paese → area
    5. Fallback: {"GL": 100}
    """
    tickers   = geo.get("tickers", {})
    isin_geo  = geo.get("_isin_geo", {})
    c_map     = geo.get("_country_map", JUSTETF_COUNTRY_MAP)

    # 1. override manuale
    if sym in tickers:
        return tickers[sym]

    # 2. ISIN noto in geo.json
    if isin and isin in isin_geo:
        result = isin_geo[isin]
        tickers[sym] = result          # cache per il ticker
        return result

    # 3. JustETF live (solo ETF con ISIN europeo — ISIN inizia con IE, LU, DE, FR...)
    if is_etf and isin:
        print(f"      → ETF non in cache, fetch JustETF ({isin})...", end="", flush=True)
        result = fetch_geo_from_justetf(isin, c_map)
        if result:
            print(f" OK {result}")
            isin_geo[isin] = result
            tickers[sym]   = result
            return result
        else:
            print(" fallito, uso fallback")

    # 4. Titolo singolo: usa il paese da yfinance
    if yf_country and yf_country in c_map:
        area   = c_map[yf_country]
        result = {area: 100}
        tickers[sym] = result
        return result

    # 5. Fallback globale
    result = {"GL": 100}
    tickers[sym] = result
    return result


def parse_qty(raw: str) -> float:
    """
    Converte la quantità dal formato italiano (punto = migliaia) a float.
    Esempi:
        "1.802"  → 1802.0
        "4.024"  → 4024.0
        "15"     → 15.0
    """
    raw = raw.strip().strip('"')
    if '.' in raw:
        parts = raw.split('.')
        if len(parts) == 2 and len(parts[1]) == 3:
            return float(parts[0] + parts[1])
        else:
            return float(raw)
    return float(raw) if raw else 0.0


def normalize_header(h) -> str:
    """Normalizza un header CSV rimuovendo spazi, accenti comuni e BOM.
    Gestisce None (colonne vuote alla fine del CSV) restituendo stringa vuota."""
    if h is None:
        return ""
    return str(h).strip().replace("\ufeff", "").replace("\xa0", " ").strip('"')


def parse_price(raw: str) -> float:
    """
    Converte un prezzo dal formato italiano a float.
    La VIRGOLA è il separatore decimale, il PUNTO è il separatore delle migliaia.
    Esempi:
        "23,19"    → 23.19
        "27,5198"  → 27.5198
        "1.234,56" → 1234.56
        "171,74"   → 171.74
    """
    raw = raw.strip().strip('"')
    if not raw:
        return 0.0
    # rimuovi separatore migliaia (punto) poi converti virgola in punto decimale
    raw = raw.replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def load_portfolio(csv_path: str) -> list:
    """
    Legge il CSV di acquisti ed estrae le colonne rilevanti.

    Formato atteso (colonne extra come Prod Id, Purch Id, Nome, Data, Exchange
    vengono ignorate automaticamente):
        "Prod Id","Purch Id","Simbolo","Nome","Qtá","Valuta","Prezzo","Data","Exchange","Broker"

    Regole di parsing:
      - Quantità : punto = separatore migliaia  (es. "4.709" → 4709)
      - Prezzo   : virgola = separatore decimale (es. "23,19" → 23.19)
      - Campi tra virgolette opzionali
    """
    rows = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        # normalizza gli header rimuovendo virgolette, spazi e BOM
        reader.fieldnames = [normalize_header(h) for h in reader.fieldnames]
        for row in reader:
            # normalizza anche le chiavi del singolo row (per sicurezza)
            row = {normalize_header(k): (v.strip().strip('"') if v else "")
                   for k, v in row.items()}

            sym = (row.get("Simbolo") or row.get("Symbol") or "").strip()
            if not sym:
                continue

            qty_raw   = (row.get("Qtá") or row.get("Qta") or row.get("Qty")
                         or row.get("Quantity") or "0")
            cur       = (row.get("Valuta") or row.get("Currency") or "USD").upper()
            price_raw = (row.get("Prezzo") or row.get("Price") or "0")
            broker    = (row.get("Broker") or "").strip()

            qty   = parse_qty(qty_raw)
            price = parse_price(price_raw)

            rows.append({
                "symbol":    sym,
                "currency":  cur,
                "qty":       qty,
                "buy_price": price,
                "broker":    broker,
            })
    return rows


def load_portfolio_from_db(host: str, port: int, user: str, password: str) -> list:
    """
    Legge acquisti da MariaDB/MySQL (database: ofbiz).

    Join tra BFIN_PURCHASE e BFIN_PRODUCT:
      - PROD_SYM  → simbolo ticker (prende il primo se separati da ';')
      - QUANTITY  → quantità acquistata
      - PRICE     → prezzo di acquisto
      - CURRENCY_UOM_ID → valuta
      - BROKER_ID → broker
    Esclude i prodotti con SKIP_API = 'Y' (non tracciati via API).
    """
    try:
        import mysql.connector
    except ImportError:
        print("ERRORE: modulo 'mysql-connector-python' non installato.")
        print("  Installa con: pip install mysql-connector-python")
        sys.exit(1)

    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database="ofbiz",
            charset="utf8mb4",
        )
    except mysql.connector.Error as e:
        print(f"ERRORE connessione al database: {e}")
        sys.exit(1)

    query = """
        SELECT
            p.PROD_SYM,
            pu.QUANTITY,
            pu.PRICE,
            pu.CURRENCY_UOM_ID,
            pu.BROKER_ID
        FROM BFIN_PURCHASE pu
        JOIN BFIN_PRODUCT p ON pu.PROD_ID = p.PROD_ID
        WHERE (p.SKIP_API IS NULL OR p.SKIP_API <> 'Y')
          AND pu.QUANTITY IS NOT NULL
          AND pu.PRICE    IS NOT NULL
        ORDER BY p.PROD_SYM, pu.PURCH_DATE
    """

    cursor = conn.cursor()
    cursor.execute(query)
    rows = []
    for (prod_sym, quantity, price, currency, broker_id) in cursor:
        # PROD_SYM può contenere più simboli separati da ';': prendi il primo
        sym = prod_sym.split(";")[0].strip() if prod_sym else ""
        if not sym:
            continue
        rows.append({
            "symbol":    sym,
            "currency":  (currency or "USD").upper(),
            "qty":       float(quantity),
            "buy_price": float(price),
            "broker":    (broker_id or "").strip(),
        })

    cursor.close()
    conn.close()
    return rows


def aggregate_portfolio(rows: list) -> list:
    """
    Aggrega le righe grezze per ticker:
      - qty       = somma delle quantità
      - avg_price = media ponderata dei prezzi di acquisto (VWAP)
      - brokers   = stringa "BROKER1 (qty1), BROKER2 (qty2)" con quantità per broker
      - currency  = valuta del primo record (assumiamo consistenza per ticker)
    """
    from collections import OrderedDict
    agg = OrderedDict()
    for r in rows:
        sym = r["symbol"]
        if sym not in agg:
            agg[sym] = {
                "symbol":      sym,
                "currency":    r["currency"],
                "qty":         0.0,
                "cost":        0.0,
                "broker_qty":  OrderedDict(),  # broker -> qty totale presso quel broker
            }
        agg[sym]["qty"]  += r["qty"]
        agg[sym]["cost"] += r["qty"] * r["buy_price"]
        broker = r["broker"] or "N/D"
        agg[sym]["broker_qty"][broker] = agg[sym]["broker_qty"].get(broker, 0.0) + r["qty"]

    result = []
    for sym, d in agg.items():
        avg_price = round(d["cost"] / d["qty"], 4) if d["qty"] > 0 else 0.0
        # Formatta "BROKER (qty)" per ogni broker, es. "KBC (300), TR212 (400)"
        brokers_str = ", ".join(
            f"{b} ({round(q, 4):g})"
            for b, q in d["broker_qty"].items()
        )
        result.append({
            "symbol":    sym,
            "currency":  d["currency"],
            "qty":       round(d["qty"], 4),
            "avg_price": avg_price,
            "brokers":   brokers_str,
            # dizionario broker→qty per filtro per broker nel report
            "broker_qty": {b: round(q, 4) for b, q in d["broker_qty"].items()},
        })
    return result


def fetch_eur_usd() -> float:
    try:
        t = yf.Ticker("EURUSD=X")
        rate = t.info.get("regularMarketPreviousClose")
        if rate and 0.5 < rate < 2.0:
            return round(float(rate), 4)
    except Exception:
        pass
    return 1.08


def fetch_gbp_usd() -> float:
    try:
        t = yf.Ticker("GBPUSD=X")
        rate = t.info.get("regularMarketPreviousClose")
        if rate and 0.5 < rate < 2.5:
            return round(float(rate), 4)
    except Exception:
        pass
    return 1.27

def fetch_ticker_data(sym: str) -> dict:
    """
    Recupera prezzi e dividendi tramite history() — più affidabile di info{}
    per il prezzo di chiusura precedente.

    Logica prezzi:
      - Fonte primaria: info["previousClose"] → corrisponde esattamente al
        "Previous Close" di Yahoo Finance (aggiustato per split, non per dividendi).
      - Fallback: history(period="5d").iloc[-2] se info non restituisce il campo.
    """
    ttm_start = date.today() - timedelta(days=365)
    try:
        t = yf.Ticker(sym)

        # ── info dict (fonte primaria per prezzi e forward dividend) ──────────
        info = {}
        try:
            info = t.info
        except Exception:
            pass

        # Usa history(period="5d") con auto_adjust=True (default):
        #   iloc[-2] = penultimo giorno di trading = "Previous Close" di Yahoo Finance
        #   iloc[-1] = ultimo giorno di trading disponibile = prezzo corrente
        hist = t.history(period="5d")
        prev_close = None
        current    = None
        close_date = None   # data effettiva della chiusura prev_close
        if len(hist) >= 2:
            prev_close = round(float(hist["Close"].iloc[-2]), 4)
            current    = round(float(hist["Close"].iloc[-1]), 4)
            # data del penultimo giorno (= data di prev_close)
            raw_date = hist.index[-2]
            if hasattr(raw_date, "date"):
                close_date = raw_date.date().isoformat()
            else:
                close_date = str(raw_date)[:10]
        elif len(hist) == 1:
            prev_close = current = round(float(hist["Close"].iloc[-1]), 4)
            raw_date = hist.index[-1]
            close_date = raw_date.date().isoformat() if hasattr(raw_date, "date") else str(raw_date)[:10]

        change_pct = None
        if prev_close and current:
            change_pct = round((current - prev_close) / prev_close * 100, 2)

        # ── Dividendi TTM — somma storica reale ultimi 365 gg ────────────────
        div_ttm = 0.0
        try:
            divs = t.dividends
            if divs is not None and len(divs) > 0:
                idx = divs.index
                if hasattr(idx, "tz") and idx.tz is not None:
                    idx = idx.tz_localize(None)
                divs.index = idx
                mask = divs.index.date >= ttm_start
                div_ttm = round(float(divs[mask].sum()), 4) if mask.any() else 0.0
        except Exception:
            div_ttm = info.get("trailingAnnualDividendRate") or 0.0

        # ── Dividendo Forward — stima prossimi 12 mesi ───────────────────────
        # Yahoo Finance / yfinance recenti espongono il forward dividend nel campo
        # "dividendRate" (= "Forward Annual Dividend Rate" su Yahoo Finance).
        # "forwardAnnualDividendRate" è stato rimosso nelle versioni 2023+.
        # Cascata di fallback per coprire versioni diverse di yfinance:
        #   1. dividendRate              → forward dividend annualizzato (campo principale)
        #   2. forwardAnnualDividendRate → vecchie versioni yfinance pre-2023
        #   3. trailingAnnualDividendRate → solo se nessun forward disponibile
        raw_fwd = (
            info.get("dividendRate")
            or info.get("forwardAnnualDividendRate")
            or info.get("trailingAnnualDividendRate")
            or 0.0
        )
        div_fwd = round(float(raw_fwd), 4) if raw_fwd else 0.0

        # Yield calcolati sul prezzo di chiusura precedente
        yield_ttm_pct = round(div_ttm / prev_close * 100, 2) if prev_close and div_ttm else None
        yield_fwd_pct = round(div_fwd / prev_close * 100, 2) if prev_close and div_fwd else None

        name = info.get("longName") or info.get("shortName") or sym

        # ETF detection: quoteType == "ETF" oppure ticker finisce con suffisso borsa
        quote_type = info.get("quoteType", "")
        is_etf     = (quote_type == "ETF")
        isin       = info.get("isin") or None
        yf_country = info.get("country") or None

        return {
            "prev_close":    prev_close,
            "close_date":    close_date,
            "change_pct":    change_pct,
            "div_ttm":       div_ttm,
            "div_fwd":       div_fwd,
            "yield_ttm_pct": yield_ttm_pct,
            "yield_fwd_pct": yield_fwd_pct,
            "name":          name,
            "isin":          isin,
            "is_etf":        is_etf,
            "yf_country":    yf_country,
        }
    except Exception as e:
        print(f"  [WARN] {sym}: {e}")
        return {
            "prev_close": None, "close_date": None, "change_pct": None,
            "div_ttm": 0.0, "div_fwd": 0.0,
            "yield_ttm_pct": None, "yield_fwd_pct": None, "name": sym,
            "isin": None, "is_etf": False, "yf_country": None,
        }


def main():
    parser = argparse.ArgumentParser(
        description="fetch_data.py — scarica prezzi e dividendi TTM da Yahoo Finance",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Esempi:
  python fetch_data.py                              # CSV: portfolio.csv (default)
  python fetch_data.py acquisti.csv                 # CSV: file specifico
  python fetch_data.py --db --user mario --password segreto
  python fetch_data.py --db --user mario --password segreto --host 192.168.1.10
        """,
    )

    # Sorgente dati: CSV (default) o DB
    parser.add_argument(
        "csv_file",
        nargs="?",
        default=None,
        help="Percorso del file CSV (default: PurchaseExport.csv o portfolio.csv)",
    )
    parser.add_argument(
        "--db",
        action="store_true",
        help="Leggi gli acquisti dal database MariaDB/MySQL invece che da CSV",
    )

    # Parametri di connessione DB
    db_group = parser.add_argument_group("opzioni database (richieste con --db)")
    db_group.add_argument("--host",     default="127.0.0.1", help="Host DB (default: 127.0.0.1)")
    db_group.add_argument("--port",     default=3306, type=int, help="Porta DB (default: 3306)")
    db_group.add_argument("--user",     default=None, help="Utente DB")
    db_group.add_argument("--password", default=None, help="Password DB")

    args = parser.parse_args()

    # ── Caricamento portafoglio ───────────────────────────────────────────────
    if args.db:
        if not args.user or not args.password:
            parser.error("Con --db sono obbligatori --user e --password")
        print(f"Lettura portafoglio da DB: {args.host}:{args.port} (ofbiz)")
        raw_rows = load_portfolio_from_db(args.host, args.port, args.user, args.password)
    else:
        if args.csv_file:
            csv_path = args.csv_file
        else:
            candidates = ["PurchaseExport.csv", "portfolio.csv"]
            csv_path = next((c for c in candidates if os.path.exists(c)), "portfolio.csv")
        if not os.path.exists(csv_path):
            print(f"ERRORE: file '{csv_path}' non trovato.")
            print("Utilizzo: python fetch_data.py [percorso_csv]")
            print("          python fetch_data.py --db --user UTENTE --password PASSWORD")
            sys.exit(1)
        print(f"Lettura portafoglio da: {csv_path}")
        raw_rows = load_portfolio(csv_path)

    portfolio = aggregate_portfolio(raw_rows)
    print(f"  {len(raw_rows)} righe lette → {len(portfolio)} ticker unici\n")

    print("  Anteprima aggregazione (prime 5 posizioni):")
    for p in portfolio[:5]:
        print(f"    {p['symbol']:<12} qty={p['qty']:>10.4f}  avg={p['avg_price']:>8.4f}  {p['currency']}  [{p['brokers']}]")
    print()

    os.makedirs("data", exist_ok=True)
    total_n = len(portfolio)

    print("Recupero tassi di cambio...")
    eur_usd = fetch_eur_usd()
    gbp_usd = fetch_gbp_usd()
    print(f"  EUR/USD = {eur_usd}  |  GBP/USD = {gbp_usd}\n")

    # Carica geo.json (override manuali + cache ISIN)
    geo = load_geo_file()

    results = []
    for i, p in enumerate(portfolio):
        sym       = p["symbol"]
        avg_price = p["avg_price"]
        print(f"  [{i+1:02d}/{total_n}] {sym:<12}", end="", flush=True)
        d = fetch_ticker_data(sym)
        prev_close = d["prev_close"]
        div_ttm    = d["div_ttm"] or 0.0
        div_fwd    = d["div_fwd"] or 0.0

        # Esposizione geografica: geo.json cache → JustETF → yfinance country
        geo_entry = get_geo_for_ticker(
            sym, d["isin"], d["is_etf"], d["yf_country"], geo
        )

        value_local = round(p["qty"] * prev_close, 2) if prev_close else None
        if value_local is not None:
            if p["currency"] == "EUR":
                value_usd = round(value_local * eur_usd, 2)
            elif p["currency"] == "GBP":
                value_usd = round(value_local * gbp_usd, 2)
            else:
                value_usd = value_local
        else:
            value_usd = None

        # Costo totale posizione (qty × prezzo medio acquisto)
        cost_local = round(p["qty"] * avg_price, 2) if avg_price else None
        if cost_local and p["currency"] == "EUR":
            cost_usd = round(cost_local * eur_usd, 2)
        elif cost_local and p["currency"] == "GBP":
            cost_usd = round(cost_local * gbp_usd, 2)
        else:
            cost_usd = cost_local

        # %var = variazione tra prezzo medio acquisto e ultima chiusura
        perf_pct = None
        if avg_price and prev_close and avg_price > 0:
            perf_pct = round((prev_close - avg_price) / avg_price * 100, 2)

        # P&L non realizzato
        pnl_local = round(value_local - cost_local, 2) if (value_local is not None and cost_local is not None) else None
        pnl_usd   = round(value_usd - cost_usd, 2)     if (value_usd  is not None and cost_usd  is not None) else None

        # TTM
        div_ttm_total_local = round(p["qty"] * div_ttm, 2)
        if p["currency"] == "EUR":
            div_ttm_total_usd = round(div_ttm_total_local * eur_usd, 2)
        elif p["currency"] == "GBP":
            div_ttm_total_usd = round(div_ttm_total_local * gbp_usd, 2)
        else:
            div_ttm_total_usd = div_ttm_total_local
        # Forward
        div_fwd_total_local = round(p["qty"] * div_fwd, 2)
        if p["currency"] == "EUR":
            div_fwd_total_usd = round(div_fwd_total_local * eur_usd, 2)
        elif p["currency"] == "GBP":
            div_fwd_total_usd = round(div_fwd_total_local * gbp_usd, 2)
        else:
            div_fwd_total_usd = div_fwd_total_local

        row = {
            "symbol":             sym,
            "currency":           p["currency"],
            "qty":                p["qty"],
            "avg_price":          avg_price,
            "brokers":            p["brokers"],
            "name":               d["name"],
            "prev_close":         prev_close,
            "close_date":         d["close_date"],
            "perf_pct":           perf_pct,       # %var vs prezzo medio acquisto
            "value_local":        value_local,
            "value_usd":          value_usd,
            "cost_local":         cost_local,
            "cost_usd":           cost_usd,
            "pnl_local":          pnl_local,
            "pnl_usd":            pnl_usd,
            "div_ttm":            div_ttm,
            "div_ttm_total_local":div_ttm_total_local,
            "div_ttm_total_usd":  div_ttm_total_usd,
            "div_fwd":            div_fwd,
            "div_fwd_total_local":div_fwd_total_local,
            "div_fwd_total_usd":  div_fwd_total_usd,
            "yield_ttm_pct":      d["yield_ttm_pct"],
            "yield_fwd_pct":      d["yield_fwd_pct"],
            "geo":                geo_entry,
        }
        results.append(row)
        if prev_close:
            if p["currency"] == "USD": sym_str = f"${prev_close:.2f}"
            elif p["currency"] == "GBP": sym_str = f"£{prev_close:.2f}"
            else: sym_str = f"€{prev_close:.2f}"
        else:
            sym_str = "N/A"
        perf_str = (f"{perf_pct:+.2f}%") if perf_pct is not None else "N/A"
        print(f"  {sym_str}  perf={perf_str}  TTM={div_ttm:.4f}")

    # Salva geo.json aggiornato (nuovi ticker aggiunti automaticamente)
    save_geo_file(geo)
    n_tickers = len(geo.get('tickers', {}))
    print(f"\n  geo.json aggiornato ({n_tickers} ticker)")

    total_value_usd     = sum(r["value_usd"] for r in results if r["value_usd"])
    total_cost_usd      = sum(r["cost_usd"]  for r in results if r["cost_usd"])
    total_pnl_usd       = sum(r["pnl_usd"]   for r in results if r["pnl_usd"])
    total_div_ttm_usd   = sum(r["div_ttm_total_usd"] for r in results)
    total_div_fwd_usd   = sum(r["div_fwd_total_usd"] for r in results)

    output = {
        "fetch_date":        date.today().isoformat(),
        "eur_usd":           eur_usd,
        "gbp_usd":           gbp_usd,
        "total_value_usd":   round(total_value_usd, 2),
        "total_cost_usd":    round(total_cost_usd, 2),
        "total_pnl_usd":     round(total_pnl_usd, 2),
        "total_div_ttm_usd": round(total_div_ttm_usd, 2),
        "total_div_fwd_usd": round(total_div_fwd_usd, 2),
        "portfolio":         results,
    }

    import math

    def _clean_nan(obj):
        """Converte ricorsivamente NaN/Inf in None per produrre JSON valido."""
        if isinstance(obj, float):
            return None if (math.isnan(obj) or math.isinf(obj)) else obj
        if isinstance(obj, dict):
            return {k: _clean_nan(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_clean_nan(v) for v in obj]
        return obj

    with open("data/portfolio_data.json", "w") as f:
        json.dump(_clean_nan(output), f, indent=2)

    print(f"\n{'='*55}")
    print(f"  Data fetch       : {date.today().isoformat()}")
    print(f"  EUR/USD          : {eur_usd}")
    print(f"  GBP/USD          : {gbp_usd}")
    print(f"  Valore totale    : ${total_value_usd:,.2f} USD")
    print(f"  Costo totale     : ${total_cost_usd:,.2f} USD")
    print(f"  P&L non realiz.  : ${total_pnl_usd:,.2f} USD")
    print(f"  Dividendi TTM    : ${total_div_ttm_usd:,.2f} USD")
    print(f"  Dividendi Forward: ${total_div_fwd_usd:,.2f} USD")
    print(f"  Output           : data/portfolio_data.json")
    print(f"{'='*55}")


if __name__ == "__main__":
    main()
