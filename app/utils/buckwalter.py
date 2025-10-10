"""
Utilitaire de conversion Arabe ↔ Buckwalter
"""

def arabic_to_buckwalter(mot_arabe):
    """Convertit un mot arabe en translittération Buckwalter"""
    table_conversion = {
        'ء': '>', 'آ': '|', 'أ': '>', 'ؤ': '&', 'إ': '<', 'ئ': '}', 'ا': 'A',
        'ب': 'b', 'ة': 'p', 'ت': 't', 'ث': 'v', 'ج': 'j', 'ح': 'H', 'خ': 'x',
        'د': 'd', 'ذ': '*', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': '$', 'ص': 'S',
        'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'E', 'غ': 'g', 'ـ': '_', 'ف': 'f',
        'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w',
        'ى': 'Y', 'ي': 'y', 'ً': 'F', 'ٌ': 'N', 'ٍ': 'K', 'َ': 'a', 'ُ': 'u',
        'ِ': 'i', 'ّ': '~', 'ْ': 'o', 'ٰ': '`', 'ٱ': '{', 'پ': 'P', 'چ': 'J',
        'ڤ': 'V', 'گ': 'G'
    }
    
    resultat = ''
    for char in mot_arabe:
        if char in table_conversion:
            resultat += table_conversion[char]
        else:
            resultat += char
    
    return resultat

def buckwalter_to_arabic(mot_buckwalter):
    """Convertit la translittération Buckwalter en arabe"""
    table_conversion = {
        '>': 'ء', '|': 'آ', '&': 'ؤ', '<': 'إ', '}': 'ئ', 'A': 'ا',
        'b': 'ب', 'p': 'ة', 't': 'ت', 'v': 'ث', 'j': 'ج', 'H': 'ح', 'x': 'خ',
        'd': 'د', '*': 'ذ', 'r': 'ر', 'z': 'ز', 's': 'س', '$': 'ش', 'S': 'ص',
        'D': 'ض', 'T': 'ط', 'Z': 'ظ', 'E': 'ع', 'g': 'غ', '_': 'ـ', 'f': 'ف',
        'q': 'ق', 'k': 'ك', 'l': 'ل', 'm': 'م', 'n': 'ن', 'h': 'ه', 'w': 'و',
        'Y': 'ى', 'y': 'ي', 'F': 'ً', 'N': 'ٌ', 'K': 'ٍ', 'a': 'َ', 'u': 'ُ',
        'i': 'ِ', '~': 'ّ', 'o': 'ْ', '`': 'ٰ', '{': 'ٱ', 'P': 'پ', 'J': 'چ',
        'V': 'ڤ', 'G': 'گ'
    }
    
    resultat = ''
    for char in mot_buckwalter:
        if char in table_conversion:
            resultat += table_conversion[char]
        else:
            resultat += char
    
    return resultat

def convert_roots_to_arabic(roots):
    """Convertit les racines Buckwalter en arabe"""
    arabic_roots = []
    for root in roots:
        if any('\u0600' <= char <= '\u06FF' for char in root):
            arabic_roots.append(root)
        else:
            arabic_root = buckwalter_to_arabic(root)
            arabic_roots.append(arabic_root)
    return arabic_roots