from flask import Flask
from flask_cors import CORS
from flask_caching import Cache
from .config import Config
from .routes import api, views
from .utils.cache import cache_manager
from .models import database, analyzer
import os

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialisation des extensions
    CORS(app)
    cache_manager.init_app(app)
    api.init_limiter(app)

    # Création des dossiers nécessaires
    os.makedirs('uploads', exist_ok=True)
    os.makedirs('data', exist_ok=True)

    # Initialisation de la base de données
    database.init_db()

    # Chargement synchrone — le lexique est prêt dès l'ouverture du site
    analyzer.load_data()

    # Enregistrement des blueprints
    app.register_blueprint(views.main_bp)
    app.register_blueprint(api.api_bp, url_prefix='/api')

    # Validation de la configuration
    Config.validate_configuration()

    return app

# ⭐⭐ LIGNE CRUCIALE ⭐⭐
# Export direct de l'application pour Gunicorn
app = create_app()