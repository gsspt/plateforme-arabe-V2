from .morphological_analyzer import MorphologicalAnalyzer
from .ocr_processor import OCRProcessor
from .translation_processor import TranslationProcessor
from .database import ArabicDatabase

__all__ = ['analyzer', 'OCRProcessor', 'TranslationProcessor', 'database']

# Instances globales
analyzer = MorphologicalAnalyzer()
ocr_processor = OCRProcessor()
database = ArabicDatabase()

def init_models():
    """Initialise tous les modèles"""
    analyzer.load_data()
    database.init_db()
    print("✅ Modèles initialisés")