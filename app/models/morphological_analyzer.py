import os
import re
from collections import defaultdict
from ..utils.buckwalter import arabic_to_buckwalter, buckwalter_to_arabic, normaliser_cle_buckwalter
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
    
    # Voyelles et diacritiques Buckwalter (pas du squelette consonantique)
    _BW_DIACRITIQUES = frozenset('aouiFNK~')

    def _depouiller_diacritiques(self, bw):
        """Retire les voyelles/diacritiques du Buckwalter, garde le squelette consonantique.
        Ex: 'duxalA}h' -> 'dxlA}h',  'daxal' -> 'dxl'
        Note: 'A' (alif) est une consonne et n'est PAS retiré.
        """
        return ''.join(c for c in bw if c not in self._BW_DIACRITIQUES)

    def analyser_mot(self, mot):
        """Analyse principale d'un mot arabe"""
        if not self.is_loaded:
            self.load_data()

        # Conversion si nécessaire
        if any('\u0600' <= char <= '\u06FF' for char in mot):
            mot_arabe = mot
            mot_buckwalter = normaliser_cle_buckwalter(arabic_to_buckwalter(mot))
        else:
            mot_buckwalter = normaliser_cle_buckwalter(mot)
            mot_arabe = buckwalter_to_arabic(mot_buckwalter)

        # Squelette consonantique (sans voyelles) — utilisé pour tous les lookups
        mot_bw_strip = self._depouiller_diacritiques(mot_buckwalter)

        logger.info(f"🔍 Analyse de: '{mot_arabe}' -> '{mot_buckwalter}' (strip: '{mot_bw_strip}')")

        # 1. Analyses directes (radical seul, sans affixe)
        analyses_directes = self._trouver_analyses_directes(mot_bw_strip)

        # 2. Analyses par décomposition préfixe + radical + suffixe
        analyses_decomposition = self._analyser_par_decomposition(mot_bw_strip)

        # Racines depuis analyses directes + décomposition
        racines_trouvees = self._trouver_racines_par_mot(mot_bw_strip, analyses_directes)
        for a in analyses_decomposition:
            racines_trouvees.update(
                self._trouver_racines_par_mot(a['radical_bw'], [])
            )

        # Formes dérivées
        formes_derivees = {}
        for racine in racines_trouvees:
            if racine in self.structure_racines_complete:
                formes_derivees[racine] = self.structure_racines_complete[racine]

        return {
            'mot_arabe':             mot_arabe,
            'mot_buckwalter':        mot_buckwalter,
            'analyses_directes':     analyses_directes,
            'analyses_decomposition': analyses_decomposition,
            'racines_trouvees':      list(racines_trouvees),
            'formes_derivees':       formes_derivees
        }
    
    def _trouver_analyses_directes(self, mot_buckwalter):
        """Trouve les analyses directes du mot"""
        analyses = []

        if mot_buckwalter in self.radicaux:
            for radical_data in self.radicaux[mot_buckwalter]:
                analyse = {
                    'forme_arabe':    radical_data['vocalise_arabe'],
                    'forme_buckwalter': radical_data['vocalise'],
                    'categorie':      radical_data['categorie'],
                    'pos':            radical_data['pos'],
                    'glose':          radical_data['glose'],
                    'lemme_id':       radical_data.get('lemme_id', '')
                }
                analyses.append(analyse)

        return self._disambiguer_alif_wasl(mot_buckwalter, analyses)

    def _disambiguer_alif_wasl(self, mot_buckwalter, analyses):
        """Priorise les lectures grammaticalement compatibles avec l'alif initial.

        En arabe non vocalisé, ا (hamzat al-wasl, Buckwalter A) et أ (hamzat
        al-qat3, Buckwalter >) s'écrivent parfois de la même façon. Le dictionnaire
        Buckwalter enregistre les deux graphies pour le Form IV (أفعل), ce qui crée
        un faux positif quand l'utilisateur saisit un impératif Form I (اِفْعَلْ).

        Règle : si le mot commence par A (wasl), les PV/IV Form IV dont la
        vocalisation commence par >a sont des lectures secondaires — on les place
        après les CV (impératifs) et les formes non-Form-IV.
        """
        if not mot_buckwalter.startswith('A') or not analyses:
            return analyses

        def _est_form_iv_via_wasl(a):
            """True si cette analyse est un Form IV qui utilise A comme alias de >."""
            return (a['categorie'].startswith(('PV', 'IV'))
                    and a['forme_buckwalter'].startswith('>a'))

        prioritaires = [a for a in analyses if not _est_form_iv_via_wasl(a)]
        secondaires  = [a for a in analyses if _est_form_iv_via_wasl(a)]

        # Marquer les lectures secondaires pour que l'interface puisse les signaler
        for a in secondaires:
            a['ambiguite_alif'] = True

        return prioritaires + secondaires
    
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

    def _analyser_par_decomposition(self, mot_bw_strip):
        """Analyse morphologique complète : essaie toutes les découpures
        (préfixe, radical, suffixe) et ne garde que les combinaisons
        compatibles selon les tables AB et BC.

        Paramètre : squelette consonantique Buckwalter (diacritiques déjà retirés).
        """
        resultats = []
        n = len(mot_bw_strip)
        vus = set()  # évite les doublons (prefixe, radical, suffixe, cat_radical, cat_suffixe)

        for i in range(n):
            prefixe = mot_bw_strip[:i]
            reste   = mot_bw_strip[i:]

            if prefixe == '':
                pref_entries = [{'categorie': 'Pref-0', 'vocalise': '', 'vocalise_arabe': '',
                                 'glose': '', 'pos': ''}]
            elif prefixe in self.prefixes:
                pref_entries = self.prefixes[prefixe]
            else:
                continue

            for j in range(1, len(reste) + 1):
                radical  = reste[:j]
                suffixe  = reste[j:]

                if radical not in self.radicaux:
                    continue

                if suffixe == '':
                    suff_entries = [{'categorie': 'Suff-0', 'vocalise': '', 'vocalise_arabe': '',
                                     'glose': '', 'pos': ''}]
                elif suffixe in self.suffixes:
                    suff_entries = self.suffixes[suffixe]
                else:
                    continue

                for pref_data in pref_entries:
                    for rad_data in self.radicaux[radical]:
                        for suff_data in suff_entries:
                            cat_p = pref_data['categorie']
                            cat_s = rad_data['categorie']
                            cat_x = suff_data['categorie']

                            if (f'{cat_p} {cat_s}' not in self.table_AB or
                                    f'{cat_s} {cat_x}' not in self.table_BC):
                                continue

                            cle = (prefixe, radical, suffixe, cat_s, cat_x)
                            if cle in vus:
                                continue
                            vus.add(cle)

                            # Forme arabe vocalisée complète
                            pref_ar  = buckwalter_to_arabic(pref_data.get('vocalise', ''))
                            suff_ar  = buckwalter_to_arabic(suff_data.get('vocalise', ''))
                            # Pour le radical IV, vocalise_arabe contient déjà le préfixe يَ/يُ ;
                            # ici on veut la forme brute du radical dans le mot composé.
                            rad_voc_brut = buckwalter_to_arabic(rad_data.get('vocalise', ''))
                            forme_complete = pref_ar + rad_voc_brut + suff_ar

                            # Nettoyer la glose du suffixe
                            suff_glose = re.sub(r'<pos>.+?</pos>', '', suff_data.get('glose', ''))
                            suff_glose = suff_glose.strip()

                            resultats.append({
                                'prefixe_bw':     prefixe,
                                'prefixe_ar':     pref_ar,
                                'prefixe_glose':  pref_data.get('glose', ''),
                                'radical_bw':     radical,
                                'radical_ar':     rad_data['vocalise_arabe'],
                                'radical_vocalise': rad_data.get('vocalise', ''),
                                'radical_categorie': cat_s,
                                'radical_pos':    rad_data['pos'],
                                'radical_glose':  rad_data['glose'],
                                'radical_lemme':  rad_data.get('lemme_id', ''),
                                'suffixe_bw':     suffixe,
                                'suffixe_ar':     suff_ar,
                                'suffixe_glose':  suff_glose,
                                'forme_complete': forme_complete,
                            })

        return resultats
    
    def _prefixer_iv_affichage(self, vocalise, categorie):
        """Retourne la forme arabe vocalisée d'un radical IV avec son préfixe
        de conjugaison canonique (3e pers. masc. sing.) pour l'affichage.

        Les radicaux IV dans dictStems.txt sont stockés sans préfixe, ce qui
        produit des formes commençant par une consonne + sukun (دْخُل) — illisibles
        en arabe isolé.  On reconstitue la forme canonique :
          IV / IV_intr / IV_C       → يَ + radical  (actif Form I)
          IV_yu / IV_V / IV_C_*     → يُ + radical  (actif Form II-X)
          IV_Pass / IV_Pass_yu      → يُ + radical  (passif)
        """
        if not vocalise:
            return ""
        # Déterminer le préfixe
        if re.search(r'IV_(yu|V|C|Pass)', categorie):
            prefixe_bw = 'yu'
        else:
            prefixe_bw = 'ya'
        return buckwalter_to_arabic(prefixe_bw + vocalise)

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
                    entree = normaliser_cle_buckwalter(entree.replace(' ', ''))

                    # Extraction POS et glose
                    pos = self._extraire_pos_ameliore(glose_pos, categorie, vocalise, nom_fichier)
                    glose = self._nettoyer_glose(glose_pos)
                    if categorie.startswith('IV') and 'Stems' in nom_fichier:
                        vocalise_arabe = self._prefixer_iv_affichage(vocalise, categorie)
                    else:
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
                        entree = normaliser_cle_buckwalter(entree.replace(' ', ''))
                        
                        pos = self._extraire_pos_ameliore(glose_pos, categorie, vocalise, "dictStems.txt")
                        glose = self._nettoyer_glose(glose_pos)
                        if categorie.startswith('IV'):
                            vocalise_arabe = self._prefixer_iv_affichage(vocalise, categorie)
                        else:
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
        regles_compat = [
            "Pref-0 IV_V_Pass_yu",
            "PV_V Suff-0",
            "PV_V_intr Suff-0",
            "Pref-0 IV_C_Pass_yu",
            "PV_C Suff-0",
        ]
        for regle in regles_compat:
            if "Pref-0" in regle:
                self.table_AB.add(regle)
            elif "Suff-0" in regle:
                self.table_BC.add(regle)

        # Entrées CV (impératif Form I) absentes du dictionnaire Buckwalter.
        # Le dictionnaire place >xxx ET Axxx comme alias du Form IV (أفعل),
        # ce qui masque l'impératif Form I lorsque l'utilisateur écrit ا sans hamza.
        # On ajoute ces formes manuellement pour les verbes courants concernés.
        # Seules les formes Axxx (hamzat al-wasl, ا) sont concernées : c'est la
        # graphie de l'impératif Form I. Les formes >xxx (hamzat al-qat3, أ)
        # appartiennent sans ambiguïté au Form IV et ne doivent pas recevoir de CV.
        cv_manquants = [
            # (entree_bw, vocalise_bw, glose, racine)
            ('Axrj', '{uxoruj',  'go out!;exit!;leave!',   'xrj'),
            ('Adxl', '{udoxul',  'enter!;go in!',          'dxl'),
            ('A*hb', '{i*ohab',  'go!;leave!',             '*hb'),
            ('Aklm', '{ikalim',  'speak to!;address!',     'klm'),
            ('Akml', '{ikmal',   'complete!;finish!',      'kml'),
        ]

        nb_cv = 0
        for entree, vocalise, glose, racine in cv_manquants:
            entree_norm = normaliser_cle_buckwalter(entree)
            vocalise_arabe = buckwalter_to_arabic(vocalise)
            entree_data = {
                'entree':        entree_norm,
                'vocalise':      vocalise,
                'vocalise_arabe': vocalise_arabe,
                'categorie':     'CV_intr',
                'glose':         glose,
                'pos':           'VERB_IMPERATIVE',
                'lemme_id':      f'{vocalise}_mem',
            }
            # N'ajouter que si aucune entrée CV n'existe déjà pour cette clé
            entrees_existantes = self.radicaux.get(entree_norm, [])
            if not any(e['categorie'].startswith('CV') for e in entrees_existantes):
                self.radicaux[entree_norm].append(entree_data)
                nb_cv += 1

            # Ajouter aussi dans structure_racines_complete
            if racine in self.structure_racines_complete:
                lemme_key = f'{vocalise}_mem'
                if lemme_key not in self.structure_racines_complete[racine]:
                    self.structure_racines_complete[racine][lemme_key] = [entree_data]

        logger.info(f"🔧 {len(regles_compat)} règles compat + {nb_cv} entrées CV ajoutées en mémoire")
    
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