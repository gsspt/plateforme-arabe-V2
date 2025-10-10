// app/static/js/translation.js - Version complète avec progression
class TranslationManager {
    constructor() {
        this.apiUrl = '/api/translate';
        this.isTranslating = false;
        this.currentTranslation = null;
        this.currentOCRText = '';
        this.debug = true; // ✅ Activer le debug
        this.initializeTranslationUI();
        this.setupEventListeners();
        this.log('🚀 TranslationManager initialisé');
    }

    log(...args) {
        if (this.debug) {
            console.log('🔧 [Translation]', ...args);
        }
    }

    error(...args) {
        console.error('❌ [Translation]', ...args);
    }

    warn(...args) {
        console.warn('⚠️ [Translation]', ...args);
    }

    initializeTranslationUI() {
        this.log('Initialisation de l\'interface traduction');
        this.hideTranslationSection();
    }

    setupEventListeners() {
        this.log('Configuration des écouteurs d\'événements');
        this.setupOCRResultsObserver();
        this.loadSavedContext();
    }

    setupOCRResultsObserver() {
        this.log('Configuration de l\'observer OCR');
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    const results = document.getElementById('results');
                    if (results && !results.classList.contains('hidden')) {
                        this.log('📝 Résultats OCR détectés');
                        this.showTranslationSection();
                        this.extractOCRText();
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    extractOCRText() {
        const textOutput = document.getElementById('textOutput');
        if (textOutput) {
            this.currentOCRText = textOutput.textContent || textOutput.innerText;
            this.log(`Texte OCR extrait: ${this.currentOCRText.length} caractères`);
            this.log('Preview texte:', this.currentOCRText.substring(0, 100) + '...');
        } else {
            this.warn('Element textOutput non trouvé');
        }
    }

    showTranslationSection() {
        const section = document.getElementById('translationSection');
        if (section) {
            section.style.display = 'block';
            // Scroll doux vers la section traduction
            setTimeout(() => {
                section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 300);
        }
    }

    hideTranslationSection() {
        const section = document.getElementById('translationSection');
        if (section) {
            section.style.display = 'none';
        }
    }

    async translateText() {
        this.log('🔄 Début de la traduction avec progression');
        
        if (!this.currentOCRText || !this.currentOCRText.trim()) {
            this.error('Aucun texte à traduire');
            Utils.showNotification('Aucun texte à traduire', 'error');
            return;
        }

        this.log(`Texte à traduire: "${this.currentOCRText.substring(0, 50)}..."`);

        // Vérifier que l'API est disponible
        const isAvailable = await this.checkTranslationAvailability();
        this.log(`Disponibilité API: ${isAvailable}`);
        
        if (!isAvailable) {
            this.error('Service de traduction non disponible');
            this.showTranslationError('Service de traduction non disponible');
            return;
        }

        this.showTranslationLoading();
        this.hideTranslationError();
        this.hideTranslationResults();
        
        // ✅ Afficher la barre de progression détaillée
        this.showProgressBar();

        try {
            const context = this.getTranslationContext();
            const sessionId = this.generateSessionId();
            
            this.log('Contexte de traduction:', context);
            this.log('Démarrage traduction avec session:', sessionId);

            const requestBody = {
                text: this.currentOCRText,
                context: context
            };
            
            this.log('Envoi requête API...', {
                url: '/api/translate-with-progress',
                textLength: this.currentOCRText.length,
                context: context
            });

            // ✅ UTILISER LE SYSTÈME AVEC PROGRESSION
            const startResponse = await fetch('/api/translate-with-progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: this.currentOCRText,
                    context: context,
                    session_id: sessionId
                })
            });

            const startData = await startResponse.json();
            
            if (!startResponse.ok) {
                throw new Error(startData.error || 'Erreur démarrage traduction');
            }

            this.log('Traduction démarrée avec session:', sessionId);

            // ✅ Surveiller la progression en temps réel
            await this.monitorProgress(sessionId);
            
        } catch (error) {
            this.error('Erreur traduction:', error);
            this.showTranslationError(error.message);
            this.hideProgressBar();
        } finally {
            this.hideTranslationLoading();
            this.log('Processus de traduction terminé');
        }
    }

