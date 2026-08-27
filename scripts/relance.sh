#!/bin/sh
# Redemarre l'application de developpement.
#
# On identifie le processus par le PORT QU'IL ECOUTE, pas par un fichier .pid
# ni par « pkill -f node server.js » :
#  - le fichier .pid ment des qu'une instance a ete lancee a la main ;
#  - le motif de pkill correspond aussi au shell qui lance la commande, qui
#    se tue alors lui-meme (le shell rend le code 144 et rien n'explique
#    pourquoi la commande s'est arretee).
cd "$(dirname "$0")/.." || exit 1
PORT=$(grep -E "^PORT=" .env 2>/dev/null | cut -d= -f2)
PORT=${PORT:-3012}

PID=$(ss -lptnH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
if [ -n "$PID" ]; then
  kill "$PID" 2>/dev/null
  # On attend la liberation du port : relancer trop tot donne EADDRINUSE,
  # l'ancien processus continue de repondre et l'on teste du vieux code.
  i=0
  while [ $i -lt 30 ] && ss -lptnH "sport = :$PORT" 2>/dev/null | grep -q LISTEN; do
    sleep 0.2
    i=$((i + 1))
  done
fi

mkdir -p logs
nohup node server.js > logs/app.log 2>&1 &
echo $! > logs/app.pid

i=0
while [ $i -lt 40 ]; do
  if curl -sf -m 1 "http://127.0.0.1:$PORT/sante" > /dev/null 2>&1; then
    echo "en ligne sur le port $PORT"
    exit 0
  fi
  sleep 0.25
  i=$((i + 1))
done
echo "DEMARRAGE ECHOUE :"
tail -20 logs/app.log
exit 1
