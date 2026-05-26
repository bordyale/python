#!/bin/bash
# ============================================================
# run_portfolio.sh
# Esegue fetch_data.py, avvia il server locale e apre il report
#
# Utilizzo:
#   ./run_portfolio.sh [file.csv]                       # sorgente CSV
#   ./run_portfolio.sh --db --user U --password P       # sorgente DB
#   ./run_portfolio.sh --no-browser [...]               # non apre il browser
#   ./run_portfolio.sh --server-only                    # solo server HTTP, senza fetch
#   ./run_portfolio.sh --fetch-only [...]               # solo fetch dati, senza server
#   ./run_portfolio.sh --help                           # mostra questo aiuto
#
# Opzioni:
#   --db               Leggi acquisti da MariaDB invece che da CSV
#   --user UTENTE      Utente DB (obbligatorio con --db)
#   --password PASS    Password DB (obbligatorio con --db)
#   --host HOST        Host DB (default: 127.0.0.1)
#   --port-db PORTA    Porta DB (default: 3306)
#   --port PORTA       Porta server HTTP (default: 8000)
#   --server-only      Avvia solo il server HTTP senza eseguire fetch_data.py
#   --fetch-only       Esegui solo fetch_data.py senza avviare il server
#   --no-browser       Avvia il server ma non apre il browser
#   --help / -h        Mostra questo aiuto
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

# ── Parsing argomenti ─────────────────────────────────────────────────────────
USE_DB=false
DB_HOST="127.0.0.1"
DB_PORT=3306
DB_USER=""
DB_PASS=""
CSV_ARG=""
OPEN_BROWSER=true
HTTP_PORT=8000
SERVER_ONLY=false
FETCH_ONLY=false

show_help() {
    echo ""
    echo "Utilizzo:"
    echo "  ./run_portfolio.sh [file.csv]                        # sorgente CSV"
    echo "  ./run_portfolio.sh --db --user U --password P        # sorgente DB"
    echo "  ./run_portfolio.sh --server-only                     # solo server HTTP, senza fetch"
    echo "  ./run_portfolio.sh --fetch-only [...]                # solo fetch dati, senza server"
    echo "  ./run_portfolio.sh --no-browser [...]                # non apre il browser"
    echo ""
    echo "Opzioni:"
    echo "  --db               Leggi acquisti da MariaDB invece che da CSV"
    echo "  --user UTENTE      Utente DB (obbligatorio con --db)"
    echo "  --password PASS    Password DB (obbligatorio con --db)"
    echo "  --host HOST        Host DB (default: 127.0.0.1)"
    echo "  --port-db PORTA    Porta DB (default: 3306)"
    echo "  --port PORTA       Porta server HTTP (default: 8000)"
    echo "  --server-only      Avvia solo il server HTTP senza eseguire fetch_data.py"
    echo "  --fetch-only       Esegui solo fetch_data.py senza avviare il server"
    echo "  --no-browser       Avvia il server ma non apre il browser"
    echo "  --help / -h        Mostra questo aiuto"
    echo ""
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --help|-h)
            show_help
            exit 0
            ;;
        --db)
            USE_DB=true
            shift
            ;;
        --user)
            DB_USER="$2"
            shift 2
            ;;
        --password)
            DB_PASS="$2"
            shift 2
            ;;
        --host)
            DB_HOST="$2"
            shift 2
            ;;
        --port-db)
            DB_PORT="$2"
            shift 2
            ;;
        --port)
            HTTP_PORT="$2"
            shift 2
            ;;
        --server-only)
            SERVER_ONLY=true
            shift
            ;;
        --fetch-only)
            FETCH_ONLY=true
            shift
            ;;
        --no-browser)
            OPEN_BROWSER=false
            shift
            ;;
        -*)
            echo "❌ Opzione sconosciuta: $1"
            show_help
            exit 1
            ;;
        *)
            CSV_ARG="$1"
            shift
            ;;
    esac
done

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         📊 Portfolio Tracker                 ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Verifica Python ────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo "❌ Python non trovato. Installalo da https://python.org"
    exit 1
fi
echo "✓ Python: $($PYTHON --version)"

# ── 2. Verifica yfinance ──────────────────────────────────────────────────────
if ! $PYTHON -c "import yfinance" &>/dev/null; then
    echo "📦 Installazione yfinance..."
    $PYTHON -m pip install yfinance --quiet
fi
echo "✓ yfinance disponibile"

# ── 3. Verifica mysql-connector (solo se --db) ────────────────────────────────
if ! $SERVER_ONLY && $USE_DB; then
    if ! $PYTHON -c "import mysql.connector" &>/dev/null; then
        echo "📦 Installazione mysql-connector-python..."
        $PYTHON -m pip install mysql-connector-python --quiet
    fi
    echo "✓ mysql-connector disponibile"
fi

# ── 4. Scegli sorgente dati e costruisci i parametri per fetch_data.py ────────
if $SERVER_ONLY; then
    echo "✓ Modalità server-only: fetch dati saltato"
else
if $USE_DB; then
    if [ -z "$DB_USER" ] || [ -z "$DB_PASS" ]; then
        echo "❌ Con --db sono obbligatori --user e --password"
        show_help
        exit 1
    fi
    FETCH_ARGS="--db --user $DB_USER --password $DB_PASS --host $DB_HOST --port $DB_PORT"
    echo "✓ Sorgente: MariaDB ($DB_HOST:$DB_PORT, db=ofbiz, user=$DB_USER)"
