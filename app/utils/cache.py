from flask_caching import Cache
import functools
import logging

logger = logging.getLogger(__name__)

# Instance globale du cache
cache_manager = Cache()

def cache_response(timeout=300, key_prefix='view_'):
    """
    Décorateur pour mettre en cache les réponses API
    """
    def decorator(f):
        @functools.wraps(f)
        def decorated_function(*args, **kwargs):
            # Générer une clé de cache basée sur les arguments
            cache_key = f"{key_prefix}{f.__name__}_{str(kwargs)}"
            
            # Essayer de récupérer depuis le cache
            cached_response = cache_manager.get(cache_key)
            if cached_response is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached_response
            
            # Exécuter la fonction et mettre en cache
            response = f(*args, **kwargs)
            cache_manager.set(cache_key, response, timeout=timeout)
            logger.debug(f"Cache set: {cache_key}")
            
            return response
        return decorated_function
    return decorator

def clear_cache_pattern(pattern):
    """Efface toutes les entrées du cache correspondant au pattern"""
    try:
        # Cette implémentation dépend du backend de cache
        # Pour SimpleCache, on ne peut pas facilement effacer par pattern
        # Dans une implémentation réelle, utiliser Redis ou Memcached
        logger.info(f"Tentative de suppression cache pattern: {pattern}")
    except Exception as e:
        logger.error(f"Erreur suppression cache: {e}")

def get_cache_stats():
    """Retourne les statistiques du cache (si supporté)"""
    try:
        # Implémentation basique pour SimpleCache
        cache_info = getattr(cache_manager.cache, 'cache', {})
        return {
            'total_entries': len(cache_info),
            'keys': list(cache_info.keys())[:10]  # Premières 10 clés
        }
    except Exception as e:
        logger.error(f"Erreur récupération stats cache: {e}")
        return {'error': 'Stats non disponibles'}