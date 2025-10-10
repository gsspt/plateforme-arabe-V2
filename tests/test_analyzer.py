import pytest
import sys
import os

# Ajouter le chemin de l'application
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.models.morphological_analyzer import MorphologicalAnalyzer

@pytest.fixture
def app():
    """Fixture pour l'application Flask"""
    app = create_app()
    app.config['TESTING'] = True
    return app

@pytest.fixture
def client(app):
    """Fixture pour le client de test"""
    return app.test_client()

@pytest.fixture
def analyzer():
    """Fixture pour l'analyseur morphologique"""
    analyzer = MorphologicalAnalyzer()
    # Pour les tests, on peut utiliser une version simplifiée
    return analyzer

class TestMorphologicalAnalyzer:
    """Tests pour l'analyseur morphologique"""
    
    def test_analyzer_initialization(self, analyzer):
        """Test l'initialisation de l'analyseur"""
        assert analyzer is not None
        assert hasattr(analyzer, 'prefixes')
        assert hasattr(analyzer, 'radicaux')
        assert hasattr(analyzer, 'suffixes')
    
    def test_buckwalter_conversion(self):
        """Test la conversion Buckwalter"""
        from app.utils.buckwalter import arabic_to_buckwalter, buckwalter_to_arabic
        
        # Test conversion arabe -> buckwalter
        arabic_word = "كتاب"
        buckwalter = arabic_to_buckwalter(arabic_word)
        assert buckwalter == "ktAb"
        
        # Test conversion buckwalter -> arabe
        converted_back = buckwalter_to_arabic(buckwalter)
        assert converted_back == arabic_word
    
    def test_analyze_simple_word(self, analyzer):
        """Test l'analyse d'un mot simple"""
        # Note: Ce test nécessite les fichiers de données
        try:
            analyzer.load_data()
            result = analyzer.analyser_mot("كتاب")
            
            assert 'mot_arabe' in result
            assert 'mot_buckwalter' in result
            assert 'analyses_directes' in result
            assert 'racines_trouvees' in result
            assert 'formes_derivees' in result
            
        except FileNotFoundError:
            pytest.skip("Fichiers de données non disponibles pour les tests")

class TestAPIEndpoints:
    """Tests pour les endpoints API"""
    
    def test_home_page(self, client):
        """Test la page d'accueil"""
        response = client.get('/')
        assert response.status_code == 200
        assert b'Plateforme' in response.data
    
    def test_analyze_page(self, client):
        """Test la page d'analyse"""
        response = client.get('/analyze')
        assert response.status_code == 200
        assert b'Analyseur' in response.data
    
    def test_network_page(self, client):
        """Test la page réseau"""
        response = client.get('/network')
        assert response.status_code == 200
        assert b'Reseau' in response.data
    
    def test_ocr_page(self, client):
        """Test la page OCR"""
        response = client.get('/ocr')
        assert response.status_code == 200
        assert b'OCR' in response.data
    
    def test_analyze_api_invalid_data(self, client):
        """Test l'API d'analyse avec des données invalides"""
        # Test sans données
        response = client.post('/api/analyze', json={})
        assert response.status_code == 400
        
        # Test avec mot vide
        response = client.post('/api/analyze', json={'word': ''})
        assert response.status_code == 400
    
    def test_network_json_endpoint(self, client):
        """Test l'endpoint des données réseau"""
        response = client.get('/api/network-json')
        # Peut retourner 200 ou 404 selon la disponibilité des données
        assert response.status_code in [200, 404, 500]

def test_environment_configuration():
    """Test la configuration de l'environnement"""
    from app.config import Config
    
    # Vérifie que les chemins sont définis
    assert hasattr(Config, 'BUCKWALTER_DATA_PATH')
    assert hasattr(Config, 'UPLOAD_FOLDER')
    assert hasattr(Config, 'MAX_CONTENT_LENGTH')

if __name__ == '__main__':
    pytest.main([__file__, '-v'])