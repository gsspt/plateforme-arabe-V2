#!/usr/bin/env python3
import os
import sys
import signal
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

# ── Libération propre du port au Ctrl+C ──────────────────────────────────────
# Sur Windows, Flask/Werkzeug laisse parfois le socket en TIME_WAIT ce qui
# bloque le redémarrage immédiat. SO_REUSEADDR règle ça au niveau socket,
# mais le vrai problème est que le processus père (reloader Werkzeug) ne tue
# pas toujours ses enfants. On force ici un os._exit() propre sur SIGINT/SIGTERM
# pour que le port soit libéré immédiatement.

def _shutdown(signum, frame):
    print("\nArrêt propre du serveur...", flush=True)
    # os._exit évite les atexit handlers qui peuvent bloquer
    os._exit(0)

signal.signal(signal.SIGINT,  _shutdown)
signal.signal(signal.SIGTERM, _shutdown)

from app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Demarrage local sur http://localhost:{port}", flush=True)
    # use_reloader=False : désactive le reloader Werkzeug qui crée un processus
    # fils fantôme. Sans lui, Ctrl+C tue UN SEUL processus et le port se libère.
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
