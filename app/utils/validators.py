import re
import os
from werkzeug.utils import secure_filename
from ..config import Config

def validate_arabic_word(word):
    """
    Valide un mot arabe
    Retourne (is_valid, error_message)
    """
    if not word or not word.strip():
        return False, "Veuillez entrer un mot"
    
    # Nettoyer le mot
    word = word.strip()
    
    # Vérifier la longueur
    if len(word) > 50:
        return False, "Le mot est trop long (max 50 caractères)"
    
    # Vérifier les caractères autorisés (arabe, latin, chiffres, espaces)
    arabic_pattern = re.compile(r'^[\u0600-\u06FF\sA-Za-z0-9]+$')
    if not arabic_pattern.match(word):
        return False, "Caractères non autorisés détectés"
    
    return True, None

def validate_file_upload(file):
    """
    Valide un fichier uploadé
    Retourne (is_valid, error_message, secure_filename)
    """
    if not file or file.filename == '':
        return False, "Aucun fichier sélectionné", None
    
    # Vérifier l'extension
    if not allowed_file(file.filename):
        return False, "Type de fichier non autorisé. Seuls les PDF sont acceptés.", None
    
    # Vérifier la taille
    if file.content_length > Config.MAX_CONTENT_LENGTH:
        return False, f"Fichier trop volumineux (max {Config.MAX_CONTENT_LENGTH // 1024 // 1024}MB)", None
    
    # Sécuriser le nom de fichier
    filename = secure_filename(file.filename)
    
    return True, None, filename

def allowed_file(filename):
    """Vérifie si l'extension du fichier est autorisée"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

def sanitize_input(text):
    """Nettoie et sécurise l'entrée utilisateur"""
    if not text:
        return ""
    
    # Supprimer les balises HTML
    text = re.sub(r'<[^>]*>', '', text)
    
    # Échapper les caractères spéciaux
    text = text.replace('"', '\\"').replace("'", "\\'")
    
    # Limiter la longueur
    text = text[:1000]
    
    return text.strip()