    async checkTranslationAvailability() {
        try {
            this.log('Vérification disponibilité API...');
            const response = await fetch('/api/translate', {
                method: 'OPTIONS',
                timeout: 5000
            });
            const isAvailable = response.ok;
            this.log(`API disponible: ${isAvailable}`);
            return isAvailable;
        } catch (error) {
            this.error('API non disponible:', error);
            return false;
        }
    }

    getTranslationContext() {
        return {
            auteur: document.getElementById('contextAuthor')?.value || 'Texte arabe',
            titre: document.getElementById('contextTitle')?.value || 'Document OCR',
            sujet: document.getElementById('contextSubject')?.value || 'Texte littéraire',
            genre: document.getElementById('contextGenre')?.value || 'Littérature',
            niveau_langue: document.getElementById('contextLevel')?.value || 'Standard',
            langue_source: 'arabe',
            langue_cible: 'français'
        };
    }

    showTranslationLoading() {
        const loading = document.getElementById('translationLoading');
        const translateBtn = document.getElementById('translateBtn');
        
        if (loading) loading.classList.remove('hidden');
        if (translateBtn) {
            const btnText = translateBtn.querySelector('.btn-text');
            const btnSpinner = translateBtn.querySelector('.btn-spinner');
            
            if (btnText) btnText.textContent = 'Traduction en cours...';
            if (btnSpinner) btnSpinner.classList.remove('hidden');
            translateBtn.disabled = true;
        }
    }

    hideTranslationLoading() {
        const loading = document.getElementById('translationLoading');
        const translateBtn = document.getElementById('translateBtn');
        
        if (loading) loading.classList.add('hidden');
        if (translateBtn) {
            const btnText = translateBtn.querySelector('.btn-text');
            const btnSpinner = translateBtn.querySelector('.btn-spinner');
            
            if (btnText) btnText.textContent = '🔄 Traduire en Français';
            if (btnSpinner) btnSpinner.classList.add('hidden');
            translateBtn.disabled = false;
        }
    }

    showTranslationError(message) {
        const errorDiv = document.getElementById('translationError');
        if (errorDiv) {
            errorDiv.innerHTML = `
                <div class="error-content">
                    <span class="error-icon">❌</span>
                    <div class="error-details">
                        <h4>Erreur de traduction</h4>
                        <p>${this.escapeHtml(message)}</p>
                    </div>
                </div>
            `;
            errorDiv.classList.remove('hidden');
        }
    }