else
    if [ -n "$CSV_ARG" ]; then
        CSV_FILE="$CSV_ARG"
    elif [ -f "PurchaseExport.csv" ]; then
        CSV_FILE="PurchaseExport.csv"
    elif [ -f "portfolio.csv" ]; then
        CSV_FILE="portfolio.csv"
    else
        echo "❌ Nessun file CSV trovato."
        echo "   Usa --db per leggere dal database oppure specifica un file CSV."
        show_help
        exit 1
    fi
    FETCH_ARGS="$CSV_FILE"
    echo "✓ Sorgente: CSV ($CSV_FILE)"
fi
fi  # end if ! SERVER_ONLY
echo ""

# ── 5. Esegui fetch_data.py ───────────────────────────────────────────────────
if ! $SERVER_ONLY; then
    echo "🔄 Scarico prezzi e dividendi da Yahoo Finance..."
    echo "   (può richiedere 3-5 minuti)"
    echo ""
    $PYTHON fetch_data.py $FETCH_ARGS

    if [ $? -ne 0 ]; then
        echo "❌ fetch_data.py ha restituito un errore."
        exit 1
    fi

    echo ""
    echo "✓ Dati aggiornati in data/portfolio_data.json"
    echo ""
fi

# ── 6. Ferma eventuale server precedente sulla porta ─────────────────────────
if ! $FETCH_ONLY; then
$PYTHON -c "
import socket
s = socket.socket()
try:
    s.connect(('127.0.0.1', $HTTP_PORT))  # check sempre su localhost
    s.close()
    print('PORT_IN_USE')
except:
    print('PORT_FREE')
" > /tmp/port_check.txt 2>/dev/null

if grep -q "PORT_IN_USE" /tmp/port_check.txt 2>/dev/null; then
    echo "⚠️  Porto $HTTP_PORT occupato — provo a liberarlo..."
    $PYTHON -c "
import subprocess, sys, time
try:
    r = subprocess.run(['lsof','-ti',':$HTTP_PORT'], capture_output=True, text=True)
    pids = r.stdout.strip().split()
    for pid in pids:
        subprocess.run(['kill', pid])
        print('Fermato PID', pid)
    if pids:
        time.sleep(2)
        # Verifica se la porta è ancora occupata e forza con kill -9
        r2 = subprocess.run(['lsof','-ti',':$HTTP_PORT'], capture_output=True, text=True)
        pids2 = r2.stdout.strip().split()
        for pid in pids2:
            subprocess.run(['kill', '-9', pid])
            print('Forzato kill -9 PID', pid)
        time.sleep(1)
except Exception as e:
    print('Impossibile liberare la porta:', e)
"
    sleep 3
fi

# ── 7. Avvia server HTTP e (opzionalmente) apre il browser ───────────────────
echo "🌐 Avvio server locale su porta $HTTP_PORT..."

OPEN_BROWSER_PY=$( $OPEN_BROWSER && echo "True" || echo "False" )

$PYTHON - << PYEOF
import http.server
import socketserver
import threading
import webbrowser
import time
import os
import sys
import subprocess

PORT = $HTTP_PORT
URL  = "http://localhost:{}/report.html".format(PORT)
OPEN_BROWSER = $OPEN_BROWSER_PY

os.chdir("$SCRIPT_DIR")

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Sopprimi i log del server

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True
    def server_bind(self):
        import socket as _socket
        try:
            self.socket.setsockopt(_socket.SOL_SOCKET, _socket.SO_REUSEPORT, 1)
        except AttributeError:
            pass  # SO_REUSEPORT non disponibile su tutti i sistemi
        super().server_bind()

httpd = ReusableTCPServer(("0.0.0.0", PORT), QuietHandler)

server_thread = threading.Thread(target=httpd.serve_forever)
server_thread.daemon = True
server_thread.start()

print("✓ Server avviato su porta {}".format(PORT))

# Recupera IP locale
import socket as _socket
try:
    _s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
    _s.connect(("8.8.8.8", 80))
    local_ip = _s.getsockname()[0]
    _s.close()
except Exception:
    local_ip = None

if OPEN_BROWSER:
    print("🔗 Apro il report: {}".format(URL))
    print("")
    time.sleep(1)

    def open_in_vivaldi_flatpak(url):
        try:
            ps_output = subprocess.check_output(['flatpak', 'ps']).decode('utf-8')
            if 'com.vivaldi.Vivaldi' in ps_output:
                subprocess.Popen(['flatpak', 'run', 'com.vivaldi.Vivaldi', url],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return True
        except Exception:
            pass
        try:
            subprocess.Popen(['flatpak-spawn', '--host', 'xdg-open', url],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception:
            pass
        return webbrowser.open_new_tab(url)

    open_in_vivaldi_flatpak(URL)
else:
    print("🔗 Browser non aperto (--no-browser attivo)")
    print("   Apri manualmente: {}".format(URL))
    print("")

print("╔══════════════════════════════════════════════╗")
print("║  ✅ Portfolio Tracker avviato!               ║")
print("║                                              ║")
print("║  Locale:  http://localhost:{}/report.html  ║".format(PORT))
if local_ip:
    print("║  LAN:     http://{}:{}/report.html{}║".format(
        local_ip, PORT, ' ' * max(0, 13 - len(local_ip) - len(str(PORT)))))
print("║                                              ║")
print("║  Premi CTRL+C per fermare il server          ║")
print("╚══════════════════════════════════════════════╝")
print("")

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\n🛑 Arresto del server in corso...")
    httpd.shutdown()
    sys.exit(0)
PYEOF
fi  # end if ! FETCH_ONLY
