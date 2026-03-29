from .morphological_analyzer import MorphologicalAnalyzer
from .database import ArabicDatabase

# Import conditionnel OCR — ne bloque pas l'app si PyMuPDF est cassé
try:
    from .ocr_processor import OCRProcessor
    ocr_processor = OCRProcessor()
except ImportError as e:
    import logging
    logging.getLogger(__name__).warning(f"⚠️ OCRProcessor non disponible: {e}")
    OCRProcessor = None
    ocr_processor = None

# Import conditionnel Traduction
try:
    from .translation_processor import TranslationProcessor
except ImportError as e:
    import logging
    logging.getLogger(__name__).warning(f"⚠️ TranslationProcessor non disponible: {e}")
    TranslationProcessor = None

__all__ = ['analyzer', 'ocr_processor', 'database', 'OCRProcessor', 'TranslationProcessor']

# Instances globales
analyzer = MorphologicalAnalyzer()
database = ArabicDatabase()

def init_models():
    """Initialise tous les modèles"""
    analyzer.load_data()
    database.init_db()
    if ocr_processor is None:
        print("⚠️  OCR désactivé (dépendance manquante)")
    print("✅ Modèles initialisés")