    hideTranslationError() {
        const errorDiv = document.getElementById('translationError');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    }

// Dans translation.js - AMÉLIORER displayTranslationResults
    displayTranslationResults(data) {
        const resultsDiv = document.getElementById('translationResults');
        const outputDiv = document.getElementById('translationOutput');

        if (resultsDiv && outputDiv) {
            this.log('Affichage des résultats de traduction:', data);
            
            // ✅ MIEUX VÉRIFIER LA TRADUCTION
            let translationText = '';
            
            if (data && data.translation) {
                translationText = data.translation;
            } else if (data && data.translated_text) {
                translationText = data.translated_text;
            } else if (data && data.result && data.result.translated_text) {
                translationText = data.result.translated_text;
            }
            
            if (!translationText || !translationText.trim()) {
                this.error('Aucune traduction dans les données:', data);
                outputDiv.innerHTML = '<em style="color: #dc3545;">Erreur: Aucune traduction reçue du serveur</em>';
            } else {
                outputDiv.innerHTML = this.formatTranslationText(translationText);
                this.log(`✅ Traduction affichée: ${translationText.length} caractères`);
                
                // ✅ SAUVEGARDER CORRECTEMENT LA TRADUCTION
                this.currentTranslation = {
                    translation: translationText,
                    metadata: data.metadata || data.result || {}
                };
            }
            
            resultsDiv.classList.remove('hidden');

            // Faire défiler jusqu'aux résultats
            setTimeout(() => {
                resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }

    hideTranslationResults() {
        const resultsDiv = document.getElementById('translationResults');
        if (resultsDiv) {
            resultsDiv.classList.add('hidden');
        }
    }

    formatTranslationText(text) {
        if (!text) return '<em style="color: #6c757d;">Aucune traduction disponible</em>';
        
        // Nettoyer le texte des éventuels artefacts
        const cleanText = text.replace(/\[\*([^*]+)\*\]/g, '<strong>[$1]</strong>');
        
        return cleanText
            .split('\n')
            .map(line => {
                const trimmedLine = line.trim();
                if (!trimmedLine) return '<br>';
                if (trimmedLine.startsWith('---')) {
                    return `<div class="translation-section-break">${trimmedLine}</div>`;
                }
                return `<div class="translation-line">${trimmedLine}</div>`;
            })
            .join('');
    }

    showContextModal() {
        const contextDiv = document.getElementById('translationContext');
        if (contextDiv) {
            contextDiv.style.display = 'block';
        }
    }

    hideContext() {
        const contextDiv = document.getElementById('translationContext');
        if (contextDiv) {
            contextDiv.style.display = 'none';
        }
    }

    saveContext() {
        const context = this.getTranslationContext();
        try {
            localStorage.setItem('translationContext', JSON.stringify(context));
            Utils.showNotification('Contexte sauvegardé', 'success');
            this.hideContext();
        } catch (error) {
            Utils.showNotification('Erreur sauvegarde contexte', 'error');
        }
    }

    loadSavedContext() {
        try {
            const saved = localStorage.getItem('translationContext');
            if (saved) {
                const context = JSON.parse(saved);
                this.populateContextFields(context);
                this.log('Contexte chargé depuis le stockage local');
            }
        } catch (error) {
            this.warn('Erreur chargement contexte:', error);
        }
    }

    populateContextFields(context) {
        const fields = {
            'contextAuthor': context.auteur,
            'contextTitle': context.titre,
            'contextSubject': context.sujet,
            'contextGenre': context.genre,
            'contextLevel': context.niveau_langue
        };

        Object.entries(fields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element && value) {
                element.value = value;
            }
        });
    }

    async copyTranslation() {
        const outputDiv = document.getElementById('translationOutput');
        if (!outputDiv) {
            Utils.showNotification('Aucune traduction à copier', 'error');
            return;
        }

        const text = outputDiv.textContent || outputDiv.innerText;

        if (!text.trim()) {
            Utils.showNotification('Aucune traduction à copier', 'error');
            return;
        }

        const success = await Utils.copyToClipboard(text);
        if (success) {
            Utils.showNotification('Traduction copiée', 'success');
            
            // Animation de feedback sur le bouton
            const copyBtn = document.querySelector('button[onclick="translationManager.copyTranslation()"]');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '✅ Copié!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }
        }
    }

    downloadTranslation() {
        const outputDiv = document.getElementById('translationOutput');
        if (!outputDiv) {
            Utils.showNotification('Aucune traduction à télécharger', 'error');
            return;
        }

        const text = outputDiv.textContent || outputDiv.innerText;
        const fileName = 'traduction-arabe-francais.txt';

        if (!text.trim()) {
            Utils.showNotification('Aucune traduction à télécharger', 'error');
            return;
        }

        try {
            const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            Utils.showNotification('Traduction téléchargée', 'success');
        } catch (error) {
            Utils.showNotification('Erreur téléchargement', 'error');
        }
    }

    // ✅ MÉTHODES POUR L'EXPORT WORD

    async exportOCRWord() {
        const textOutput = document.getElementById('textOutput');
        const ocrText = textOutput.textContent || textOutput.innerText;

        if (!ocrText.trim()) {
            Utils.showNotification('Aucun texte OCR à exporter', 'error');
            return;
        }

        try {
            this.log('Export OCR vers Word...');
            const response = await fetch('/api/export/ocr-word', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: ocrText
                })
            });

