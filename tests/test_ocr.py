import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.models.ocr_processor import OCRProcessor

@pytest.fixture
def app():
    app = create_app()
    app.config['TESTING'] = True
    return app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def ocr_processor():
    return OCRProcessor()

class TestOCRProcessor:
    """Tests pour le processeur OCR"""
    
    def test_ocr_processor_initialization(self, ocr_processor):
        """Test l'initialisation du processeur OCR"""
        assert ocr_processor is not None
        assert hasattr(ocr_processor, 'api_key')
        assert hasattr(ocr_processor, 'base_url')
        assert hasattr(ocr_processor, 'available')
    
    def test_ocr_configuration_validation(self, ocr_processor):
        """Test la validation de la configuration OCR"""
        # Ce test dépend de la présence de la clé API
        # Dans un environnement de test, on s'attend à ce que ce soit False
        assert isinstance(ocr_processor.available, bool)
    
    def test_file_validation(self):
        """Test la validation des fichiers"""
        from app.utils.validators import validate_file_upload, allowed_file
        
        # Test des extensions autorisées
        assert allowed_file('document.pdf') == True
        assert allowed_file('document.PDF') == True
        assert allowed_file('document.txt') == False
        assert allowed_file('document.jpg') == False

class TestOCREndpoints:
    """Tests pour les endpoints OCR"""
    
    def test_ocr_api_no_file(self, client):
        """Test l'API OCR sans fichier"""
        response = client.post('/api/ocr-process')
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data
    
    def test_ocr_api_invalid_file(self, client):
        """Test l'API OCR avec un fichier invalide"""
        # Test avec un fichier texte au lieu d'un PDF
        data = {
            'pdf_file': (io.BytesIO(b"fake text content"), 'test.txt')
        }
        response = client.post('/api/ocr-process', data=data)
        assert response.status_code == 400

def test_utility_functions():
    """Test les fonctions utilitaires"""
    from app.utils.validators import validate_arabic_word, sanitize_input
    
    # Test validation des mots arabes
    is_valid, error = validate_arabic_word("كتاب")
    assert is_valid == True
    assert error is None
    
    is_valid, error = validate_arabic_word("")
    assert is_valid == False
    assert error is not None
    
    is_valid, error = validate_arabic_word("a" * 100)  # Trop long
    assert is_valid == False
    
    # Test sanitization
    safe_text = sanitize_input("<script>alert('xss')</script>")
    assert "<script>" not in safe_text

if __name__ == '__main__':
    pytest.main([__file__, '-v'])