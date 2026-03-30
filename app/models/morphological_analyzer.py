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
            self._construire_index_suggestions()
            self.is_loaded = True

            logger.info(f"✅ Analyseur chargé: {len(self.prefixes)} prefixes, "
                       f"{len(self.radicaux)} radicaux, {len(self.suffixes)} suffixes, "
                       f"{len(self._suggestions_index)} suggestions indexées")
                       
        except Exception as e:
            logger.error(f"❌ Erreur chargement analyseur: {e}")
            raise
    
    # Voyelles et diacritiques Buckwalter (pas du squelette consonantique)
    _BW_DIACRITIQUES = frozenset('aouiFNK~')

    # Diacritiques arabes Unicode (pour normalisation des suggestions)
    _AR_DIACRITICS_RE = re.compile(r'[\u064B-\u0652\u0670\u0640\u06D6-\u06DC\u06DF-\u06E4]')

    def _strip_ar_diacritics(self, text):
        """Retire les voyelles arabes (tashkil) pour la recherche par préfixe."""
        return self._AR_DIACRITICS_RE.sub('', text)

    def _construire_index_suggestions(self):
        """Construit un index trié de (forme_nue, forme_voc, glose, pos) depuis les stems."""
        seen_nue = set()
        entries = []
        _clean_glose = lambda g: re.sub(r'<pos>.+?</pos>', '', g).replace(';', '/').strip()

        for stem_entries in self.radicaux.values():
            for e in stem_entries:
                ar = e.get('vocalise_arabe', '')
                if not ar or len(ar) < 2:
                    continue
                nue = self._strip_ar_diacritics(ar)
                if nue in seen_nue:
                    continue
                seen_nue.add(nue)
                glose = _clean_glose(e.get('glose', ''))[:50]
                pos   = e.get('pos', '')
                entries.append((nue, ar, glose, pos))

        self._suggestions_index = sorted(entries, key=lambda x: x[0])

    def suggest_words(self, prefix_ar, limit=10):
        """Retourne les mots du lexique dont la forme non-vocalisée commence par prefix_ar."""
        if not self.is_loaded:
            return []
        prefix_nue = self._strip_ar_diacritics(prefix_ar)
        results = []
        for nue, voc, glose, pos in self._suggestions_index:
            if nue.startswith(prefix_nue):
                results.append({'word': voc, 'glose': glose, 'pos': pos})
                if len(results) >= limit:
                    break
        return results

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
    
    # Préfixes inaccompli en arabe unicode → lettre Buckwalter attendue au début du mot
    _IV_PREFIXES_AR = {
        '\u064a': 'y',  # ي
        '\u062a': 't',  # ت
        '\u0646': 'n',  # ن
        '\u0623': '>',  # أ
    }

    def _trouver_analyses_directes(self, mot_buckwalter):
        """Trouve les analyses directes du mot.

        Les radicaux IV (inaccompli) sont stockés sans leur préfixe de
        conjugaison dans dictStems.txt, mais leur `vocalise_arabe` est
        reconstituée avec le préfixe يَ/يُ par `_prefixer_iv_affichage`.
        Quand l'utilisateur saisit un mot comme كتب (PV), on ne doit pas
        retourner يكتب (IV) parce que les deux partagent la même clé
        consonantique ktb.  On filtre donc les entrées IV dont la première
        lettre vocalisée (ي، ت، ن، أ) n'est pas présente au début du mot
        saisi.
        """
        analyses = []
        # Première lettre arabe du mot saisi (pour déterminer si l'IV est pertinent)
        mot_ar_premier = buckwalter_to_arabic(mot_buckwalter[:1]) if mot_buckwalter else ''

        if mot_buckwalter in self.radicaux:
            for radical_data in self.radicaux[mot_buckwalter]:
                categorie = radical_data['categorie']

                # Filtrer les IV dont le préfixe vocalisé ne correspond pas
                # à la première lettre du mot saisi
                if categorie.startswith('IV'):
                    forme_ar = radical_data.get('vocalise_arabe', '')
                    if forme_ar:
                        premiere_lettre = forme_ar[0]
                        if premiere_lettre in self._IV_PREFIXES_AR:
                            bw_attendu = self._IV_PREFIXES_AR[premiere_lettre]
                            # Garder l'IV uniquement si le mot saisi commence
                            # par la même lettre que le préfixe de conjugaison
                            if not mot_buckwalter.startswith(bw_attendu):
                                continue

                analyse = {
                    'forme_arabe':    radical_data['vocalise_arabe'],
                    'forme_buckwalter': radical_data['vocalise'],
                    'categorie':      categorie,
                    'pos':            radical_data['pos'],
                    'glose':          radical_data['glose'],
                    'lemme_id':       radical_data.get('lemme_id', '')
                }
                analyses.append(analyse)

        analyses = self._disambiguer_alif_wasl(mot_buckwalter, analyses)
        return self._trier_analyses(analyses)

    def _trier_analyses(self, analyses):
        """Trie les analyses par priorité POS : noms/adjectifs courants > verbes"""
        def _priorite(a):
            cat = a.get('categorie', '')
            pos = a.get('pos', '')
            # Impératifs en premier (très spécifiques)
            if cat.startswith('CV'): return 0
            # Noms et adjectifs ensuite
            if pos in ('NOUN', 'NOUN_PROP', 'ADJ'): return 1
            # Verbes accompli/inaccompli
            if cat.startswith('PV') or cat.startswith('IV'): return 2
            return 3
        return sorted(analyses, key=_priorite)

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
    
    @staticmethod
    def _normaliser_racine(racine_brute):
        """Normalise un nom de racine Buckwalter brut issu du dictionnaire.

        Deux normalisations sont appliquées :
        1. Suppression du suffixe de désambiguïsation entre parenthèses
           ex. 'wqy(1)' → 'wqy', 'bkA(2)' → 'bkA'
        2. Remplacement de Y (alif maqsura ى) par y (ya ي) en position finale,
           car les racines défectueuses sont conventionnellement notées avec y.
           ex. 'bkA' reste 'bkA' (baa-kaf-alif), mais si la racine finit en Y
           ce n'est pas une racine réelle — ce cas ne se produit pas dans le dict.
        """
        # Retirer le suffixe (N) de désambiguïsation
        racine = re.sub(r'\(\d+\)$', '', racine_brute).strip()
        return racine

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

            def _flush_lemme():
                """Enregistre le lemme courant s'il a des formes."""
                if not formes_lemme_courant:
                    return
                # Les entrées avant le premier ;; lemma reçoivent une clé synthétique
                key = lemme_courant if lemme_courant else f'_{racine_courante}_pre'
                if key in lemmes_racine_courante:
                    lemmes_racine_courante[key].extend(formes_lemme_courant)
                else:
                    lemmes_racine_courante[key] = formes_lemme_courant.copy()

            def _flush_racine():
                """Enregistre la racine courante dans la structure globale."""
                if not racine_courante or not lemmes_racine_courante:
                    return
                if racine_courante in structure:
                    # Fusionner les lemmes si la racine est déjà présente
                    # (cas des racines avec suffixe de désambiguïsation comme wqy(1)+wqy(2))
                    for lid, formes in lemmes_racine_courante.items():
                        if lid in structure[racine_courante]:
                            structure[racine_courante][lid].extend(formes)
                        else:
                            structure[racine_courante][lid] = formes
                else:
                    structure[racine_courante] = lemmes_racine_courante.copy()

            for ligne in lignes:
                ligne = ligne.strip()
                if not ligne:
                    continue

                if ligne.startswith(';--- '):
                    _flush_lemme()
                    _flush_racine()

                    racine_courante = self._normaliser_racine(ligne[5:].strip())
                    lemmes_racine_courante = {}
                    lemme_courant = ""
                    formes_lemme_courant = []

                elif ligne.startswith(';; '):
                    _flush_lemme()
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
            _flush_lemme()
            _flush_racine()
                
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
            # (entree_bw, vocalise_bw, glose, racine, categorie)
            # Form I (hamzat al-wasl + uCCuC / iCCiC)
            ('Axrj', '{uxoruj',   'go out!;exit!;leave!',         'xrj', 'CV_intr'),
            ('Adxl', '{udoxul',   'enter!;go in!',                'dxl', 'CV_intr'),
            ('A*hb', '{i*ohab',   'go!;leave!',                   '*hb', 'CV_intr'),
            ('Aktb', '{ukotub',   'write!',                       'ktb', 'CV'),
            ('Akl',  '{ukul',     'eat!',                         'Akl', 'CV_intr'),
            ('Aklm', '{ikalim',   'speak to!;address!',           'klm', 'CV'),
            ('Akml', '{ikmal',    'complete!;finish!',            'kml', 'CV'),
            ('Ajls', '{ijolis',   'sit down!;take a seat!',       'jls', 'CV_intr'),
            ('Afth', '{ifotaH',   'open!',                        'ftH', 'CV'),
            # Form II (impératif = vocalisation IV_yu sans préfixe yu/tu)
            ('Elm',  'Eal~im',    'teach!;instruct!',             'Elm', 'CV_yu'),
            ('klm',  'kal~im',    'speak to!;address!',           'klm', 'CV_yu'),
            ('kml',  'kam~il',    'complete!;perfect!',           'kml', 'CV_yu'),
        ]

        nb_cv = 0
        for entree, vocalise, glose, racine, categorie_cv in cv_manquants:
            entree_norm = normaliser_cle_buckwalter(entree)
            vocalise_arabe = buckwalter_to_arabic(vocalise)
            entree_data = {
                'entree':        entree_norm,
                'vocalise':      vocalise,
                'vocalise_arabe': vocalise_arabe,
                'categorie':     categorie_cv,
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

        self._reattacher_racines_depuis_verbes()

    def _reattacher_racines_depuis_verbes(self):
        """Corrige les lemmes mal attribués par manque de marqueurs ;--- dans dictStems.txt.

        Plusieurs centaines de racines n'ont pas de marqueur ;--- dans le fichier :
        leurs lemmes se retrouvent groupés sous la dernière racine marquée (bAs, jHm…).
        On corrige en deux passes :

        Passe 1 — lemmes avec entrées verbales (PV/IV/CV) :
            La clé consonantique d'une entrée PV/IV simple à 3 lettres est la racine.
            Ex. 'jaraH-a_1' a entrée jrH→PV → déplacé vers racine jrH.

        Passe 2 — lemmes nominaux sans verbe :
            On cherche la clé la plus courte, et si elle a exactement 3 lettres
            correspondant à une racine connue (créée en passe 1), on y rattache le lemme.
            Si la clé fait 4 lettres, on essaie de supprimer chaque mater lectionis
            (A, w, y) pour obtenir un triplet correspondant à une racine connue.
        """
        _MATRES    = frozenset('Awy')
        _VOYELLES  = self._BW_DIACRITIQUES  # frozenset('aouiFNK~')

        def _sk(bw):
            """Squelette consonantique normalisé pour la détection de racines.

            1. Retire les voyelles/diacritiques BW.
            2. Normalise Y (alif maqsura ى) → y (ya ي) : les verbes défectueux
               stockent la même racine tantôt en Y (forme pausa مشى→m$Y)
               tantôt en y (forme contextuelle يمشي→m$y) ; on unifie en y.
            """
            return ''.join(
                ('y' if c == 'Y' else c)
                for c in bw
                if c not in _VOYELLES
            )

        # ── Passe 1 : lemmes verbaux ──────────────────────────────────────────
        a_deplacer = {}  # lemme_id → (racine_source, vraie_racine)

        def _vraie_racine_verbale(formes):
            """Détermine la vraie racine d'un lemme verbal par vote majoritaire.

            Stratégie :
            1. On compte combien d'entrées verbales à 3 lettres pointent vers chaque
               clé consonantique (après normalisation Y→y et retrait des voyelles).
               On exclut PV_V/IV_V (géminés, clé à 2 lettres) au premier passage.
            2. La clé gagnante est celle qui a le plus de votes.
               En cas d'égalité parfaite on abandonne (retour None).

            Ce vote résout le cas des verbes défectueux : la forme PV_h (بكاه)
            génère une clé spurieuse 'bkA' alors que les formes PV_0, PV_Atn,
            IV_0hAnn génèrent toutes 'bky' → majorité pour 'bky'.
            """
            from collections import Counter
            votes = Counter()
            for forme in formes:
                cat = forme.get('categorie', '')
                if (cat.startswith(('PV', 'IV', 'CV'))
                        and not cat.startswith(('PV_V', 'IV_V'))):
                    sk = _sk(forme['entree'])
                    if len(sk) == 3:
                        votes[sk] += 1

            if not votes:
                # 2e tentative : accepter aussi PV_V / IV_V
                for forme in formes:
                    cat = forme.get('categorie', '')
                    if cat.startswith(('PV', 'IV', 'CV')):
                        sk = _sk(forme['entree'])
                        if len(sk) == 3:
                            votes[sk] += 1

            if not votes:
                return None
            # Prendre la clé la plus votée ; en cas d'égalité, abandonner
            top = votes.most_common(2)
            if len(top) >= 2 and top[0][1] == top[1][1]:
                return None  # égalité → incertain
            return top[0][0]

        for racine_src, lemmes in self.structure_racines_complete.items():
            for lemme_id, formes in lemmes.items():
                vraie = _vraie_racine_verbale(formes)
                if vraie is not None and vraie != racine_src:
                    a_deplacer[lemme_id] = (racine_src, vraie)

        n1 = 0
        for lemme_id, (src, dst) in a_deplacer.items():
            src_dict = self.structure_racines_complete.get(src)
            if src_dict is None or lemme_id not in src_dict:
                continue
            if dst not in self.structure_racines_complete:
                self.structure_racines_complete[dst] = {}
            self.structure_racines_complete[dst][lemme_id] = src_dict.pop(lemme_id)
            n1 += 1

        logger.info(f"🔧 Passe 1 racines: {n1} lemmes verbaux réattachés")

        # ── Passe 2 : lemmes nominaux sans verbe ─────────────────────────────
        racines_connues = frozenset(self.structure_racines_complete.keys())
        a_deplacer2 = {}

        for racine_src, lemmes in self.structure_racines_complete.items():
            for lemme_id, formes in lemmes.items():
                # Ignorer les lemmes avec des entrées verbales
                if any(f.get('categorie', '').startswith(('PV', 'IV', 'CV'))
                       for f in formes):
                    continue
                if not formes:
                    continue

                # Clé la plus courte (après stripping voyelles)
                cle_courte = min((_sk(f['entree']) for f in formes), key=len)

                # Cas exact à 3 lettres : si c'est une racine connue ≠ source
                if len(cle_courte) == 3:
                    if cle_courte in racines_connues and cle_courte != racine_src:
                        a_deplacer2[lemme_id] = (racine_src, cle_courte)
                    continue

                if len(cle_courte) < 3:
                    continue

                # Cas 4+ lettres : essayer de retirer chaque mater
                for i, c in enumerate(cle_courte):
                    if c in _MATRES and i > 0:
                        candidate = cle_courte[:i] + cle_courte[i + 1:]
                        if (len(candidate) == 3
                                and candidate in racines_connues
                                and candidate != racine_src):
                            a_deplacer2[lemme_id] = (racine_src, candidate)
                            break

        n2 = 0
        for lemme_id, (src, dst) in a_deplacer2.items():
            src_dict = self.structure_racines_complete.get(src)
            if src_dict is None or lemme_id not in src_dict:
                continue
            self.structure_racines_complete[dst][lemme_id] = src_dict.pop(lemme_id)
            n2 += 1

        logger.info(f"🔧 Passe 2 racines: {n2} lemmes nominaux réattachés")

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
        """Nettoie la glose : supprime les balises <pos> et normalise"""
        glose = re.sub(r'<pos>.+?</pos>', '', glose_pos)
        glose = re.sub(r'\s+', ' ', glose)
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