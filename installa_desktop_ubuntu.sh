#!/bin/bash
# Script di compilazione ed creazione lanciatore Desktop per Ubuntu 26.04
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "1. Installazione dipendenze..."
npm install

echo "2. Compilazione eseguibile autonomo (calendario-bin)..."
rm -f "$DIR/calendario-bin"
npx --yes @yao-pkg/pkg . --targets node20-linux-x64 --output calendario-bin
chmod +x "$DIR/calendario-bin"

# Script wrapper che avvia MariaDB (se spento), lancia l'eseguibile e apre il browser
cat << 'EOF' > "$DIR/avvia-calendario.sh"
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORTA=$(grep -E '^PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '[:space:]')
PORTA=${PORTA:-3000}

if ! ss -tln | grep -q ":${PORTA} "; then
  if [ -x "$DIR/calendario-bin" ]; then
    "$DIR/calendario-bin" &
  else
    node "$DIR/server.js" &
  fi
  SERVER_PID=$!
  sleep 1.2
  xdg-open "http://localhost:${PORTA}"
  wait $SERVER_PID
else
  xdg-open "http://localhost:${PORTA}"
fi
EOF
chmod +x "$DIR/avvia-calendario.sh"

# Rileva cartella Scrivania / Desktop
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Scrivania")"
[ ! -d "$DESKTOP_DIR" ] && DESKTOP_DIR="$HOME/Desktop"

DESKTOP_FILE="$DESKTOP_DIR/Calendario.desktop"

cat << EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Type=Application
Name=Calendario Scolastico
Comment=Avvia il server Calendario e apre l'interfaccia web
Exec=$DIR/avvia-calendario.sh
Path=$DIR
Icon=x-office-calendar
Terminal=false
Categories=Office;Calendar;
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE"
gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true

echo "Completato! Lanciatore creato in: $DESKTOP_FILE"
