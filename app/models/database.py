import sqlite3
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class ArabicDatabase:
    """Gestionnaire de base de données pour l'application"""
    
    def __init__(self):
        self.db_path = 'data/arabic_platform.db'
        self.conn = None
    
    def init_db(self):
        """Initialise la base de données"""
        try:
            self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self.conn.row_factory = sqlite3.Row
            
            self._create_tables()
            logger.info("✅ Base de données initialisée")
            
        except Exception as e:
            logger.error(f"❌ Erreur initialisation DB: {e}")
            raise
    
    def _create_tables(self):
        """Crée les tables nécessaires"""
        cursor = self.conn.cursor()
        
        # Table des recherches utilisateur
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL,
                word_arabic TEXT NOT NULL,
                roots_found TEXT,
                analysis_count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT
            )
        ''')
        
        # Table des favoris
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL,
                word_arabic TEXT NOT NULL,
                analysis_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Table des statistiques d'usage
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS usage_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint TEXT NOT NULL,
                count INTEGER DEFAULT 0,
                date DATE DEFAULT CURRENT_DATE
            )
        ''')
        
        self.conn.commit()
    
    def save_search(self, word, word_arabic, roots_found, analysis_count, ip_address=None):
        """Sauvegarde une recherche dans l'historique"""
        try:
            cursor = self.conn.cursor()
            roots_json = json.dumps(roots_found)
            
            cursor.execute('''
                INSERT INTO search_history 
                (word, word_arabic, roots_found, analysis_count, ip_address)
                VALUES (?, ?, ?, ?, ?)
            ''', (word, word_arabic, roots_json, analysis_count, ip_address))
            
            self.conn.commit()
            return cursor.lastrowid
            
        except Exception as e:
            logger.error(f"❌ Erreur sauvegarde recherche: {e}")
            return None
    
    def get_search_history(self, limit=50):
        """Récupère l'historique des recherches"""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT * FROM search_history 
                ORDER BY created_at DESC 
                LIMIT ?
            ''', (limit,))
            
            return [dict(row) for row in cursor.fetchall()]
            
        except Exception as e:
            logger.error(f"❌ Erreur récupération historique: {e}")
            return []
    
    def add_favorite(self, word, word_arabic, analysis_data):
        """Ajoute un mot aux favoris"""
        try:
            cursor = self.conn.cursor()
            analysis_json = json.dumps(analysis_data)
            
            cursor.execute('''
                INSERT INTO favorites (word, word_arabic, analysis_data)
                VALUES (?, ?, ?)
            ''', (word, word_arabic, analysis_json))
            
            self.conn.commit()
            return cursor.lastrowid
            
        except Exception as e:
            logger.error(f"❌ Erreur ajout favori: {e}")
            return None
    
    def get_favorites(self):
        """Récupère tous les favoris"""
        try:
            cursor = self.conn.cursor()
            cursor.execute('SELECT * FROM favorites ORDER BY created_at DESC')
            
            favorites = []
            for row in cursor.fetchall():
                fav = dict(row)
                fav['analysis_data'] = json.loads(fav['analysis_data'])
                favorites.append(fav)
            
            return favorites
            
        except Exception as e:
            logger.error(f"❌ Erreur récupération favoris: {e}")
            return []
    
    def log_usage(self, endpoint):
        """Log l'usage d'un endpoint"""
        try:
            cursor = self.conn.cursor()
            today = datetime.now().date()
            
            # Vérifier si une entrée existe déjà aujourd'hui
            cursor.execute('''
                SELECT id, count FROM usage_stats 
                WHERE endpoint = ? AND date = ?
            ''', (endpoint, today))
            
            result = cursor.fetchone()
            
            if result:
                # Incrémenter le compteur existant
                cursor.execute('''
                    UPDATE usage_stats 
                    SET count = count + 1 
                    WHERE id = ?
                ''', (result['id'],))
            else:
                # Créer une nouvelle entrée
                cursor.execute('''
                    INSERT INTO usage_stats (endpoint, count)
                    VALUES (?, 1)
                ''', (endpoint,))
            
            self.conn.commit()
            
        except Exception as e:
            logger.error(f"❌ Erreur log usage: {e}")
    
    def get_usage_stats(self, days=30):
        """Récupère les statistiques d'usage"""
        try:
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT endpoint, SUM(count) as total_count
                FROM usage_stats 
                WHERE date >= date('now', '-' || ? || ' days')
                GROUP BY endpoint
                ORDER BY total_count DESC
            ''', (days,))
            
            return [dict(row) for row in cursor.fetchall()]
            
        except Exception as e:
            logger.error(f"❌ Erreur récupération stats: {e}")
            return []
    
    # Mots courants pour amorcer les suggestions dès le premier caractère
    _COMMON_WORDS = [
        'كتب','كتاب','كاتب','مكتوب','كتابة',
        'خرج','أخرج','خروج','مخرج',
        'دخل','دخول','مدخل','دخيل',
        'ذهب','ذهاب',
        'علم','عالم','معلم','علوم','تعلّم',
        'قرأ','قراءة','قرآن',
        'كلّم','كلام','متكلم',
        'فهم','فاهم','مفهوم',
        'عرف','معرفة','عارف',
        'رجع','رجوع','راجع',
        'جمع','مجموع','اجتماع','اجتمع',
        'استخرج','استخراج',
        'تداخل','تعاون','تعلّم',
        'سأل','سؤال',
        'بيت','مدرسة',
        'دخلائه','كتابه',
    ]

    def get_suggestions(self, prefix, limit=8):
        """Retourne des suggestions : historique + favoris + mots courants."""
        seen = []
        seen_set = set()

        def add(word):
            if word and word not in seen_set and word != prefix:
                seen_set.add(word)
                seen.append(word)

        if not self.conn:
            # DB non dispo : retomber sur les mots courants seulement
            for w in self._COMMON_WORDS:
                if w.startswith(prefix):
                    add(w)
            return seen[:limit]

        try:
            cursor = self.conn.cursor()

            # 1. Historique — trié par fréquence
            cursor.execute('''
                SELECT word_arabic, COUNT(*) as freq
                FROM search_history
                WHERE word_arabic LIKE ? AND word_arabic != ?
                GROUP BY word_arabic
                ORDER BY freq DESC, created_at DESC
                LIMIT ?
            ''', (prefix + '%', prefix, limit))
            for row in cursor.fetchall():
                add(row['word_arabic'])

            # 2. Favoris
            if len(seen) < limit:
                cursor.execute('''
                    SELECT word_arabic FROM favorites
                    WHERE word_arabic LIKE ? AND word_arabic != ?
                    ORDER BY created_at DESC
                    LIMIT ?
                ''', (prefix + '%', prefix, limit - len(seen)))
                for row in cursor.fetchall():
                    add(row['word_arabic'])

            # 3. Mots courants intégrés (complètent si toujours insuffisant)
            if len(seen) < limit:
                for w in self._COMMON_WORDS:
                    if w.startswith(prefix):
                        add(w)
                    if len(seen) >= limit:
                        break

        except Exception as e:
            logger.error(f"❌ Erreur suggestions: {e}")

        return seen[:limit]

    def close(self):
        """Ferme la connexion à la base de données"""
        if self.conn:
            self.conn.close()