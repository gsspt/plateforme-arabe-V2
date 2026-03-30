from flask import Blueprint, request, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from ..models import analyzer, ocr_processor, database, TranslationProcessor
from ..utils.validators import validate_arabic_word, validate_file_upload
from ..utils.buckwalter import convert_roots_to_arabic
from ..utils.cache import cache_response
from ..utils.word_exporter import WordExporter
from flask import send_file
from datetime import datetime
import logging
import uuid
import os

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__)

# Configuration du rate limiting
limiter = Limiter(key_func=get_remote_address)

def init_limiter(app):
    """Initialise le rate limiting"""
    limiter.init_app(app)

@api_bp.route('/analyze', methods=['POST'])
@limiter.limit("100 per hour")
def analyze_api():
    """API d'analyse morphologique"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Données JSON requises'}), 400
        
        word = data.get('word', '').strip()
        
        # Validation
        is_valid, error_msg = validate_arabic_word(word)
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        logger.info(f"📥 Requête d'analyse pour: '{word}'")
        
        # Analyse morphologique
        result = analyzer.analyser_mot(word)
        
        # Sauvegarde dans l'historique
        ip_address = request.remote_addr
        database.save_search(
            word=word,
            word_arabic=result['mot_arabe'],
            roots_found=result['racines_trouvees'],
            analysis_count=len(result['analyses_directes']) + len(result.get('formes_derivees', {})),
            ip_address=ip_address
        )
        
        # Log usage
        database.log_usage('analyze')
        
        if result['analyses_directes'] or result['formes_derivees'] or result['analyses_decomposition']:
            return jsonify(_format_analysis_response(result))
        else:
            return jsonify({'error': f'Aucune analyse trouvée pour "{word}"'}), 404
            
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'analyse: {e}")
        return jsonify({'error': f'Erreur interne: {str(e)}'}), 500

@api_bp.route('/ocr-process', methods=['POST'])
@limiter.limit("50 per hour")
def ocr_process():
    """API pour traiter les PDF avec OCR"""
    try:
        # Vérifier si un fichier a été uploadé
        if 'pdf_file' not in request.files:
            return jsonify({'error': 'Aucun fichier fourni'}), 400
        
        file = request.files['pdf_file']
        
        # Validation du fichier
        is_valid, error_msg, filename = validate_file_upload(file)
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        logger.info(f"📁 Fichier reçu: {filename}")
        
        # Traitement OCR
        result = ocr_processor.process_pdf_file(file)
        
        # Log usage
        database.log_usage('ocr')
        
        return jsonify({
            'success': True,
            'text': result,
            'char_count': len(result)
        })
        
    except Exception as e:
        logger.error(f"❌ Erreur OCR: {e}")
        return jsonify({'error': f'Erreur lors du traitement OCR: {str(e)}'}), 500

@api_bp.route('/network-json')
@cache_response(timeout=3600)  # Cache 1 heure
def get_network_json():
    """Sert le fichier network_data.json"""
    try:
        from ..config import Config
        import json
        
        json_path = Config.NETWORK_DATA_PATH
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Log usage
        database.log_usage('network')
        
        return jsonify(data)
        
    except Exception as e:
        logger.error(f"❌ Erreur chargement network_data.json: {e}")
        return jsonify({"error": "Fichier de données non trouvé"}), 500

@api_bp.route('/suggest')
@limiter.limit("300 per minute")
def suggest():
    """Suggestions depuis le lexique morphologique complet."""
    q = request.args.get('q', '').strip()
    if len(q) < 1:
        return jsonify({'suggestions': []})
    results = analyzer.suggest_words(q, limit=10)
    return jsonify({'suggestions': results})

@api_bp.route('/favorites', methods=['POST'])
def add_favorite():
    """API pour ajouter un mot aux favoris"""
    try:
        data = request.get_json()
        word = data.get('word', '').strip()
        word_arabic = data.get('word_arabic', '').strip()
        analysis_data = data.get('analysis_data', {})
        
        if not word or not word_arabic:
            return jsonify({'error': 'Données incomplètes'}), 400
        
        favorite_id = database.add_favorite(word, word_arabic, analysis_data)
        
        if favorite_id:
            return jsonify({'success': True, 'favorite_id': favorite_id})
        else:
            return jsonify({'error': 'Erreur lors de l\'ajout aux favoris'}), 500
            
    except Exception as e:
        logger.error(f"❌ Erreur ajout favori: {e}")
        return jsonify({'error': str(e)}), 500

@api_bp.route('/favorites/<int:favorite_id>', methods=['DELETE'])
def remove_favorite(favorite_id):
    """API pour supprimer un favori"""
    try:
        # Implémentation à compléter selon la structure de la DB
        return jsonify({'success': True, 'message': 'Favori supprimé'})
    except Exception as e:
        logger.error(f"❌ Erreur suppression favori: {e}")
        return jsonify({'error': str(e)}), 500

def _format_analysis_response(result):
    """Formate la réponse de l'analyse pour l'API"""
    
    def safe_get(data, key, default="Non disponible"):
        value = data.get(key)
        if value is None or value == "":
            return default
        return value
    
    # Convertir les racines en arabe
    racines_arabes = convert_roots_to_arabic(result['racines_trouvees'])
    
    # Formes dérivées
    derived_forms_flat = []
    for racine, lemmes in result['formes_derivees'].items():
        for lemme_id, formes in lemmes.items():
            for forme in formes:
                derived_forms_flat.append({
                    'racine': racine,
                    'racine_arabe': convert_roots_to_arabic([racine])[0],
                    'lemme_id': lemme_id,
                    'forme_arabe': safe_get(forme, 'vocalise_arabe'),
                    'forme_buckwalter': safe_get(forme, 'vocalise'),
                    'categorie': safe_get(forme, 'categorie'),
                    'pos': safe_get(forme, 'pos'),
                    'glose': safe_get(forme, 'glose', 'Aucune traduction disponible')
                })
    
    # Formes directes
    direct_forms_formatted = []
    for form in result['analyses_directes']:
        direct_forms_formatted.append({
            'forme_arabe': safe_get(form, 'forme_arabe'),
            'forme_buckwalter': safe_get(form, 'forme_buckwalter'),
            'categorie': safe_get(form, 'categorie'),
            'pos': safe_get(form, 'pos'),
            'glose': safe_get(form, 'glose', 'Aucune traduction disponible'),
            'lemme_id': safe_get(form, 'lemme_id', '')
        })

    # Formes par décomposition (préfixe + radical + suffixe)
    decomposition_forms_formatted = []
    for form in result.get('analyses_decomposition', []):
        decomposition_forms_formatted.append({
            'forme_arabe':       safe_get(form, 'forme_complete'),
            'forme_buckwalter':  safe_get(form, 'radical_vocalise', ''),
            'categorie':         safe_get(form, 'radical_categorie'),
            'pos':               safe_get(form, 'radical_pos'),
            'glose':             safe_get(form, 'radical_glose', 'Aucune traduction disponible'),
            'radical_ar':        safe_get(form, 'radical_ar'),
            'prefixe_ar':        form.get('prefixe_ar', ''),
            'prefixe_glose':     form.get('prefixe_glose', ''),
            'suffixe_ar':        form.get('suffixe_ar', ''),
            'suffixe_glose':     form.get('suffixe_glose', ''),
        })

    return {
        'input_word': result['mot_arabe'],
        'input_buckwalter': result['mot_buckwalter'],
        'roots_found': racines_arabes,
        'roots_found_buckwalter': result['racines_trouvees'],
        'direct_forms': direct_forms_formatted,
        'derived_forms': derived_forms_flat,
        'decomposition_forms': decomposition_forms_formatted,
        'analysis_summary': {
            'total_direct_forms': len(result['analyses_directes']),
            'total_roots': len(result['racines_trouvees']),
            'total_derived_forms': len(derived_forms_flat),
            'total_decomposition_forms': len(decomposition_forms_formatted)
        }
    }

@api_bp.route('/translate', methods=['POST'])
@limiter.limit("30 per hour")  # Plus restrictif pour la traduction
def translate_text():
    """API pour traduire le texte OCR"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Données JSON requises'}), 400
        
        text_to_translate = data.get('text', '').strip()
        context = data.get('context', {})
        
        if not text_to_translate:
            return jsonify({'error': 'Texte à traduire requis'}), 400
        
        logger.info(f"📥 Requête de traduction: {len(text_to_translate)} caractères")
        
        # Traduction
        translator = TranslationProcessor()
        result = translator.translate_ocr_text(text_to_translate, context)
        
        if 'error' in result:
            return jsonify({'error': result['error']}), 400
        
        # Log usage
        database.log_usage('translation')
        
        return jsonify({
            'success': True,
            'translation': result['translated_text'],
            'metadata': {
                'segment_count': result['segment_count'],
                'char_count_original': result['char_count_original'],
                'char_count_translated': result['char_count_translated']
            }
        })
        
    except Exception as e:
        logger.error(f"❌ Erreur traduction: {e}")
        return jsonify({'error': f'Erreur lors de la traduction: {str(e)}'}), 500

