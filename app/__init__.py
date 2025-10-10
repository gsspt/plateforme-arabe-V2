from flask import Flask
from flask_cors import CORS
from flask_caching import Cache
from .config import Config
from .routes import api, views
from .utils.cache import cache_manager
import os

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Initialisation des extensions
    CORS(app)
    cache_manager.init_app(app)
    
    # Création des dossiers nécessaires - SEULEMENT si n'existent pas
    os.makedirs('uploads', exist_ok=True)
    
    # Enregistrement des blueprints
    app.register_blueprint(views.main_bp)
    app.register_blueprint(api.api_bp, url_prefix='/api')
    
    # Validation de la configuration (non bloquante)
    Config.validate_configuration()
    
    return app