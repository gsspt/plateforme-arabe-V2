"""
Utilitaire de conversion Arabe ↔ Buckwalter
Correspondances Buckwalter standard (vocalisées)
"""

# Table arabe → Buckwalter (tous les caractères utiles)
_AR_TO_BW = {
    'ء': '`',
    'آ': '|',
    'أ': '>',
    'ؤ': '&',
    'إ': '<',
    'ئ': '}',
    'ا': 'A',
    'ب': 'b',
    'ة': 'p',
    'ت': 't',
    'ث': 'v',
    'ج': 'j',
    'ح': 'H',
    'خ': 'x',
    'د': 'd',
    'ذ': '*',
    'ر': 'r',
    'ز': 'z',
    'س': 's',
    'ش': '$',
    'ص': 'S',
    'ض': 'D',
    'ط': 'T',
    'ظ': 'Z',
    'ع': 'E',
    'غ': 'g',
    'ـ': '_',
    'ف': 'f',
    'ق': 'q',
    'ك': 'k',
    'ل': 'l',
    'م': 'm',
    'ن': 'n',
    'ه': 'h',
    'و': 'w',
    'ى': 'Y',
    'ي': 'y',
    'ً': 'F',
    'ٌ': 'N',
    'ٍ': 'K',
    'َ': 'a',
    'ُ': 'u',
    'ِ': 'i',
    'ّ': '~',
    'ْ': 'o',
    'ٰ': '`',
    'ٱ': '{',
    'پ': 'P',
    'چ': 'J',
    'ڤ': 'V',
    'گ': 'G',
    "’": "’",
    '،': ',',
    '؛': ';',
    '؟': '?',
}

# Table Buckwalter → Arabe (inverse)
_BW_TO_AR = {
    '>': 'أ',
    '|': 'آ',
    '&': 'ؤ',
    '<': 'إ',
    '}': 'ئ',
    '`': 'ء',
    'A': 'ا',
    'b': 'ب',
    'p': 'ة',
    't': 'ت',
    'v': 'ث',
    'j': 'ج',
    'H': 'ح',
    'x': 'خ',
    'd': 'د',
    '*': 'ذ',
    'r': 'ر',
    'z': 'ز',
    's': 'س',
    '$': 'ش',
    'S': 'ص',
    'D': 'ض',
    'T': 'ط',
    'Z': 'ظ',
    'E': 'ع',
    'g': 'غ',
    '_': 'ـ',
    'f': 'ف',
    'q': 'ق',
    'k': 'ك',
    'l': 'ل',
    'm': 'م',
    'n': 'ن',
    'h': 'ه',
    'w': 'و',
    'Y': 'ى',
    'y': 'ي',
    'F': 'ً',
    'N': 'ٌ',
    'K': 'ٍ',
    'a': 'َ',
    'u': 'ُ',
    'i': 'ِ',
    '~': 'ّ',
    'o': 'ْ',
    '{': 'ٱ',
    'P': 'پ',
    'J': 'چ',
    'V': 'ڤ',
    'G': 'گ',
    "'": 'ء',
    ',': '،',
    ';': '؛',
    '?': '؟',
}


def arabic_to_buckwalter(mot_arabe: str) -> str:
    """Convertit un mot arabe (vocalisé ou non) en translittération Buckwalter."""
    return ''.join(_AR_TO_BW.get(char, char) for char in mot_arabe)


def buckwalter_to_arabic(mot_buckwalter: str) -> str:
    """Convertit la translittération Buckwalter en arabe (vocalisé ou non)."""
    return ''.join(_BW_TO_AR.get(char, char) for char in mot_buckwalter)


def normaliser_cle_buckwalter(entree: str) -> str:
    """Normalise une entrée Buckwalter pour les lookups.

    Le dictionnaire Buckwalter utilise l'apostrophe (') pour la hamza ء,
    tandis que arabic_to_buckwalter() produit le backtick (`).
    On normalise tout vers le backtick pour des comparaisons cohérentes.
    """
    return entree.replace("'", '`')


def convert_roots_to_arabic(roots: list) -> list:
    """Convertit une liste de racines Buckwalter en arabe."""
    arabic_roots = []
    for root in roots:
        if any('\u0600' <= char <= '\u06FF' for char in root):
            arabic_roots.append(root)
        else:
            arabic_roots.append(buckwalter_to_arabic(root))
    return arabic_roots


if __name__ == "__main__":
    # Test 1 : conversion aller-retour pour une forme vocalisée
    test_ar_vocalise = "اِحْلُمْ"
    test_bw = arabic_to_buckwalter(test_ar_vocalise)
    print(f"Arabe vocalisé : {test_ar_vocalise}")
    print(f"→ Buckwalter    : {test_bw}")
    test_ar_back = buckwalter_to_arabic(test_bw)
    print(f"→ Arabe retour  : {test_ar_back}")
    assert test_ar_back == test_ar_vocalise, "Erreur : aller-retour vocalisé échoué"

    # Test 2 : conversion d'une forme non vocalisée
    test_ar_non_vocalise = "احلُم"   # sans diacritiques (exemple)
    test_bw2 = arabic_to_buckwalter(test_ar_non_vocalise)
    print(f"\nArabe non vocalisé : {test_ar_non_vocalise}")
    print(f"→ Buckwalter        : {test_bw2}")
    test_ar_back2 = buckwalter_to_arabic(test_bw2)
    print(f"→ Arabe retour      : {test_ar_back2}")
    assert test_ar_back2 == test_ar_non_vocalise, "Erreur : aller-retour non vocalisé échoué"

    # Test 3 : caractères spéciaux (alif hamza)
    assert buckwalter_to_arabic("A") == "ا", "alif simple échoué"
    assert buckwalter_to_arabic(">") == "أ", "alif hamza dessus échoué"
    assert buckwalter_to_arabic("<") == "إ", "alif hamza dessous échoué"
    assert buckwalter_to_arabic("|") == "آ", "alif madda échoué"

    print("\n✅ Tous les tests de conversion sont passés !")