@api_bp.route('/translation-context', methods=['POST'])
def save_translation_context():
    """API pour sauvegarder le contexte de traduction"""
    try:
        data = request.get_json()
        # Implémentation optionnelle pour sauvegarder le contexte
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"❌ Erreur sauvegarde contexte: {e}")
        return jsonify({'error': str(e)}), 500

@api_bp.route('/export/ocr-word', methods=['POST'])
def export_ocr_word():
    """Exporte le texte OCR en Word"""
    try:
        data = request.get_json()
        logger.info(f"📤 Export OCR Word - Données reçues: {len(data.get('text', ''))} caractères")
        
        ocr_text = data.get('text', '')
        
        if not ocr_text:
            logger.error("❌ Export OCR Word: Aucun texte fourni")
            return jsonify({'error': 'Aucun texte à exporter'}), 400
        
        filename = f"ocr_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
        logger.info(f"📝 Début export OCR Word: {filename}")
        
        filepath = WordExporter.export_ocr_to_word(ocr_text, filename)
        
        # ✅ UTILISER LE CHEMIN ABSOLU
        absolute_path = os.path.abspath(filepath)
        logger.info(f"✅ Export OCR Word réussi: {absolute_path}")
        
        return send_file(
            absolute_path,  # ✅ CHEMIN ABSOLUT
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
    except Exception as e:
        logger.error(f"❌ Erreur export OCR Word: {e}", exc_info=True)
        return jsonify({'error': f'Erreur lors de l\'export: {str(e)}'}), 500

@api_bp.route('/export/translation-word', methods=['POST'])
def export_translation_word():
    """Exporte la traduction en Word"""
    try:
        data = request.get_json()
        logger.info("📤 Export Traduction Word - Données reçues")
        
        original_text = data.get('original_text', '')
        translated_text = data.get('translated_text', '')
        context = data.get('context', {})
        
        logger.info(f"📊 Stats export: original={len(original_text)}, translated={len(translated_text)}")
        
        if not original_text or not translated_text:
            logger.error("❌ Export Traduction Word: Données manquantes")
            return jsonify({'error': 'Données de traduction manquantes'}), 400
        
        filename = f"traduction_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
        logger.info(f"📝 Début export Traduction Word: {filename}")
        
        filepath = WordExporter.export_translation_to_word(
            original_text, translated_text, context, filename
        )
        
        # ✅ UTILISER LE CHEMIN ABSOLU
        absolute_path = os.path.abspath(filepath)
        logger.info(f"✅ Export Traduction Word réussi: {absolute_path}")
        
        return send_file(
            absolute_path,  # ✅ CHEMIN ABSOLUT
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
    except Exception as e:
        logger.error(f"❌ Erreur export traduction Word: {e}", exc_info=True)
        return jsonify({'error': f'Erreur lors de l\'export: {str(e)}'}), 500
    
# Variable globale pour stocker la progression (en mémoire, pour prototype)
translation_progress = {}

@api_bp.route('/translate-with-progress', methods=['POST'])
def translate_with_progress():
    """API de traduction avec progression en temps réel"""
    try:
        data = request.get_json()
        text_to_translate = data.get('text', '').strip()
        context = data.get('context', {})
        session_id = data.get('session_id') or str(uuid.uuid4())
        
        if not text_to_translate:
            return jsonify({'error': 'Texte à traduire requis'}), 400
        
        logger.info(f"📥 Requête de traduction avec progression: {len(text_to_translate)} caractères")
        
        # Initialiser la progression
        translation_progress[session_id] = {
            'status': 'processing',
            'current': 0,
            'total': 0,
            'percent': 0,
            'segment_preview': 'Démarrage...',
            'result': None  # ✅ S'ASSURER QUE result EST INITIALISÉ
        }
        
        def progress_callback(progress_data):
            """Callback pour mettre à jour la progression"""
            # ✅ TOUJOURS METTRE À JOUR LE RÉSULTAT S'IL EST PRÉSENT
            if 'result' in progress_data:
                translation_progress[session_id]['result'] = progress_data['result']
            translation_progress[session_id].update(progress_data)
            logger.info(f"📊 Progression mise à jour: {progress_data.get('percent', 0)}%")
        
        # Lancer la traduction en arrière-plan
        def translate_in_background():
            try:
                from ..models import TranslationProcessor
                translator = TranslationProcessor()
                result = translator.translate_ocr_text_with_progress(
                    text_to_translate, context, progress_callback
                )
                
                # ✅ S'ASSURER QUE LE RÉSULTAT EST BIEN SAUVEGARDÉ
                translation_progress[session_id].update({
                    'status': 'completed',
                    'result': result,  # ✅ GARDER LE RÉSULTAT
                    'percent': 100,
                    'segment_preview': 'Traduction terminée!'
                })
                
                logger.info(f"✅ Traduction terminée: {len(result.get('translated_text', ''))} caractères")
                
            except Exception as e:
                logger.error(f"❌ Erreur traduction en arrière-plan: {e}")
                translation_progress[session_id].update({
                    'status': 'error',
                    'error': str(e),
                    'result': None
                })
        
        # Démarrer dans un thread séparé
        import threading
        thread = threading.Thread(target=translate_in_background)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': 'Traduction démarrée'
        })
        
    except Exception as e:
        logger.error(f"❌ Erreur traduction avec progression: {e}")
        return jsonify({'error': f'Erreur lors de la traduction: {str(e)}'}), 500

@api_bp.route('/translation-progress/<session_id>')
def get_translation_progress(session_id):
    """Récupère la progression de la traduction"""
    progress = translation_progress.get(session_id, {})
    
    if not progress:
        return jsonify({'error': 'Session non trouvée'}), 404
    
    return jsonify(progress)

@api_bp.route('/test-download')
def test_download():
    """Route de test pour le téléchargement"""
    try:
        # Créer un fichier test simple
        test_content = "Ceci est un test"
        test_path = os.path.join('uploads', 'test.txt')
        
        with open(test_path, 'w', encoding='utf-8') as f:
            f.write(test_content)
        
        absolute_path = os.path.abspath(test_path)
        logger.info(f"📁 Test download: {absolute_path}")
        
        return send_file(
            absolute_path,
            as_attachment=True,
            download_name='test.txt'
        )
        
    except Exception as e:
        logger.error(f"❌ Test download failed: {e}")
        return jsonify({'error': str(e)}), 500