import requests
import base64
import io
import os
import tempfile
from PIL import Image
import fitz  # PyMuPDF
import time
import logging
from ..config import Config

logger = logging.getLogger(__name__)

class OCRProcessor:
    """Processeur OCR avec Google Vision API"""
    
    def __init__(self):
        self.api_key = Config.GOOGLE_API_KEY
        self.base_url = "https://vision.googleapis.com/v1/images:annotate"
        self.available = self._validate_api_key()
        
    def _validate_api_key(self):
        """Valide la clé API Google Vision"""
        if not self.api_key:
            logger.error("GOOGLE_API_KEY non configurée")
            return False
        
        logger.info("✅ Google Vision OCR configuré")
        return True
    
    def process_pdf_file(self, file):
        """Traite un PDF avec Google Vision OCR"""
        if not self.available:
            return self._get_configuration_error()
        
        if not file or file.filename == '':
            return "❌ Aucun fichier reçu"
        
        logger.info(f"📄 Début du traitement: {file.filename}")
        
        file.seek(0)
        tmp_path = None
        
        try:
            # Sauvegarde temporaire
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
                file.save(tmp_file.name)
                tmp_path = tmp_file.name
            
            # Vérification taille
            file_size = os.path.getsize(tmp_path)
            if file_size == 0:
                return "❌ Le fichier PDF est vide"
            
            logger.info(f"📊 Taille du fichier: {file_size} bytes")
            
            # Conversion PDF en images
            images = self._pdf_to_images(tmp_path)
            
            if not images:
                return "❌ Impossible de convertir le PDF en images"
            
            logger.info(f"🖼️ {len(images)} page(s) convertie(s)")
            
            # Traitement OCR
            all_text = []
            total_pages = len(images)
            successful_pages = 0
            
            for page_num, image in enumerate(images, 1):
                logger.info(f"🔍 OCR page {page_num}/{total_pages}")
                page_text = self._process_image_with_google_vision(image)
                
                if page_text and page_text.strip() and "[Erreur" not in page_text and "[Aucun" not in page_text:
                    all_text.append(f"--- Page {page_num} ---\n{page_text}\n")
                    successful_pages += 1
                    logger.info(f"✅ Page {page_num} traitée: {len(page_text)} caractères")
                else:
                    all_text.append(f"--- Page {page_num} ---\n{page_text}\n")
                    logger.warning(f"⚠️ Page {page_num}: {page_text}")
                
                time.sleep(0.2)  # Respect des quotas
            
            final_text = "\n".join(all_text)
            return self._format_success_response(final_text, total_pages, successful_pages, file.filename)
            
        except Exception as e:
            logger.error(f"❌ Erreur traitement PDF: {str(e)}")
            return f"❌ Erreur lors du traitement: {str(e)}"
        
        finally:
            # Nettoyage
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    def _pdf_to_images(self, pdf_path, dpi=200):
        """Convertit un PDF en liste d'images PIL"""
        try:
            doc = fitz.open(pdf_path)
            
            if len(doc) == 0:
                doc.close()
                return None
            
            images = []
            
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                
                if page.rect.width == 0 or page.rect.height == 0:
                    logger.warning(f"Page {page_num+1} a une taille nulle")
                    continue
                
                mat = fitz.Matrix(dpi/72, dpi/72)
                pix = page.get_pixmap(matrix=mat)
                
                img_data = pix.tobytes("ppm")
                image = Image.open(io.BytesIO(img_data))
                images.append(image)
            
            doc.close()
            
            if not images:
                return None
                
            return images
            
        except Exception as e:
            logger.error(f"❌ Erreur conversion PDF: {e}")
            return None
    
    def _process_image_with_google_vision(self, image):
        """Traite une image avec Google Vision OCR optimisé pour l'arabe"""
        try:
            optimized_image = self._optimize_image_for_ocr(image)
            
            # Conversion base64
            img_byte_arr = io.BytesIO()
            optimized_image.save(img_byte_arr, format='JPEG', quality=90)
            image_content = base64.b64encode(img_byte_arr.getvalue()).decode()
            
            # Requête Google Vision
            request_data = {
                "requests": [{
                    "image": {"content": image_content},
                    "features": [{
                        "type": "DOCUMENT_TEXT_DETECTION",
                        "maxResults": 1
                    }],
                    "imageContext": {
                        "languageHints": ["ar"]
                    }
                }]
            }
            
            response = requests.post(
                f"{self.base_url}?key={self.api_key}",
                json=request_data,
                timeout=60
            )
            
            if response.status_code == 200:
                data = response.json()
                text = self._extract_text_from_response(data)
                if text and text.strip():
                    return text.strip()
                else:
                    return "[Aucun texte détecté]"
            else:
                error_msg = self._handle_api_error(response)
                return f"[Erreur OCR: {error_msg}]"
                
        except Exception as e:
            logger.error(f"❌ Erreur traitement image: {e}")
            return f"[Erreur: {str(e)}]"
    
    def _optimize_image_for_ocr(self, image):
        """Optimise l'image pour l'OCR"""
        try:
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            max_size = 1600
            if max(image.size) > max_size:
                ratio = max_size / max(image.size)
                new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                image = image.resize(new_size, Image.Resampling.LANCZOS)
            
            return image
            
        except Exception as e:
            logger.warning(f"⚠️ Erreur optimisation image: {e}")
            return image
    
    def _extract_text_from_response(self, data):
        """Extrait le texte de la réponse Google Vision"""
        try:
            if 'responses' in data and data['responses']:
                response = data['responses'][0]
                
                full_text = response.get('fullTextAnnotation', {}).get('text', '')
                if full_text and full_text.strip():
                    return full_text.strip()
                
                text_annotations = response.get('textAnnotations', [])
                if text_annotations:
                    text = text_annotations[0].get('description', '')
                    if text.strip():
                        return text.strip()
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Erreur extraction texte: {e}")
            return None
    
    def _handle_api_error(self, response):
        """Gère les erreurs de l'API Google Vision"""
        try:
            error_data = response.json()
            error_msg = error_data.get('error', {}).get('message', 'Erreur inconnue')
            return f"{response.status_code}: {error_msg}"
        except:
            return f"Erreur HTTP {response.status_code}"
    
    def _format_success_response(self, text, total_pages, successful_pages, filename):
        """Formate une réponse de succès"""
        char_count = len(text)
        word_count = len(text.split())
        
        return f"""OCR GOOGLE VISION - TRAITEMENT TERMINÉ

Document: {filename}
Pages totales: {total_pages}
Pages avec texte: {successful_pages}
Caractères extraits: {char_count}
Mots détectés: {word_count}
Langue: Arabe (optimisé Google Vision)

{'='*50}
{text}
{'='*50}
"""

    def _get_configuration_error(self):
        return "❌ Google Vision OCR non configuré"