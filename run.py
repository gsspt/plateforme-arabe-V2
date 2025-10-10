#!/usr/bin/env python3
from app import create_app
import os
import logging

# Logging pour production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

app = create_app()

if __name__ == '__main__':
    # POUR LE DÉVELOPPEMENT LOCAL SEULEMENT
    port = int(os.environ.get('PORT', 5000))
    print(f"🚀 Démarrage local sur http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)