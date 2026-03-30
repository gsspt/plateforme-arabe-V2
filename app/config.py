import os

# Charger .env seulement en développement local
if os.path.exists('.env'):
    from dotenv import load_dotenv
    load_dotenv()
    try:
        print("\U0001f527 Mode développement: .env chargé")
    except UnicodeEncodeError:
        print("Mode developpement: .env charge")
else:
    try:
        print("\U0001f310 Mode production: variables d'environnement système")
    except UnicodeEncodeError:
        print("Mode production: variables d'environnement systeme")

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
    def _say(cls, msg):
        try:
            print(msg)
        except UnicodeEncodeError:
            import unicodedata
            print(''.join(c if ord(c) < 128 else '?' for c in msg))

    @classmethod
    def validate_configuration(cls):
        """Validation non-bloquante pour la production"""
        cls._say("🔍 Validation de la configuration...")

        if cls.GOOGLE_API_KEY:
            cls._say("✅ Google Vision API: CONFIGURÉE")
        else:
            cls._say("⚠️  Google Vision API: NON CONFIGURÉE (OCR désactivé)")

        if cls.DEEPSEEK_API_KEY:
            cls._say("✅ DeepSeek Translation API: CONFIGURÉE")
        else:
            cls._say("⚠️  DeepSeek Translation API: NON CONFIGURÉE (Traduction désactivée)")

        if os.path.exists(cls.BUCKWALTER_DATA_PATH):
            cls._say("✅ Données Buckwalter: PRÉSENTES")
        else:
            cls._say("❌ Données Buckwalter: MANQUANTES")

        cls._say("✅ Validation terminée")
        return True