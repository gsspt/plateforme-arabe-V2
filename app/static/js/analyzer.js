// analyzer.js - Analyseur morphologique arabe V2
class ArabicAnalyzer {
    constructor() {
        this.apiUrl = '/api/analyze';
        this.favoritesUrl = '/api/favorites';
        this.currentResults = null;
        this.initializeEventListeners();
        this.loadFromURL();
    }

    initializeEventListeners() {
        const analyzeBtn = document.getElementById('analyze-btn');
        const arabicInput = document.getElementById('arabic-input');
        const exampleBtns = document.querySelectorAll('.example-btn');
        const clearBtn = document.getElementById('clear-btn');
        const favoriteBtn = document.getElementById('favorite-btn');

        analyzeBtn.addEventListener('click', () => this.analyzeWord());
        
        arabicInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.analyzeWord();
            }
        });

        arabicInput.addEventListener('input', Utils.debounce(() => {
            this.updateFavoriteButton();
        }, 300));

        exampleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const word = btn.getAttribute('data-word');
                arabicInput.value = word;
                this.analyzeWord();
            });
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAnalysis());
        }

        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', () => this.addToFavorites());
        }
    }

    loadFromURL() {
        const wordFromUrl = URLManager.getQueryParam('word');
        if (wordFromUrl && document.getElementById('arabic-input')) {
            document.getElementById('arabic-input').value = wordFromUrl;
            // Auto-analyze si le mot est assez long
            if (wordFromUrl.length >= 2) {
                setTimeout(() => this.analyzeWord(), 500);
            }
        }
    }

    async analyzeWord() {
        const word = document.getElementById('arabic-input').value.trim();
        
        if (!word) {
            Utils.showNotification('Veuillez entrer un mot arabe', 'error');
            return;
        }

        this.showLoading();
        this.hideResults();
        this.hideError();

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ word: word })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erreur de connexion au serveur');
            }

            const data = await response.json();
            
            if (data.error) {
                this.showError(data.error);
            } else {
                this.currentResults = data;
                this.displayResults(data);
                this.updateFavoriteButton();
                Utils.showNotification(`Analyse terminée: ${data.analysis_summary.total_direct_forms} formes trouvées`, 'success');
            }
        } catch (error) {
            this.showError(error.message || 'Erreur de connexion. Vérifiez que le serveur est démarré.');
            console.error('Error:', error);
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        const loadingDiv = document.getElementById('loading');
        const analyzeBtn = document.getElementById('analyze-btn');
        const btnText = analyzeBtn.querySelector('.btn-text');
        const btnSpinner = analyzeBtn.querySelector('.btn-spinner');

        loadingDiv.classList.remove('hidden');
        btnText.textContent = 'Analyse en cours...';
        btnSpinner.classList.remove('hidden');
        analyzeBtn.disabled = true;
    }

    hideLoading() {
        const loadingDiv = document.getElementById('loading');
        const analyzeBtn = document.getElementById('analyze-btn');
        const btnText = analyzeBtn.querySelector('.btn-text');
        const btnSpinner = analyzeBtn.querySelector('.btn-spinner');

        loadingDiv.classList.add('hidden');
        btnText.textContent = 'Analyser';
        btnSpinner.classList.add('hidden');
        analyzeBtn.disabled = false;
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.innerHTML = `
            <div class="error-content">
                <span class="error-icon">⚠️</span>
                <span class="error-message">${message}</span>
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
        resultsDiv.innerHTML = this.generateResultsHTML(data);
        resultsDiv.classList.remove('hidden');
        
        this.initializeShowMoreButtons();
        this.initializeExportButtons();
        
        // Faire défendre jusqu'aux résultats
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    initializeShowMoreButtons() {
        document.querySelectorAll('.show-more-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const root = e.target.getAttribute('data-root');
                const container = document.getElementById(`forms-${root}`);
                const hiddenForms = container.querySelectorAll('.form-item.hidden');
                
                const formsToShow = Array.from(hiddenForms).slice(0, 10);
                formsToShow.forEach(form => form.classList.remove('hidden'));
                
                const remainingHidden = container.querySelectorAll('.form-item.hidden').length;
                if (remainingHidden === 0) {
                    e.target.style.display = 'none';
                }
            });
        });
    }

    initializeExportButtons() {
        document.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const format = e.target.getAttribute('data-format');
                this.exportResults(format);
            });
        });
    }

    generateResultsHTML(data) {
        return `
            <div class="result-header">
                <h2>${data.input_word}</h2>
                <div class="result-meta">
                    <div class="root-info">
                        ${data.roots_found.length > 0 ? 
                            `Racines trouvées: ${data.roots_found.join(', ')}` : 
                            'Aucune racine identifiée'}
                    </div>
                    <div class="stats">
                        ${data.analysis_summary.total_direct_forms} forme(s) directe(s) • 
                        ${data.analysis_summary.total_derived_forms} forme(s) dérivée(s) •
                        ${data.analysis_summary.total_roots} racine(s)
                    </div>
                </div>
            </div>

            ${data.direct_forms.length > 0 ? `
                <div class="section">
                    <div class="section-title">
                        <span></span>
                        FORMES DIRECTES DE CE MOT
                    </div>
                    <div class="form-list">
                        ${data.direct_forms.map((form, index) => this.generateFormItem(form, 'direct')).join('')}
                    </div>
                </div>
            ` : ''}

            ${data.derived_forms.length > 0 ? `
                <div class="section">
                    <div class="section-title">
                        <span></span>
                        FORMES DÉRIVÉES DES RACINES
                        <div class="section-actions">
                            <button class="btn btn-secondary export-btn" data-format="json">
                                 Exporter JSON
                            </button>
                        </div>
                    </div>
                    
                    ${this.groupFormsByRoot(data.derived_forms)}
                    
                    <div class="summary">
                        <p><strong> Résumé:</strong> ${data.derived_forms.length} formes dérivées trouvées pour ${data.roots_found.length} racines</p>
                    </div>
                </div>
            ` : ''}

            ${data.direct_forms.length === 0 && data.derived_forms.length === 0 ? `
                <div class="section">
                    <div class="no-results">
                        <p>❌ Aucune analyse trouvée pour ce mot.</p>
                        <p>Essayez avec un autre mot ou vérifiez l'orthographe.</p>
                    </div>
                </div>
            ` : ''}

            <div class="results-actions">
                <button class="btn btn-secondary" onclick="window.arabicAnalyzer.shareResults()">
                     Partager
                </button>
                <button class="btn btn-secondary" onclick="window.arabicAnalyzer.printResults()">
                     Imprimer
                </button>
            </div>
        `;
    }

    generateFormItem(form, type = 'derived') {
        const buckwalterIcon = this.getBuckwalterIcon(form.categorie);
        
        return `
            <div class="form-item" data-category="${form.categorie}" data-pos="${form.pos}">
                <div class="form-main">
                    <div class="arabic-word">${form.forme_arabe}</div>
                    <div class="form-meta">
                        <span class="category-badge">${buckwalterIcon}</span>
                        ${form.pos ? `<span class="pos-tag">${this.formatPOS(form.pos)}</span>` : ''}
                    </div>
                </div>
                <div class="form-details">
                    <div class="morph-analysis">
                        ${this.generateMorphAnalysis(form)}
                    </div>
                    <div class="meaning">${form.gloss || form.glose || 'Aucune traduction disponible'}</div>
                    ${form.lemme_id ? `<div class="lemma">Lemme: ${form.lemme_id}</div>` : ''}
                    ${type === 'derived' && form.racine_arabe ? `
                        <div class="root-link">
                            Racine: 
                            <a href="/analyze?word=${encodeURIComponent(form.racine_arabe)}" 
                               class="root-anchor">
                               ${form.racine_arabe}
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    groupFormsByRoot(forms) {
        const formsByRoot = {};
        
        forms.forEach(form => {
            const rootKey = form.racine_arabe || form.racine;
            if (!formsByRoot[rootKey]) {
                formsByRoot[rootKey] = [];
            }
            formsByRoot[rootKey].push(form);
        });

        return Object.entries(formsByRoot).map(([root, rootForms]) => {
            const visibleForms = rootForms.slice(0, 10);
            const hiddenForms = rootForms.slice(10);
            const rootId = root.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '');
            
            return `
                <div class="root-section">
                    <div class="root-header">
                        <h3 class="root-title">Racine: ${root}</h3>
                        <a href="/analyze?word=${encodeURIComponent(root)}" 
                           class="btn btn-small">
                            Analyser cette racine
                        </a>
                    </div>
                    <div class="form-list" id="forms-${rootId}">
                        ${visibleForms.map(form => this.generateFormItem(form)).join('')}
                        ${hiddenForms.map(form => `
                            <div class="form-item hidden">
                                ${this.generateFormItem(form)}
                            </div>
                        `).join('')}
                    </div>
                    ${hiddenForms.length > 0 ? `
                        <div class="show-more-container">
                            <button class="show-more-btn" data-root="${rootId}">
                                Voir ${hiddenForms.length} forme(s) supplémentaire(s)
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    getBuckwalterIcon(category) {
        const iconMap = {
            // VERBES - PARFAIT
            'PV': 'VERBE PASSÉ',
            'PV_intr': 'VERBE PASSÉ INTR',
            'PV_Pass': 'VERBE PASSÉ PASSIF',
            'PV_C': 'VERBE PASSÉ CONS',
            'PV_V': 'VERBE PASSÉ VOC',
            
            // VERBES - INACCOMPLI
            'IV': 'VERBE PRÉSENT',
            'IV_intr': 'VERBE PRÉSENT INTR',
            'IV_Pass': 'VERBE PRÉSENT PASSIF',
            'IV_C': 'VERBE PRÉSENT CONS',
            'IV_V': 'VERBE PRÉSENT VOC',
            'IV_yu': 'VERBE YU-',
            
            // IMPÉRATIF
            'CV': 'IMPÉRATIF',
            
            // NOMS
            'N': 'NOM',
            'Ndu': 'NOM+DUEL',
            'NduAt': 'NOM+DUEL+PLF',
            'N/ap': 'NOM+FÉM',
            'N/At': 'NOM+PLF',
            'NAt': 'NOM PLF',
            'Nap': 'NOM FÉM',
            'NapAt': 'NOM FÉM+PLF',
            'Nprop': 'NOM PROPRE',
            'Ndip': 'NOM DIPTOTE',
            'Nel': 'NOM ÉLATIF',
            'Nall': 'NOM COMPLET',
            
            // PRÉFIXES
            'Pref-0': 'PRÉF NULL',
            'Pref-Wa': 'PRÉF WA-',
            'NPref-Al': 'PRÉF AL-',
            'NPref-Bi': 'PRÉF BI-',
            'NPref-BiAl': 'PRÉF BI+AL',
            
            // SUFFIXES
            'Suff-0': 'SUFF NULL',
            'NSuff-u': 'SUFF -U',
            'NSuff-a': 'SUFF -A',
            'NSuff-i': 'SUFF -I',
            'NSuff-ap': 'SUFF -A(T)',
            'PVSuff-a': 'SUFF VERBAL -A',
            'IVSuff-u': 'SUFF VERBAL -U',
            
            // MOTS FONCTIONNELS
            'FW': 'MOT FONCT',
            'FW-Wa': 'MOT FONCT WA-',
            'FW-WaBi': 'MOT FONCT WA+BI',
            'FW-n~': 'MOT FONCT N~'
        };
        
        return iconMap[category] || category || 'AUTRE';
    }

    generateMorphAnalysis(form) {
        const analysis = [];
        
        if (form.categorie.startsWith('PV')) {
            analysis.push(' Verbe au passé (accompli)');
            if (form.categorie.includes('_Pass')) analysis.push(' Forme passive');
            if (form.categorie.includes('_intr')) analysis.push(' Verbe intransitif');
            if (form.categorie.includes('_C')) analysis.push('◼️ Forme consonantique');
            if (form.categorie.includes('_V')) analysis.push('🟦 Forme vocalique');
        }
        
        if (form.categorie.startsWith('IV')) {
            analysis.push(' Verbe au présent/futur (inaccompli)');
            if (form.categorie.includes('_Pass')) analysis.push(' Forme passive');
            if (form.categorie.includes('_yu')) analysis.push(' 3ème personne masculin');
        }
        
        if (form.categorie.startsWith('N')) {
            analysis.push(' Nom');
            if (form.categorie.includes('du')) analysis.push(' Accepte le duel');
            if (form.categorie.includes('At')) analysis.push(' Accepte le pluriel féminin');
            if (form.categorie.includes('prop')) analysis.push(' Nom propre');
        }
        
        if (form.categorie.includes('Pref-')) {
            analysis.push(' Préfixe grammatical');
        }
        
        if (form.categorie.includes('Suff-')) {
            analysis.push(' Suffixe grammatical');
        }
        
        return analysis.map(item => `<div class="morph-tag">${item}</div>`).join('');
    }

    formatPOS(pos) {
        const posMap = {
            'VERB_PERFECT': 'Verbe (accompli)',
            'VERB_IMPERFECT': 'Verbe (inaccompli)',
            'VERB_IMPERATIVE': 'Verbe (impératif)',
            'NOUN': 'Nom',
            'NOUN_PROP': 'Nom propre',
            'ADJ': 'Adjectif',
            'FUNC_WORD': 'Mot fonctionnel',
            'UNKNOWN': 'Inconnu'
        };
        return posMap[pos] || pos;
    }

    updateFavoriteButton() {
        const favoriteBtn = document.getElementById('favorite-btn');
        if (!favoriteBtn || !this.currentResults) return;

        const word = document.getElementById('arabic-input').value.trim();
        if (word && this.currentResults.input_word === word) {
            favoriteBtn.classList.remove('hidden');
        } else {
            favoriteBtn.classList.add('hidden');
        }
    }

    async addToFavorites() {
        if (!this.currentResults) return;

        try {
            const response = await fetch(this.favoritesUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    word: this.currentResults.input_buckwalter,
                    word_arabic: this.currentResults.input_word,
                    analysis_data: this.currentResults
                })
            });

            const data = await response.json();

            if (data.success) {
                Utils.showNotification('Mot ajouté aux favoris', 'success');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            Utils.showNotification('Erreur lors de l\'ajout aux favoris', 'error');
            console.error('Error:', error);
        }
    }

    clearAnalysis() {
        document.getElementById('arabic-input').value = '';
        document.getElementById('results').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
        document.getElementById('favorite-btn').classList.add('hidden');
        this.currentResults = null;
    }

    exportResults(format = 'json') {
        if (!this.currentResults) return;

        let content, mimeType, filename;

        if (format === 'json') {
            content = JSON.stringify(this.currentResults, null, 2);
            mimeType = 'application/json';
            filename = `analyse-${this.currentResults.input_word}.json`;
        } else {
            // Format texte simple
            content = this.generateTextExport();
            mimeType = 'text/plain';
            filename = `analyse-${this.currentResults.input_word}.txt`;
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Utils.showNotification(`Export ${format} téléchargé`, 'success');
    }

    generateTextExport() {
        const data = this.currentResults;
        let text = `ANALYSE MORPHOLOGIQUE - ${data.input_word}\n`;
        text += `=${'='.repeat(50)}\n\n`;
        
        text += `Mot analysé: ${data.input_word}\n`;
        text += `Transcription Buckwalter: ${data.input_buckwalter}\n`;
        text += `Racines trouvées: ${data.roots_found.join(', ')}\n\n`;
        
        if (data.direct_forms.length > 0) {
            text += `FORMES DIRECTES (${data.direct_forms.length}):\n`;
            text += `${'-'.repeat(30)}\n`;
            data.direct_forms.forEach((form, index) => {
                text += `${index + 1}. ${form.forme_arabe} [${form.categorie}]`;
                if (form.glose) text += ` - ${form.glose}`;
                text += '\n';
            });
            text += '\n';
        }
        
        if (data.derived_forms.length > 0) {
            text += `FORMES DÉRIVÉES (${data.derived_forms.length}):\n`;
            text += `${'-'.repeat(30)}\n`;
            data.derived_forms.forEach((form, index) => {
                text += `${index + 1}. ${form.forme_arabe} [${form.categorie}]`;
                if (form.racine_arabe) text += ` (Racine: ${form.racine_arabe})`;
                if (form.glose) text += ` - ${form.glose}`;
                text += '\n';
            });
        }
        
        return text;
    }

    shareResults() {
        if (!this.currentResults) return;

        const word = this.currentResults.input_word;
        const url = `${window.location.origin}/analyze?word=${encodeURIComponent(word)}`;
        
        if (navigator.share) {
            navigator.share({
                title: `Analyse de ${word}`,
                text: `Découvrez l'analyse morphologique de ${word} sur la Plateforme Arabe`,
                url: url
            });
        } else {
            Utils.copyToClipboard(url).then(() => {
                Utils.showNotification('Lien copié dans le presse-papier', 'success');
            });
        }
    }

    printResults() {
        window.print();
    }
}

// Initialisation automatique
if (document.getElementById('arabic-input')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.arabicAnalyzer = new ArabicAnalyzer();
    });
}