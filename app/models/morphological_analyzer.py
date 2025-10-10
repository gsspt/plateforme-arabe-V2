import os
import re
from collections import defaultdict
from ..utils.buckwalter import arabic_to_buckwalter, buckwalter_to_arabic
from ..config import Config
import logging

logger = logging.getLogger(__name__)

class MorphologicalAnalyzer:
    """Analyseur morphologique arabe avancé"""
    
    def __init__(self):
        self.prefixes = defaultdict(list)
        self.radicaux = defaultdict(list)
        self.suffixes = defaultdict(list)
        self.table_AB = set()
        self.table_AC = set()
        self.table_BC = set()
        self.structure_racines_complete = {}
        self.is_loaded = False
    
    def load_data(self):
        """Charge toutes les données morphologiques"""
        if self.is_loaded:
            return
            
        logger.info("Chargement de l'analyseur morphologique arabe...")
        
        try:
            self.prefixes = self._charger_lexique("dictPrefixes.txt")
            self.radicaux = self._charger_lexique("dictStems.txt")
            self.suffixes = self._charger_lexique("dictSuffixes.txt")
            
            self.table_AB = self._charger_table_compatibilite("tableAB.txt")
            self.table_AC = self._charger_table_compatibilite("tableAC.txt")
            self.table_BC = self._charger_table_compatibilite("tableBC.txt")
            
            self.structure_racines_complete = self._charger_structure_racines_complete()
            
            self._appliquer_corrections_memoire()
            self.is_loaded = True
            
            logger.info(f"✅ Analyseur chargé: {len(self.prefixes)} prefixes, "
                       f"{len(self.radicaux)} radicaux, {len(self.suffixes)} suffixes")
                       
        except Exception as e:
            logger.error(f"❌ Erreur chargement analyseur: {e}")
            raise
    
    def analyser_mot(self, mot):
        """Analyse principale d'un mot arabe"""
        if not self.is_loaded:
            self.load_data()
        
        # Conversion si nécessaire
        if any('\u0600' <= char <= '\u06FF' for char in mot):
            mot_arabe = mot
            mot_buckwalter = arabic_to_buckwalter(mot)
        else:
            mot_buckwalter = mot
            mot_arabe = buckwalter_to_arabic(mot)
        
        logger.info(f"🔍 Analyse de: '{mot_arabe}' -> '{mot_buckwalter}'")
        
        # Analyses directes
        analyses_directes = self._trouver_analyses_directes(mot_buckwalter)
        
        # Trouver les racines
        racines_trouvees = self._trouver_racines_par_mot(mot_buckwalter, analyses_directes)
        
        # Formes dérivées
        formes_derivees = {}
        for racine in racines_trouvees:
            if racine in self.structure_racines_complete:
                formes_derivees[racine] = self.structure_racines_complete[racine]
        
        return {
            'mot_arabe': mot_arabe,
            'mot_buckwalter': mot_buckwalter,
            'analyses_directes': analyses_directes,
            'racines_trouvees': list(racines_trouvees),
            'formes_derivees': formes_derivees
        }
    
    def _trouver_analyses_directes(self, mot_buckwalter):
        """Trouve les analyses directes du mot"""
        analyses = []
        
        if mot_buckwalter in self.radicaux:
            for radical_data in self.radicaux[mot_buckwalter]:
                analyse = {
                    'forme_arabe': radical_data['vocalise_arabe'],
                    'forme_buckwalter': radical_data['vocalise'],
                    'categorie': radical_data['categorie'],
                    'pos': radical_data['pos'],
                    'glose': radical_data['glose'],
                    'lemme_id': radical_data.get('lemme_id', '')
                }
                analyses.append(analyse)
        
        return analyses
    
    def _trouver_racines_par_mot(self, mot_buckwalter, analyses):
        """Trouve toutes les racines contenant le mot donné"""
        racines_trouvees = set()
        
        for racine, lemmes in self.structure_racines_complete.items():
            for lemme_id, formes in lemmes.items():
                for forme in formes:
                    if forme['entree'] == mot_buckwalter:
                        racines_trouvees.add(racine)
                        break
        
        return racines_trouvees
    
    def _charger_lexique(self, nom_fichier):
        """Charge un fichier lexique au format Buckwalter"""
        lexique = defaultdict(list)
        chemin = os.path.join(Config.BUCKWALTER_DATA_PATH, nom_fichier)
        
        if not os.path.exists(chemin):
            logger.warning(f"Fichier manquant: {nom_fichier}")
            return lexique
        
        try:
            encoding = 'windows-1256' if 'Stems' in nom_fichier else 'utf-8'
            
            with open(chemin, 'r', encoding=encoding) as f:
                lemme_courant = ""
                
                for ligne in f:
                    ligne = ligne.strip()
                    if not ligne:
                        continue
                    
                    if ligne.startswith(';; '):
                        lemme_courant = ligne[3:].strip()
                        continue
                    elif ligne.startswith(';'):
                        continue
                    
                    champs = ligne.split('\t')
                    if len(champs) < 4:
                        continue
                    
                    entree, vocalise, categorie, glose_pos = champs[:4]
                    entree = entree.replace(' ', '')
                    
                    # Extraction POS et glose
                    pos = self._extraire_pos_ameliore(glose_pos, categorie, vocalise, nom_fichier)
                    glose = self._nettoyer_glose(glose_pos)
                    vocalise_arabe = buckwalter_to_arabic(vocalise) if vocalise else ""
                    
                    valeur = {
                        'entree': entree,
                        'vocalise': vocalise,
                        'vocalise_arabe': vocalise_arabe,
                        'categorie': categorie,
                        'glose': glose,
                        'pos': pos,
                        'lemme_id': lemme_courant
                    }
                    
                    lexique[entree].append(valeur)
                        
        except Exception as e:
            logger.error(f"Erreur chargement {nom_fichier}: {e}")
        
        return lexique
    
    def _charger_structure_racines_complete(self):
        """Charge la structure complète des racines"""
        structure = {}
        chemin = os.path.join(Config.BUCKWALTER_DATA_PATH, "dictStems.txt")
        
        if not os.path.exists(chemin):
            return structure
        
        try:
            with open(chemin, 'r', encoding='windows-1256') as f:
                lignes = f.readlines()
            
            racine_courante = ""
            lemme_courant = ""
            formes_lemme_courant = []
            lemmes_racine_courante = {}
            
            for ligne in lignes:
                ligne = ligne.strip()
                if not ligne:
                    continue
                
                if ligne.startswith(';--- '):
                    if racine_courante and lemmes_racine_courante:
                        structure[racine_courante] = lemmes_racine_courante.copy()
                    
                    racine_courante = ligne[5:].strip()
                    lemmes_racine_courante = {}
                    lemme_courant = ""
                    formes_lemme_courant = []

                elif ligne.startswith(';; '):
                    if lemme_courant and formes_lemme_courant:
                        lemmes_racine_courante[lemme_courant] = formes_lemme_courant.copy()
                    
                    lemme_courant = ligne[3:].strip()
                    formes_lemme_courant = []
                
                elif not ligne.startswith(';') and '\t' in ligne:
                    champs = ligne.split('\t')
                    if len(champs) >= 4:
                        entree, vocalise, categorie, glose_pos = champs[:4]
                        entree = entree.replace(' ', '')
                        
                        pos = self._extraire_pos_ameliore(glose_pos, categorie, vocalise, "dictStems.txt")
                        glose = self._nettoyer_glose(glose_pos)
                        vocalise_arabe = buckwalter_to_arabic(vocalise) if vocalise else ""
                        
                        forme_data = {
                            'entree': entree,
                            'vocalise': vocalise,
                            'vocalise_arabe': vocalise_arabe,
                            'categorie': categorie,
                            'glose': glose,
                            'pos': pos,
                            'lemme_id': lemme_courant
                        }
                        formes_lemme_courant.append(forme_data)
            
            # Dernière racine
            if lemme_courant and formes_lemme_courant:
                lemmes_racine_courante[lemme_courant] = formes_lemme_courant.copy()
            if racine_courante and lemmes_racine_courante:
                structure[racine_courante] = lemmes_racine_courante.copy()
                
        except Exception as e:
            logger.error(f"Erreur chargement structure racines: {e}")
        
        return structure
    
    def _appliquer_corrections_memoire(self):
        """Applique les corrections en mémoire"""
        corrections = [
            "Pref-0 IV_V_Pass_yu",
            "PV_V Suff-0",
            "PV_V_intr Suff-0", 
            "Pref-0 IV_C_Pass_yu",
            "PV_C Suff-0",
        ]
        
        for regle in corrections:
            if "Pref-0" in regle:
                self.table_AB.add(regle)
            elif "Suff-0" in regle:
                self.table_BC.add(regle)
        
        logger.info(f"🔧 {len(corrections)} corrections appliquées en mémoire")
    
    def _extraire_pos_ameliore(self, glose_pos, categorie, vocalise, nom_fichier):
        """Extraction améliorée du POS"""
        pos_explicite = self._extraire_pos_explicite(glose_pos)
        if pos_explicite:
            return pos_explicite
        
        # Détection basée sur la catégorie
        if re.match(r'^(Pref-0|Suff-0)$', categorie):
            return ""
        elif categorie.startswith('F'):
            return "FUNC_WORD"
        elif categorie.startswith('IV'):
            return "VERB_IMPERFECT"
        elif categorie.startswith('PV'):
            return "VERB_PERFECT"
        elif categorie.startswith('CV'):
            return "VERB_IMPERATIVE"
        elif categorie.startswith('N'):
            if glose_pos and glose_pos[0].isupper():
                return "NOUN_PROP"
            elif self._est_adjectif_par_pattern(vocalise, categorie, glose_pos):
                return "ADJ"
            else:
                return "NOUN"
        else:
            return "UNKNOWN"
    
    def _extraire_pos_explicite(self, glose_pos):
        """Extrait le POS explicite des balises"""
        match = re.search(r'<pos>(.+?)</pos>', glose_pos)
        if match:
            pos_content = match.group(1)
            if '/ADJ' in pos_content or 'ADJECTIVE' in pos_content:
                return "ADJ"
            elif '/NOUN_PROP' in pos_content or 'PROP' in pos_content:
                return "NOUN_PROP"
            elif '/NOUN' in pos_content:
                return "NOUN"
            elif '/VERB' in pos_content:
                return "VERB"
            elif '/FUNC_WORD' in pos_content:
                return "FUNC_WORD"
            else:
                return pos_content.split('/')[0] if '/' in pos_content else pos_content
        return None
    
    def _est_adjectif_par_pattern(self, vocalise, categorie, glose):
        """Détecte les adjectifs par patterns"""
        if not vocalise:
            return False
        
        if vocalise.endswith('iy~') or vocalise.endswith('iy'):
            return True
        
        if categorie.startswith('N') and any(pattern in vocalise for pattern in ['mu', 'ma', 'mun', 'man']):
            return True
        
        if vocalise.startswith(('>a', 'A')) and len(vocalise) <= 6:
            return True
        
        if glose and any(mot in glose.lower() for mot in ['adjective', 'adj', 'adjectival']):
            return True
        
        return False
    
    def _nettoyer_glose(self, glose_pos):
        """Nettoie la glose"""
        glose = re.sub(r'<pos>.+?</pos>', '', glose_pos)
        glose = re.sub(r'\s+$', '', glose_pos)
        glose = glose.replace(';', '/')
        return glose.strip()
    
    def _charger_table_compatibilite(self, nom_fichier):
        """Charge une table de compatibilité"""
        table = set()
        chemin = os.path.join(Config.BUCKWALTER_DATA_PATH, nom_fichier)
        
        if not os.path.exists(chemin):
            return table
        
        try:
            with open(chemin, 'r', encoding='utf-8') as f:
                for ligne in f:
                    ligne = ligne.strip()
                    if ligne and not ligne.startswith(';'):
                        ligne = re.sub(r'\s+', ' ', ligne)
                        table.add(ligne)
        except Exception as e:
            logger.error(f"Erreur chargement {nom_fichier}: {e}")
        
        return table