            // ✅ MIEUX GÉRER LES RÉPONSES D'ERREUR
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
            }

            // ✅ VÉRIFIER QUE LA RÉPONSE EST BIEN UN FICHIER
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/vnd.openxmlformats-officedocument')) {
                throw new Error('Réponse invalide du serveur');
            }

            // Téléchargement automatique
            const blob = await response.blob();
            
            // ✅ VÉRIFIER LA TAILLE DU BLOB
            if (blob.size === 0) {
                throw new Error('Fichier vide reçu');
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ocr_${new Date().toISOString().slice(0, 10)}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            Utils.showNotification('Document Word OCR exporté', 'success');
            this.log('Export OCR Word réussi');
            
        } catch (error) {
            this.error('Erreur export OCR:', error);
            Utils.showNotification(`Erreur export: ${error.message}`, 'error');
        }
    }

    async exportTranslationWord() {
        // ✅ VÉRIFIER CORRECTEMENT LA TRADUCTION
        const outputDiv = document.getElementById('translationOutput');
        const translatedText = outputDiv ? (outputDiv.textContent || outputDiv.innerText) : '';
        
        if (!translatedText || !translatedText.trim() || translatedText.includes('Aucune traduction disponible')) {
            Utils.showNotification('Aucune traduction à exporter', 'error');
            return;
        }

        try {
            this.log('Export traduction vers Word...');
            const context = this.getTranslationContext();
            
            // ✅ UTILISER LE TEXTE AFFICHÉ PLUTÔT QUE currentTranslation
            const response = await fetch('/api/export/translation-word', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    original_text: this.currentOCRText,
                    translated_text: translatedText,  // ✅ TEXTE AFFICHÉ
                    context: context
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
            }

            // Téléchargement automatique
            const blob = await response.blob();
            
            if (blob.size === 0) {
                throw new Error('Fichier vide reçu');
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `traduction_${new Date().toISOString().slice(0, 10)}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            Utils.showNotification('Document Word de traduction exporté', 'success');
            this.log('Export traduction Word réussi');
            
        } catch (error) {
            this.error('Erreur export traduction:', error);
            Utils.showNotification(`Erreur export: ${error.message}`, 'error');
        }
    }

    // ✅ MÉTHODES POUR LA BARRE DE PROGRESSION
    showProgressBar() {
        let progressContainer = document.getElementById('detailedProgress');
        
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'detailedProgress';
            progressContainer.className = 'progress-container';
            progressContainer.innerHTML = `
                <div class="progress-header">
                    <h4> Progression de la Traduction</h4>
                    <button class="btn btn-secondary btn-sm" onclick="translationManager.minimizeProgress()">−</button>
                </div>
                <div class="progress-content">
                    <div class="progress-stats">
                        <span id="progressText">Initialisation...</span>
                        <span id="progressPercent">0%</span>
                    </div>
                    <div class="progress-bar-detailed">
                        <div class="progress-fill-detailed" id="progressFill"></div>
                    </div>
                    <div class="segment-preview" id="segmentPreview">
                        <small>Segment en cours: <span id="currentSegment">-</span></small>
                    </div>
                    <div class="progress-actions">
                        <button class="btn btn-secondary btn-sm" onclick="translationManager.continueBrowsing()">
                             Continuer à naviguer
                        </button>
                    </div>
                </div>
            `;
            
            const translationSection = document.getElementById('translationSection');
            if (translationSection) {
                translationSection.appendChild(progressContainer);
            }
        }
        
        progressContainer.style.display = 'block';
        this.log('Barre de progression affichée');
    }

    async monitorProgress(sessionId) {
        const maxAttempts = 300; // 15 minutes max (3s * 300)
        let attempts = 0;
        
        const checkProgress = async () => {
            attempts++;
            
            if (attempts > maxAttempts) {
                throw new Error('Délai de traduction dépassé');
            }
            
            try {
                const response = await fetch(`/api/translation-progress/${sessionId}`);
                const progress = await response.json();
                
                this.log(`Progression [${attempts}/${maxAttempts}]:`, progress);
                
                if (progress.status === 'completed') {
                    this.log(' Traduction terminée avec succès');
                    this.displayTranslationResults(progress.result);
                    this.hideProgressBar();
                    Utils.showNotification('Traduction terminée avec succès', 'success');
                    return;
                }
                
                if (progress.status === 'error') {
                    throw new Error(progress.error || 'Erreur pendant la traduction');
                }
                
                // Mettre à jour l'interface de progression
                this.updateProgressUI(progress);
                
                // Continuer à surveiller
                setTimeout(checkProgress, 3000); // Vérifier toutes les 3 secondes
                
            } catch (error) {
                this.error('Erreur surveillance progression:', error);
                this.showTranslationError(error.message);
                this.hideProgressBar();
            }
        };
        
        await checkProgress();
    }

    updateProgressUI(progress) {
        const progressText = document.getElementById('progressText');
        const progressPercent = document.getElementById('progressPercent');
        const progressFill = document.getElementById('progressFill');
        const currentSegment = document.getElementById('currentSegment');
        
        if (progressText) {
            progressText.textContent = `Segment ${progress.current || 0}/${progress.total || '?'}`;
        }
        
        if (progressPercent) {
            const percent = progress.percent || 0;
            progressPercent.textContent = `${Math.round(percent)}%`;
        }
        
        if (progressFill) {
            const percent = progress.percent || 0;
            progressFill.style.width = `${percent}%`;
            
            // Animation de couleur selon la progression
            if (percent < 30) {
                progressFill.style.background = 'linear-gradient(90deg, #dc3545, #c82333)';
            } else if (percent < 70) {
                progressFill.style.background = 'linear-gradient(90deg, #ffc107, #e0a800)';
            } else {
                progressFill.style.background = 'linear-gradient(90deg, #28a745, #218838)';
            }
        }
        
        if (currentSegment && progress.segment_preview) {
            const preview = progress.segment_preview.length > 50 
                ? progress.segment_preview.substring(0, 50) + '...' 
                : progress.segment_preview;
            currentSegment.textContent = preview;
        }
    }

    hideProgressBar() {
        const progressContainer = document.getElementById('detailedProgress');
        if (progressContainer) {
            progressContainer.style.display = 'none';
            this.log('Barre de progression cachée');
        }
    }

    minimizeProgress() {
        const progressContainer = document.getElementById('detailedProgress');
        if (progressContainer) {
            progressContainer.classList.toggle('minimized');
            const isMinimized = progressContainer.classList.contains('minimized');
            this.log(`Barre de progression ${isMinimized ? 'minimisée' : 'déployée'}`);
        }
    }

    continueBrowsing() {
        Utils.showNotification('La traduction continue en arrière-plan', 'info');
        this.log('Utilisateur continue à naviguer pendant la traduction');
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Méthode utilitaire pour échapper le HTML
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Méthode pour réinitialiser complètement
    reset() {
        this.currentOCRText = '';
        this.currentTranslation = null;
        this.hideTranslationSection();
        this.hideTranslationResults();
        this.hideTranslationError();
        this.hideProgressBar();
        this.log('TranslationManager réinitialisé');
    }
}

// Fonctions globales pour la traduction
function showTranslationContext() {
    if (window.translationManager) {
        window.translationManager.showContextModal();
    }
}

function hideTranslationContext() {
    if (window.translationManager) {
        window.translationManager.hideContext();
    }
}

function saveTranslationContext() {
    if (window.translationManager) {
        window.translationManager.saveContext();
    }
}

function copyTranslation() {
    if (window.translationManager) {
        window.translationManager.copyTranslation();
    }
}

function downloadTranslation() {
    if (window.translationManager) {
        window.translationManager.downloadTranslation();
    }
}

// ✅ NOUVELLES FONCTIONS GLOBALES POUR L'EXPORT
function exportOCRWord() {
    if (window.translationManager) {
        window.translationManager.exportOCRWord();
    }
}

function exportTranslationWord() {
    if (window.translationManager) {
        window.translationManager.exportTranslationWord();
    }
}

// Initialisation globale
let translationManager;

if (document.getElementById('translationSection')) {
    document.addEventListener('DOMContentLoaded', () => {
        translationManager = new TranslationManager();
        window.translationManager = translationManager;
        
        console.log('✅ TranslationManager initialisé avec progression et export Word');
    });
}