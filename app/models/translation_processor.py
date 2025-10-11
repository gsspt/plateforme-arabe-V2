# app/models/translation_processor.py
import json
import time
import re
import os
import logging
from datetime import datetime
import requests
from requests.exceptions import RequestException, Timeout
from ..config import Config

logger = logging.getLogger(__name__)

class TranslationProcessor:
    """Processeur de traduction avec sauvegarde granulaire"""
    
    def translate_ocr_text_with_progress(self, ocr_text, context=None, progress_callback=None):
        """Traduction avec progression en temps réel améliorée"""
        if not ocr_text or not ocr_text.strip():
            return {"error": "Aucun texte à traduire"}
        
        translation_context = self.prepare_translation_context(context)
        segments = self.segment_ocr_text(ocr_text)
        
        logger.info(f"Traduction de {len(segments)} segments...")
        
        translated_segments = []
        total_segments = len(segments)
        
        # ✅ PHASE 1: Préparation (10%)
        if progress_callback:
            progress_callback({
                'current': 0,
                'total': total_segments,
                'percent': 5,
                'segment_preview': 'Préparation de la traduction...',
                'status': 'preparing'
            })
        
        time.sleep(0.5)  # Simulation préparation
        
        # ✅ PHASE 2: Traduction segment par segment (10% à 90%)
        for i, segment in enumerate(segments, 1):
            if progress_callback:
                # Progression plus réaliste : 10% + (80% répartis sur les segments)
                base_progress = 10
                segment_progress = (i / total_segments) * 80
                total_progress = base_progress + segment_progress
                
                progress_callback({
                    'current': i,
                    'total': total_segments,
                    'percent': min(total_progress, 90),  # Max 90% avant assemblage
                    'segment_preview': segment[:80] + '...' if len(segment) > 80 else segment,
                    'status': 'translating'
                })
            
            logger.info(f"Traduction segment {i}/{total_segments}")
            translated = self.translate_segment(segment, translation_context)
            translated_segments.append(translated)
            
            # Respect des limites de rate
            if i < total_segments:
                time.sleep(self.base_delay)
        
        # ✅ PHASE 3: Assemblage final (90% à 100%)
        if progress_callback:
            progress_callback({
                'current': total_segments,
                'total': total_segments,
                'percent': 95,
                'segment_preview': 'Assemblage final...',
                'status': 'assembling'
            })
        
        # Assemblage final
        full_translation = "\n\n".join(translated_segments)
        
        result = {
            "success": True,
            "original_text": ocr_text,
            "translated_text": full_translation,
            "segment_count": total_segments,
            "char_count_original": len(ocr_text),
            "char_count_translated": len(full_translation),
            "context_used": translation_context
        }
        
        # ✅ PHASE 4: Terminé (100%)
        if progress_callback:
            progress_callback({
                'current': total_segments,
                'total': total_segments,
                'percent': 100,
                'segment_preview': 'Traduction terminée!',
                'status': 'completed',
                'result': result  # ✅ INCLURE LE RÉSULTAT ICI
            })
    
        return result


    def __init__(self):
        self.api_key = Config.DEEPSEEK_API_KEY
        self.available = bool(self.api_key)
        self.max_tokens = Config.TRANSLATION_MAX_TOKENS
        self.timeout = Config.TRANSLATION_TIMEOUT
        self.base_delay = 2
        self.max_retries = 3
        
    def prepare_translation_context(self, user_context=None):
        """Prépare le contexte de traduction"""
        if user_context:
            return user_context
            
        # Contexte par défaut pour l'arabe
        return {
            'langue_source': 'arabe',
            'langue_cible': 'français', 
            'auteur': 'Texte arabe',
            'titre': 'Document OCR',
            'sujet': 'Texte littéraire',
            'genre': 'Littérature',
            'niveau_langue': 'Standard'
        }
    
    def segment_ocr_text(self, text, max_length=1500):
        """Segmente le texte OCR pour la traduction"""
        if len(text) <= max_length:
            return [text]
        
        segments = []
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        current_segment = ""
        for para in paragraphs:
            if len(current_segment) + len(para) + 2 > max_length:
                if current_segment:
                    segments.append(current_segment.strip())
                    current_segment = ""
            
            if len(para) > max_length:
                # Segmenter le paragraphe long
                sentences = re.split(r'[.!?]+', para)
                current_sentence = ""
                
                for sentence in sentences:
                    sentence = sentence.strip()
                    if not sentence:
                        continue
                        
                    if len(current_sentence) + len(sentence) + 1 > max_length:
                        if current_sentence:
                            segments.append(current_sentence.strip())
                            current_sentence = ""
                    
                    current_sentence += sentence + ". "
                
                if current_sentence:
                    if len(current_segment) + len(current_sentence) > max_length:
                        if current_segment:
                            segments.append(current_segment.strip())
                            current_segment = current_sentence
                        else:
                            segments.append(current_sentence.strip())
                    else:
                        current_segment += current_sentence + "\n\n"
            else:
                current_segment += para + "\n\n"
        
        if current_segment:
            segments.append(current_segment.strip())
            
        return segments
    
    def create_translation_prompt(self, segment, context):
        """Crée le prompt de traduction"""
        return f"""
TRADUCTION CONTEXTUALISÉE - INSTRUCTIONS STRICTES

INFORMATIONS:
- Auteur: {context['auteur']}
- Titre: {context['titre']} 
- Sujet: {context['sujet']}
- Genre: {context['genre']}
- Niveau: {context['niveau_langue']}
- De {context['langue_source']} vers {context['langue_cible']}

INSTRUCTIONS:
1. Traduisez EXCLUSIVEMENT le texte
2. Pour les termes ambigus: [*note : *mot en arabe* - explication détaillée*] après le terme  
3. AUCUN commentaire, introduction ou texte supplémentaire en dehors des notes
4. Fidèle au style et niveau de langue

TEXTE À TRADUIRE:
{segment}

TRADUCTION (uniquement le texte traduit):
"""
    
    def translate_segment(self, segment, context):
        """Traduit un segment de texte"""
        if not self.available:
            return "[Traduction non disponible - API key manquante]"
            
        prompt = self.create_translation_prompt(segment, context)
        
        for attempt in range(self.max_retries):
            try:
                response = requests.post(
                    "https://api.deepseek.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": "deepseek-chat",
                        "messages": [
                            {
                                "role": "system", 
                                "content": "Vous êtes un traducteur expert. Fournissez UNIQUEMENT la traduction avec notes pour termes ambigus. AUCUN commentaire supplémentaire."
                            },
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.3,
                        "max_tokens": self.max_tokens
                    },
                    timeout=self.timeout
                )
                response.raise_for_status()
                
                result = response.json()['choices'][0]['message']['content'].strip()
                
                # Nettoyage du résultat
                lines = result.split('\n')
                clean_lines = []
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    if any(keyword in line.lower() for keyword in ['voici', 'traduction', 'résultat']) and len(line) < 100:
                        continue
                    clean_lines.append(line)
                
                return '\n'.join(clean_lines).strip()
                
            except Timeout:
                if attempt == self.max_retries - 1:
                    return f"[Timeout après {self.max_retries} tentatives]"
                time.sleep(self.base_delay * (2 ** attempt))
                
            except RequestException as e:
                if attempt == self.max_retries - 1:
                    return f"[Erreur API: {str(e)}]"
                time.sleep(self.base_delay * (2 ** attempt))
                
            except Exception as e:
                if attempt == self.max_retries - 1:
                    return f"[Erreur: {str(e)}]"
                time.sleep(self.base_delay * (2 ** attempt))
        
        return "[Échec de la traduction]"
    
    def translate_ocr_text(self, ocr_text, context=None):
        """Traduit le texte OCR complet"""
        if not ocr_text or not ocr_text.strip():
            return {"error": "Aucun texte à traduire"}
        
        translation_context = self.prepare_translation_context(context)
        segments = self.segment_ocr_text(ocr_text)
        
        logger.info(f"Traduction de {len(segments)} segments...")
        
        translated_segments = []
        total_segments = len(segments)
        
        for i, segment in enumerate(segments, 1):
            logger.info(f"Traduction segment {i}/{total_segments}")
            translated = self.translate_segment(segment, translation_context)
            translated_segments.append(translated)
            
            # Respect des limites de rate
            if i < total_segments:
                time.sleep(self.base_delay)
        
        # Assemblage final
        full_translation = "\n\n".join(translated_segments)
        
        return {
            "success": True,
            "original_text": ocr_text,
            "translated_text": full_translation,
            "segment_count": total_segments,
            "char_count_original": len(ocr_text),
            "char_count_translated": len(full_translation),
            "context_used": translation_context
        }