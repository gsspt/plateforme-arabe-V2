import os

# Charger .env seulement en développement local
if os.path.exists('.env'):
    from dotenv import load_dotenv
    load_dotenv()
    print("🔧 Mode développement: .env chargé")
else:
    print("🌐 Mode production: variables d'environnement système")

class Config:
    """Configuration centrale de l'application"""
    
    # Sécurité
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
    
    # APIs - SERONT CONFIGURÉES DANS RENDER
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')  # ← Clé Google Vision
    DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')  # ← Clé DeepSeek
    
    # Configuration technique
    UPLOAD_FOLDER = 'uploads'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'pdf'}
    CACHE_TYPE = 'SimpleCache'
    CACHE_DEFAULT_TIMEOUT = 300
    
    # Chemins des données - ABSOLUS pour Render
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    BUCKWALTER_DATA_PATH = os.path.join(BASE_DIR, 'data/buckwalter')
    NETWORK_DATA_PATH = os.path.join(BASE_DIR, 'data/network_data.json')
    
    # Paramètres API externes
    TRANSLATION_MAX_TOKENS = 2000
    TRANSLATION_TIMEOUT = 120
    DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

    @classmethod
    def validate_configuration(cls):
        """Validation non-bloquante pour la production"""
        print("🔍 Validation de la configuration...")
        
        if cls.GOOGLE_API_KEY:
            print("✅ Google Vision API: CONFIGURÉE")
        else:
            print("⚠️  Google Vision API: NON CONFIGURÉE (OCR désactivé)")
            
        if cls.DEEPSEEK_API_KEY:
            print("✅ DeepSeek Translation API: CONFIGURÉE")
        else:
            print("⚠️  DeepSeek Translation API: NON CONFIGURÉE (Traduction désactivée)")
        
        # Vérification des fichiers de données
        if os.path.exists(cls.BUCKWALTER_DATA_PATH):
            print("✅ Données Buckwalter: PRÉSENTES")
        else:
            print("❌ Données Buckwalter: MANQUANTES")
        
        print("✅ Validation terminée")
        return True