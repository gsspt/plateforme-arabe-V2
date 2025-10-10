// ocr.js - Gestionnaire OCR V2
class OCRProcessor {
    constructor() {
        this.apiUrl = '/api/ocr-process';
        this.currentFile = null;
        this.initializeEventListeners();
        this.setupDragAndDrop();
    }

    initializeEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const pdfInput = document.getElementById('pdfInput');
        const processBtn = document.getElementById('processBtn');

        // Gestion du click sur la zone d'upload
        uploadArea.addEventListener('click', () => {
            pdfInput.click();
        });

        // Gestion de la sélection de fichier
        pdfInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // Touche Entrée sur le bouton de traitement
        processBtn.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !processBtn.disabled) {
                this.processOCR();
            }
        });
    }

    setupDragAndDrop() {
        const uploadArea = document.getElementById('uploadArea');

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });
    }

    handleFileSelect(file) {
        // Validation du fichier
        if (!file.type.includes('pdf')) {
            Utils.showNotification('Veuillez sélectionner un fichier PDF', 'error');
            return;
        }

        if (file.size > 16 * 1024 * 1024) {
            Utils.showNotification('Le fichier est trop volumineux (max 16MB)', 'error');
            return;
        }

        this.currentFile = file;
        this.displayFileInfo(file);
        this.updateProcessButton(true);
        this.hideError();
        
        Utils.showNotification(`Fichier "${file.name}" sélectionné`, 'success');
    }

    displayFileInfo(file) {
        const fileInfo = document.getElementById('fileInfo');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');

        fileName.textContent = file.name;
        fileSize.textContent = Utils.formatFileSize(file.size);
        fileInfo.style.display = 'block';
    }

    updateProcessButton(enabled) {
        const processBtn = document.getElementById('processBtn');
        const btnText = processBtn.querySelector('.btn-text');
        const btnSpinner = processBtn.querySelector('.btn-spinner');

        processBtn.disabled = !enabled;
        
        if (enabled) {
            btnText.textContent = '🚀 Lancer la reconnaissance OCR';
        } else {
            btnText.textContent = 'Sélectionnez un PDF';
        }
    }

    async processOCR() {
        if (!this.currentFile) {
            Utils.showNotification('Veuillez sélectionner un fichier PDF', 'error');
            return;
        }

        this.showLoading();
        this.hideResults();
        this.hideError();

        const formData = new FormData();
        formData.append('pdf_file', this.currentFile);

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors du traitement OCR');
            }

            if (data.error) {
                throw new Error(data.error);
            }

            this.displayResults(data);
            Utils.showNotification('OCR terminé avec succès', 'success');
            
        } catch (error) {
            this.showError(error.message);
            console.error('Error:', error);
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        const loadingDiv = document.getElementById('loading');
        const processBtn = document.getElementById('processBtn');
        const btnText = processBtn.querySelector('.btn-text');
        const btnSpinner = processBtn.querySelector('.btn-spinner');

        loadingDiv.classList.remove('hidden');
        btnText.textContent = 'Traitement en cours...';
        btnSpinner.classList.remove('hidden');
        processBtn.disabled = true;

        // Animation de progression simulée
        this.startProgressAnimation();
    }

    hideLoading() {
        const loadingDiv = document.getElementById('loading');
        const processBtn = document.getElementById('processBtn');
        const btnText = processBtn.querySelector('.btn-text');
        const btnSpinner = processBtn.querySelector('.btn-spinner');

        loadingDiv.classList.add('hidden');
        btnText.textContent = '🚀 Lancer la reconnaissance OCR';
        btnSpinner.classList.add('hidden');
        processBtn.disabled = false;

        this.stopProgressAnimation();
    }

    startProgressAnimation() {
        const progressFill = document.querySelector('.progress-fill');
        if (!progressFill) return;

        let width = 0;
        this.progressInterval = setInterval(() => {
            if (width >= 90) {
                clearInterval(this.progressInterval);
                return;
            }
            width += Math.random() * 10;
            progressFill.style.width = Math.min(width, 90) + '%';
        }, 500);
    }

    stopProgressAnimation() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        const progressFill = document.querySelector('.progress-fill');
        if (progressFill) {
            progressFill.style.width = '100%';
            setTimeout(() => {
                progressFill.style.width = '0%';
            }, 500);
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.innerHTML = `
            <div class="error-content">
                <span class="error-icon">❌</span>
                <div class="error-details">
                    <h4>Erreur de traitement OCR</h4>
                    <p>${message}</p>
                </div>
            </div>
        `;
        errorDiv.classList.remove('hidden');
    }

    hideError() {
        document.getElementById('error').classList.add('hidden');
    }

    hideResults() {
        document.getElementById('results').classList.add('hidden');
    }

    displayResults(data) {
        const resultsDiv = document.getElementById('results');
        const textOutput = document.getElementById('textOutput');
        const charCount = document.getElementById('charCount');

        // Formater le texte avec une meilleure présentation
        const formattedText = this.formatOCRText(data.text);
        textOutput.innerHTML = formattedText;
        charCount.textContent = `${data.char_count} caractères`;
        resultsDiv.classList.remove('hidden');

        // Faire défendre jusqu'aux résultats
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    formatOCRText(text) {
        if (!text) return '<em>Aucun texte extrait</em>';
        
        // Séparer les pages et formater
        const pages = text.split('--- Page');
        let formattedHTML = '';
        
        pages.forEach((page, index) => {
            if (!page.trim()) return;
            
            if (index === 0) {
                // Première partie (sans en-tête de page)
                formattedHTML += `<div class="ocr-page">${this.formatPageText(page)}</div>`;
            } else {
                // Pages suivantes avec en-tête
                const [header, ...content] = page.split('---\n');
                const pageNumber = header ? header.trim() : `Page ${index}`;
                const pageContent = content.join('---\n');
                
                formattedHTML += `
                    <div class="ocr-page">
                        <div class="page-header">📄 ${pageNumber}</div>
                        <div class="page-content">${this.formatPageText(pageContent)}</div>
                    </div>
                `;
            }
        });
        
        return formattedHTML || `<div class="ocr-text">${text}</div>`;
    }

    formatPageText(text) {
        if (!text) return '';
        
        // Nettoyer et formater le texte
        return text
            .split('\n')
            .map(line => {
                if (!line.trim()) return '<br>';
                return `<div class="text-line">${line.trim()}</div>`;
            })
            .join('');
    }

    clearFile() {
        this.currentFile = null;
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('pdfInput').value = '';
        this.updateProcessButton(false);
        this.hideResults();
        this.hideError();
        
        Utils.showNotification('Fichier supprimé', 'info');
    }

    clearResults() {
        document.getElementById('results').classList.add('hidden');
        document.getElementById('textOutput').textContent = '';
        Utils.showNotification('Résultats effacés', 'info');
    }

    async copyToClipboard() {
        const textOutput = document.getElementById('textOutput');
        const text = textOutput.textContent || textOutput.innerText;

        if (!text.trim()) {
            Utils.showNotification('Aucun texte à copier', 'error');
            return;
        }

        const success = await Utils.copyToClipboard(text);
        if (success) {
            // Animation de feedback
            const copyBtn = document.querySelector('button[onclick="copyToClipboard()"]');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ Copié!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }
    }

    downloadText() {
        const textOutput = document.getElementById('textOutput');
        const text = textOutput.textContent || textOutput.innerText;
        const fileName = this.currentFile ? 
            `ocr-${this.currentFile.name.replace('.pdf', '')}.txt` : 
            'texte-extraite.txt';

        if (!text.trim()) {
            Utils.showNotification('Aucun texte à télécharger', 'error');
            return;
        }

        const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Utils.showNotification('Texte téléchargé', 'success');
    }

    // Analyse rapide du texte OCR
    analyzeOCRText() {
        const textOutput = document.getElementById('textOutput');
        const text = textOutput.textContent || textOutput.innerText;
        
        if (!text.trim()) {
            Utils.showNotification('Aucun texte à analyser', 'error');
            return;
        }

        // Extraire le premier mot significatif pour analyse
        const words = text.split(/\s+/).filter(word => 
            word.length > 2 && /[\u0600-\u06FF]/.test(word)
        );

        if (words.length > 0) {
            const firstWord = words[0];
            URLManager.navigateToPage('/analyze', { word: firstWord });
        } else {
            Utils.showNotification('Aucun mot arabe trouvé dans le texte', 'warning');
        }
    }
}

// Fonctions globales pour les événements HTML
let ocrProcessor;

function processOCR() {
    ocrProcessor.processOCR();
}

function clearFile() {
    ocrProcessor.clearFile();
}

function clearResults() {
    ocrProcessor.clearResults();
}

function copyToClipboard() {
    ocrProcessor.copyToClipboard();
}

function downloadText() {
    ocrProcessor.downloadText();
}

// Initialisation
if (document.getElementById('uploadArea')) {
    document.addEventListener('DOMContentLoaded', () => {
        ocrProcessor = new OCRProcessor();
    });
}