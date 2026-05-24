# Portfolio Tracker — Python + HTML

Report interattivo del portafoglio con prezzi e dividendi da Yahoo Finance.

## Struttura
```
portfolio_python/
├── run_portfolio.sh     ← avvia tutto (fetch + server + browser)
├── fetch_data.py        ← scarica dati da Yahoo Finance
├── report.html          ← dashboard interattiva
├── geo.json             ← esposizione geografica per ticker (modificabile)
└── data/                ← generata automaticamente da fetch_data.py
    └── portfolio_data.json
```

## Utilizzo

```bash
# Rendi eseguibile (solo la prima volta)
chmod +x run_portfolio.sh

# Avvia tutto in un colpo
./run_portfolio.sh                   # usa PurchaseExport.csv di default
./run_portfolio.sh mio_file.csv      # oppure specifica il tuo CSV
```

Lo script in sequenza:
1. Verifica Python e installa yfinance se mancante
2. Esegue fetch_data.py (scarica prezzi e dividendi da Yahoo Finance)
3. Avvia il server locale sulla porta 8000
4. Apre il report nel browser — premi CTRL+C per fermare

## Formato CSV di input

```
"Prod Id","Purch Id","Simbolo","Nome","Qtá","Valuta","Prezzo","Data","Exchange","Broker"
```

| Campo  | Formato                                              |
|--------|------------------------------------------------------|
| Qtá    | Punto = separatore migliaia  (es. `4.709` = 4709)   |
| Prezzo | Virgola = separatore decimale (es. `23,19` = 23.19) |

Righe multiple per lo stesso ticker vengono aggregate (somma qty, VWAP prezzo).

## Esposizione geografica (geo.json)
- ETF: recuperata automaticamente da JustETF tramite ISIN
- Titoli singoli: ricavata dal paese di yfinance
- Override manuale: modifica `geo.json` → sezione `tickers`
