from flask import Blueprint, render_template, request, jsonify
from ..models import analyzer, database
from ..utils.cache import cache_response
import logging

logger = logging.getLogger(__name__)

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def home():
    """Page d'accueil"""
    return render_template('index.html')

@main_bp.route('/analyze')
def analyze_page():
    """Page de l'analyseur morphologique"""
    return render_template('analyze.html')

@main_bp.route('/network')
def network_page():
    """Page de visualisation du réseau"""
    return render_template('network.html')

@main_bp.route('/ocr')
def ocr_page():
    """Page OCR"""
    return render_template('ocr.html')

@main_bp.route('/about')
def about_page():
    """Page À propos"""
    return render_template('about.html')

@main_bp.route('/api/search-history')
def get_search_history():
    """API pour récupérer l'historique des recherches"""
    try:
        history = database.get_search_history(limit=20)
        return jsonify({'success': True, 'history': history})
    except Exception as e:
        logger.error(f"Erreur récupération historique: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/favorites')
def get_favorites():
    """API pour récupérer les favoris"""
    try:
        favorites = database.get_favorites()
        return jsonify({'success': True, 'favorites': favorites})
    except Exception as e:
        logger.error(f"Erreur récupération favoris: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/stats')
@cache_response(timeout=3600)  # Cache 1 heure
def get_stats():
    """API pour les statistiques d'usage"""
    try:
        stats = database.get_usage_stats(days=30)
        search_history = database.get_search_history(limit=5)
        
        return jsonify({
            'success': True,
            'usage_stats': stats,
            'recent_searches': search_history
        })
    except Exception as e:
        logger.error(f"Erreur récupération stats: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500