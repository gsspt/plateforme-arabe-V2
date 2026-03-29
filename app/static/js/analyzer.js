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
            if (e.key === 'Enter') this.analyzeWord();
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

        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAnalysis());
        if (favoriteBtn) favoriteBtn.addEventListener('click', () => this.addToFavorites());
    }

    loadFromURL() {
        const wordFromUrl = URLManager.getQueryParam('word');
        if (wordFromUrl && document.getElementById('arabic-input')) {
            document.getElementById('arabic-input').value = wordFromUrl;
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word })
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
                const totalForms = data.analysis_summary.total_direct_forms + (data.analysis_summary.total_decomposition_forms || 0);
                Utils.showNotification(`Analyse terminée : ${totalForms} forme(s) trouvée(s)`, 'success');
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
            </div>`;
        errorDiv.classList.remove('hidden');
    }

    hideError() { document.getElementById('error').classList.add('hidden'); }
    hideResults() { document.getElementById('results').classList.add('hidden'); }

    displayResults(data) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = this.generateResultsHTML(data);
        resultsDiv.classList.remove('hidden');
        this.initializeExpandButtons();
        this.initializeShowMoreButtons();
        this.initializeExportButtons();
        this.initializePosFilter();
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Boutons d'expansion des cartes compactes
    initializeExpandButtons() {
        document.querySelectorAll('.form-item-compact').forEach(item => {
            item.addEventListener('click', () => {
                item.classList.toggle('expanded');
            });
        });
    }

    // Boutons "Voir plus" pour les formes cachées
    initializeShowMoreButtons() {
        document.querySelectorAll('.show-more-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const rootId = e.currentTarget.getAttribute('data-root');
                const container = document.getElementById(`forms-${rootId}`);
                const hiddenItems = container.querySelectorAll('.form-item-compact.form-hidden');
                
                // Afficher 10 de plus
                Array.from(hiddenItems).slice(0, 10).forEach(item => {
                    item.classList.remove('form-hidden');
                });

                const remaining = container.querySelectorAll('.form-item-compact.form-hidden').length;
                if (remaining === 0) {
                    e.currentTarget.style.display = 'none';
                } else {
                    e.currentTarget.textContent = `Voir ${remaining} forme(s) supplémentaire(s)`;
                }
            });
        });
    }

    initializePosFilter() {
        document.querySelectorAll('.pos-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.pos-filter-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const pos = e.currentTarget.getAttribute('data-pos');
                document.querySelectorAll('.derived-forms-container .form-item-compact').forEach(item => {
                    if (pos === 'ALL' || item.getAttribute('data-pos') === pos) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
                // Masquer les sections racines vides après filtrage
                document.querySelectorAll('.root-section').forEach(section => {
                    const visible = section.querySelectorAll('.form-item-compact:not([style*="none"])').length;
                    section.style.display = visible ? '' : 'none';
                });
            });
        });
    }

    initializeExportButtons() {
        document.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportResults(e.currentTarget.getAttribute('data-format'));
            });
        });
    }

    generateResultsHTML(data) {
        const allAnalyses = [...data.direct_forms, ...(data.decomposition_forms || [])];
        const totalAnalyses = allAnalyses.length;
        const totalDerived  = data.derived_forms.length;

        // Collecte les POS distincts pour le filtre
        const posSet = new Set(data.derived_forms.map(f => f.pos).filter(Boolean));
        const posFilterHTML = posSet.size > 1 ? `
            <div class="pos-filter">
                <button class="pos-filter-btn active" data-pos="ALL">Tous</button>
                ${[...posSet].map(p => `<button class="pos-filter-btn" data-pos="${p}">${this.formatPOS(p)}</button>`).join('')}
            </div>` : '';

        return `
            <div class="result-header">
                <div class="result-word">${data.input_word}</div>
                <div class="result-meta">
                    ${data.roots_found.length > 0
                        ? `<span class="meta-pill">Racine${data.roots_found.length > 1 ? 's' : ''} : ${data.roots_found.join(', ')}</span>`
                        : ''}
                    <span class="meta-pill">${totalAnalyses} analyse${totalAnalyses > 1 ? 's' : ''}</span>
                    ${totalDerived > 0 ? `<span class="meta-pill">${totalDerived} formes dérivées</span>` : ''}
                </div>
            </div>

            ${allAnalyses.length > 0 ? `
                <div class="section">
                    <div class="section-label">Analyses du mot</div>
                    <div class="form-list compact">
                        ${data.direct_forms.map(form => this.generateFormItemCompact(form, 'direct')).join('')}
                        ${(data.decomposition_forms || []).map(form => this.generateDecompositionItem(form)).join('')}
                    </div>
                </div>
            ` : ''}

            ${data.derived_forms.length > 0 ? `
                <div class="section">
                    <div class="section-label-row">
                        <span class="section-label">Formes dérivées</span>
                        <div class="section-actions">
                            ${posFilterHTML}
                            <button class="btn btn-secondary export-btn" data-format="json">JSON</button>
                        </div>
                    </div>
                    <div class="derived-forms-container">
                        ${this.groupFormsByRoot(data.derived_forms)}
                    </div>
                </div>
            ` : ''}

            ${allAnalyses.length === 0 && data.derived_forms.length === 0 ? `
                <div class="section">
                    <div class="no-results">
                        <p>Aucune analyse trouvée pour ce mot.</p>
                        <p>Essayez avec un autre mot ou vérifiez l'orthographe.</p>
                    </div>
                </div>
            ` : ''}

            <div class="results-actions">
                <button class="btn btn-secondary" onclick="window.arabicAnalyzer.shareResults()">Partager</button>
                <button class="btn btn-secondary" onclick="window.arabicAnalyzer.printResults()">Imprimer</button>
            </div>
        `;
    }

    // Carte compacte : une ligne, expandable au clic
    // hidden=true → ajout de la classe form-hidden pour "Voir plus"
    generateFormItemCompact(form, type = 'derived', hidden = false) {
        const group = this.getVerbGroup(form);
        const groupBadge = group ? `<span class="group-badge">${group}</span>` : '';
        const posBadge = `<span class="pos-badge pos-${form.pos}">${this.formatPOS(form.pos)}</span>`;
        const glose = this.cleanGlose(form.gloss || form.glose || '');
        const catLabel = this.formatCategorie(form.categorie);

        const details = `
            <div class="form-details-expanded">
                ${catLabel ? `
                <div class="detail-row">
                    <span class="detail-label">Type</span>
                    <span class="detail-value">${catLabel}</span>
                </div>` : ''}
                ${glose ? `
                <div class="detail-row">
                    <span class="detail-label">Sens</span>
                    <span class="detail-value">${glose}</span>
                </div>` : ''}
                ${type === 'derived' && form.racine_arabe ? `
                <div class="detail-row">
                    <span class="detail-label">Racine</span>
                    <span class="detail-value">
                        <a href="/analyze?word=${encodeURIComponent(form.racine_arabe)}"
                           onclick="event.stopPropagation()"
                           class="root-anchor">${form.racine_arabe}</a>
                    </span>
                </div>` : ''}
            </div>
        `;

        return `
            <div class="form-item-compact${hidden ? ' form-hidden' : ''}" data-category="${form.categorie}" data-pos="${form.pos}">
                <div class="form-compact-main">
                    <span class="arabic-word-compact">${form.forme_arabe}</span>
                    <span class="form-badges">
                        ${groupBadge}
                        ${posBadge}
                    </span>
                    <span class="form-glose-inline">${glose}</span>
                    <span class="expand-icon">›</span>
                </div>
                ${details}
            </div>
        `;
    }

    generateDecompositionItem(form) {
        const posBadge = `<span class="pos-badge pos-${form.pos}">${this.formatPOS(form.pos)}</span>`;
        const glose = this.cleanGlose(form.glose || '');
        const suffixeGlose = form.suffixe_glose ? this.cleanGlose(form.suffixe_glose) : '';
        const gloseComplete = (glose && suffixeGlose) ? `${suffixeGlose} ${glose}` : (glose || suffixeGlose);
        const catLabel = this.formatCategorie(form.categorie);

        // Bloc de décomposition morphologique (radical + préfixe + suffixe)
        const morphParts = [];
        if (form.prefixe_ar) morphParts.push(`<span class="morph-part morph-prefix" title="Préfixe">${form.prefixe_ar}</span>`);
        if (form.radical_ar) morphParts.push(`<span class="morph-part morph-stem" title="Radical">${form.radical_ar}</span>`);
        if (form.suffixe_ar)  morphParts.push(`<span class="morph-part morph-suffix" title="${suffixeGlose || 'Suffixe'}">${form.suffixe_ar}</span>`);

        return `
            <div class="form-item-compact" data-category="${form.categorie}" data-pos="${form.pos}">
                <div class="form-compact-main">
                    <span class="arabic-word-compact">${form.forme_arabe}</span>
                    <span class="form-badges">${posBadge}</span>
                    <span class="form-glose-inline">${gloseComplete}</span>
                    <span class="expand-icon">›</span>
                </div>
                <div class="form-details-expanded">
                    ${morphParts.length > 1 ? `
                    <div class="detail-row">
                        <span class="detail-label">Structure</span>
                        <span class="detail-value morph-breakdown">${morphParts.join('<span class="morph-sep">+</span>')}</span>
                    </div>` : ''}
                    ${catLabel ? `
                    <div class="detail-row">
                        <span class="detail-label">Type</span>
                        <span class="detail-value">${catLabel}</span>
                    </div>` : ''}
                    ${gloseComplete ? `
                    <div class="detail-row">
                        <span class="detail-label">Sens</span>
                        <span class="detail-value">${gloseComplete}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    }

    groupFormsByRoot(forms) {
        const formsByRoot = {};
        forms.forEach(form => {
            const rootKey = form.racine_arabe || form.racine;
            if (!formsByRoot[rootKey]) formsByRoot[rootKey] = [];
            formsByRoot[rootKey].push(form);
        });

        return Object.entries(formsByRoot).map(([root, rootForms]) => {
            const rootId = root.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '') || 'root';
            const visibleForms = rootForms.slice(0, 10);
            const hiddenForms = rootForms.slice(10);

            return `
                <div class="root-section">
                    <div class="root-header">
                        <span class="root-title">
                            <a href="/analyze?word=${encodeURIComponent(root)}"
                               onclick="event.stopPropagation()"
                               class="root-anchor">${root}</a>
                            <span class="root-count">${rootForms.length} forme${rootForms.length > 1 ? 's' : ''}</span>
                        </span>
                    </div>
                    <div class="form-list compact" id="forms-${rootId}">
                        ${visibleForms.map(form => this.generateFormItemCompact(form)).join('')}
                        ${hiddenForms.map(form => this.generateFormItemCompact(form, 'derived', true)).join('')}
                    </div>
                    ${hiddenForms.length > 0 ? `
                        <div class="show-more-container">
                            <button class="show-more-btn" data-root="${rootId}">
                                + ${hiddenForms.length} forme${hiddenForms.length > 1 ? 's' : ''}
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    // Détermine le groupe verbal arabe (I à X) depuis le lemme_id ou la catégorie
    getVerbGroup(form) {
        const lemme = form.lemme_id || '';
        const cat = form.categorie || '';
        const bw = form.forme_buckwalter || '';

        // Noms dérivés → pas de groupe verbal
        if (cat.startsWith('N') || cat.startsWith('F') || cat.startsWith('A')) return null;

        // Forme VI (tafā3al) doit être testée AVANT Forme V (tafa33al)
        if (/^tadA/.test(lemme) || /^taFA/.test(lemme)) return 'Forme VI';
        // Forme V (tafa33al / tafā3ala)
        if (/^ta[A-Za-z]+al_/.test(lemme) || cat.includes('tafa')) return 'Forme V';
        // Forme IV
        if (/^>a/.test(lemme)) return 'Forme IV';
        // Forme VIII (ifta3ala)
        if (/^i[A-Za-z]ta/.test(lemme)) return 'Forme VIII';
        // Forme X
        if (/^sta/.test(lemme)) return 'Forme X';
        // Forme II (géminée sur C2)
        if (bw.includes('~') && (cat.startsWith('PV') || cat.startsWith('IV') || cat.startsWith('CV'))) return 'Forme II';
        // Forme III (allongement après C1)
        if (/^[a-z]A/.test(bw) && (cat.startsWith('PV') || cat.startsWith('IV') || cat.startsWith('CV'))) return 'Forme III';
        // Forme I par défaut pour les verbes simples
        if (cat.startsWith('PV') || cat.startsWith('IV') || cat.startsWith('CV')) return 'Forme I';

        return null;
    }

    // Traduit les codes de catégorie Buckwalter en étiquettes lisibles
    formatCategorie(cat) {
        if (!cat) return '';
        const map = {
            'PV':           'Verbe accompli',
            'PV_Pass':      'Accompli passif',
            'IV':           'Verbe inaccompli',
            'IV_intr':      'Inaccompli intransitif',
            'IV_yu':        'Verbe inaccompli',
            'IV_Pass':      'Inaccompli passif',
            'IV_Pass_yu':   'Inaccompli passif',
            'CV':           'Impératif',
            'CV_intr':      'Impératif',
            'N':            'Nom',
            'Np':           'Nom propre',
            'Nhy':          'Nom (pl. brisé)',
            'NduAt':        'Nom (duel/plur.)',
            'Nap':          'Nom d\'action',
            'A':            'Adjectif',
            'Ahl':          'Adjectif élatif',
            'ADJ':          'Adjectif',
            'CONJ':         'Conjonction',
            'PREP':         'Préposition',
            'PART':         'Particule',
            'PRON':         'Pronom',
            'INTERJ':       'Interjection',
            'FUNC_WORD':    'Mot fonctionnel',
        };
        if (map[cat]) return map[cat];
        // Correspondances partielles
        if (cat.startsWith('PV')) return 'Verbe accompli';
        if (cat.startsWith('IV')) return 'Verbe inaccompli';
        if (cat.startsWith('CV')) return 'Impératif';
        if (cat.startsWith('N'))  return 'Nom';
        if (cat.startsWith('A'))  return 'Adjectif';
        return '';
    }

    // Nettoie la glose : supprime les balises <pos>...</pos>
    cleanGlose(glose) {
        return glose.replace(/<pos>[^<]*<\/pos>/g, '').trim();
    }

    formatPOS(pos) {
        const posMap = {
            'VERB_PERFECT': 'Accompli',
            'VERB_IMPERFECT': 'Inaccompli',
            'VERB_IMPERATIVE': 'Impératif',
            'NOUN': 'Nom',
            'NOUN_PROP': 'Nom propre',
            'ADJ': 'Adjectif',
            'FUNC_WORD': 'Fonctionnel',
            'UNKNOWN': 'Inconnu'
        };
        return posMap[pos] || pos || '—';
    }

    updateFavoriteButton() {
        const favoriteBtn = document.getElementById('favorite-btn');
        if (!favoriteBtn || !this.currentResults) return;
        const word = document.getElementById('arabic-input').value.trim();
        favoriteBtn.classList.toggle('hidden', this.currentResults.input_word !== word);
    }

    async addToFavorites() {
        if (!this.currentResults) return;
        try {
            const response = await fetch(this.favoritesUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
        document.getElementById('favorite-btn')?.classList.add('hidden');
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
        let text = `ANALYSE MORPHOLOGIQUE - ${data.input_word}\n${'='.repeat(50)}\n\n`;
        text += `Mot : ${data.input_word}\nBuckwalter : ${data.input_buckwalter}\nRacines : ${data.roots_found.join(', ')}\n\n`;
        if (data.direct_forms.length > 0) {
            text += `FORMES DIRECTES (${data.direct_forms.length}) :\n${'-'.repeat(30)}\n`;
            data.direct_forms.forEach((form, i) => {
                text += `${i + 1}. ${form.forme_arabe} [${form.categorie}]`;
                if (form.glose) text += ` - ${this.cleanGlose(form.glose)}`;
                text += '\n';
            });
            text += '\n';
        }
        if (data.derived_forms.length > 0) {
            text += `FORMES DÉRIVÉES (${data.derived_forms.length}) :\n${'-'.repeat(30)}\n`;
            data.derived_forms.forEach((form, i) => {
                text += `${i + 1}. ${form.forme_arabe} [${form.categorie}]`;
                if (form.racine_arabe) text += ` (Racine: ${form.racine_arabe})`;
                if (form.glose) text += ` - ${this.cleanGlose(form.glose)}`;
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
            navigator.share({ title: `Analyse de ${word}`, url });
        } else {
            Utils.copyToClipboard(url).then(() => {
                Utils.showNotification('Lien copié dans le presse-papier', 'success');
            });
        }
    }

    printResults() { window.print(); }
}

if (document.getElementById('arabic-input')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.arabicAnalyzer = new ArabicAnalyzer();
    });
}