// analyzer.js - Analyseur morphologique arabe V2

class Autocomplete {
    constructor(inputEl, dropdownEl, onSelect) {
        this.input = inputEl;
        this.dropdown = dropdownEl;
        this.onSelect = onSelect;
        this.activeIndex = -1;
        this.items = [];
        this._debounceTimer = null;

        this.input.addEventListener('input', () => this._onInput());
        this.input.addEventListener('keydown', (e) => this._onKeydown(e));
        document.addEventListener('click', (e) => {
            if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.hide();
            }
        });
    }

    _onInput() {
        clearTimeout(this._debounceTimer);
        const q = this.input.value.trim();
        if (q.length < 1) { this.hide(); return; }
        this._debounceTimer = setTimeout(() => this._fetch(q), 220);
    }

    async _fetch(q) {
        try {
            const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            this._render(data.suggestions || []);
        } catch (_) {
            this.hide();
        }
    }

    _render(items) {
        // items: string[] (legacy) ou {word, glose, pos}[]
        this.items = items.map(s => typeof s === 'string' ? { word: s, glose: '', pos: '' } : s);
        this.activeIndex = -1;
        if (this.items.length === 0) { this.hide(); return; }

        this.dropdown.innerHTML = this.items.map((item, i) =>
            `<li class="autocomplete-item" role="option" data-index="${i}" data-word="${item.word}">
                <span class="ac-word">${item.word}</span>
                ${item.glose ? `<span class="ac-glose">${item.glose}</span>` : ''}
            </li>`
        ).join('');

        this.dropdown.querySelectorAll('.autocomplete-item').forEach(li => {
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.onSelect(li.getAttribute('data-word'));
                this.hide();
            });
        });

        this.dropdown.classList.remove('hidden');
    }

    _onKeydown(e) {
        if (this.dropdown.classList.contains('hidden')) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._setActive(Math.min(this.activeIndex + 1, this.items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._setActive(Math.max(this.activeIndex - 1, -1));
        } else if (e.key === 'Enter' && this.activeIndex >= 0) {
            e.preventDefault();
            this.onSelect(this.items[this.activeIndex].word);
            this.hide();
        } else if (e.key === 'Escape') {
            this.hide();
        }
    }

    _setActive(index) {
        this.activeIndex = index;
        this.dropdown.querySelectorAll('.autocomplete-item').forEach((li, i) => {
            li.classList.toggle('autocomplete-active', i === index);
        });
    }

    hide() {
        this.dropdown.classList.add('hidden');
        this.dropdown.innerHTML = '';
        this.items = [];
        this.activeIndex = -1;
    }
}

class ArabicAnalyzer {
    constructor() {
        this.apiUrl = '/api/analyze';
        this.favoritesUrl = '/api/favorites';
        this.currentResults = null;
        this.initializeEventListeners();
        this.loadFromURL();
        this._initAutocomplete();
    }

    _initAutocomplete() {
        const input = document.getElementById('arabic-input');
        const dropdown = document.getElementById('autocomplete-dropdown');
        if (!input || !dropdown) return;
        this.autocomplete = new Autocomplete(input, dropdown, (word) => {
            input.value = word;
            this.analyzeWord();
        });
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
        document.getElementById('clear-btn')?.classList.remove('hidden');
        this.initializeExpandButtons();
        this.initializeShowMoreButtons();
        this.initializeExportButtons();
        this.initializePosFilter();
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        const directForms  = data.direct_forms || [];
        const decompForms  = data.decomposition_forms || [];
        const allAnalyses  = [...directForms, ...decompForms];
        const derivedForms = data.derived_forms || [];

        // ── En-tête compact ──────────────────────────────────────────────────
        const rootsDisplay = data.roots_found.length > 0
            ? data.roots_found.map(r => `<a href="/analyze?word=${encodeURIComponent(r)}" class="root-anchor">${r}</a>`).join(' · ')
            : '—';

        const header = `
            <div class="result-header">
                <span class="result-word">${data.input_word}</span>
                <span class="result-root-label">Racine${data.roots_found.length > 1 ? 's' : ''} : ${rootsDisplay}</span>
                <span class="result-counts">${allAnalyses.length} analyse${allAnalyses.length > 1 ? 's' : ''}</span>
            </div>`;

        // ── Tableau d'analyses ───────────────────────────────────────────────
        let analysesHTML = '';
        if (allAnalyses.length > 0) {
            const directRows = directForms.map(f => this._tableRowDirect(f)).join('');
            const decompRows = decompForms.map(f => this._tableRowDecomp(f)).join('');
            analysesHTML = `
            <div class="section">
                <div class="section-label">Analyses du mot</div>
                <table class="analysis-table">
                    <thead>
                        <tr>
                            <th class="col-arabic">Forme</th>
                            <th class="col-glose">Sens</th>
                            <th class="col-pos">POS</th>
                            <th class="col-root">Racine</th>
                            <th class="col-form">Forme</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${directRows}
                        ${decompRows}
                    </tbody>
                </table>
            </div>`;
        }

        // ── Filtre POS + formes dérivées ─────────────────────────────────────
        let derivedHTML = '';
        if (derivedForms.length > 0) {
            const posSet = new Set(derivedForms.map(f => f.pos).filter(Boolean));
            const posFilterHTML = posSet.size > 1 ? `
                <div class="pos-filter">
                    <button class="pos-filter-btn active" data-pos="ALL">Tous</button>
                    ${[...posSet].map(p => `<button class="pos-filter-btn" data-pos="${p}">${this.formatPOS(p)}</button>`).join('')}
                </div>` : '';
            derivedHTML = `
            <div class="section">
                <div class="section-label-row">
                    <span class="section-label">Formes dérivées <span class="count-badge">${derivedForms.length}</span></span>
                    <div class="section-actions">
                        ${posFilterHTML}
                        <button class="btn btn-secondary export-btn" data-format="json">JSON</button>
                    </div>
                </div>
                <div class="derived-forms-container">
                    ${this.groupFormsByRoot(derivedForms)}
                </div>
            </div>`;
        }

        const noResults = allAnalyses.length === 0 && derivedForms.length === 0 ? `
            <div class="section"><div class="no-results">
                <p>Aucune analyse trouvée pour ce mot.</p>
                <p>Essayez un autre mot ou vérifiez l'orthographe.</p>
            </div></div>` : '';

        const actions = `
            <div class="results-actions">
                <button class="btn btn-secondary" onclick="window.arabicAnalyzer.shareResults()">Partager</button>
                <button class="btn btn-secondary" onclick="window.arabicAnalyzer.printResults()">Imprimer</button>
            </div>`;

        return header + analysesHTML + derivedHTML + noResults + actions;
    }

    // ── Ligne du tableau : analyse directe ───────────────────────────────────
    _tableRowDirect(form) {
        const glose    = this.cleanGlose(form.gloss || form.glose || '');
        const verbForm = this.getVerbGroup(form);
        const posText  = this._posLabel(form.pos, form.categorie);
        const rootAr   = form.racine_arabe || '';
        const rootCell = rootAr
            ? `<a href="/analyze?word=${encodeURIComponent(rootAr)}" class="root-anchor">${rootAr}</a>`
            : '—';
        const isPassive = (form.categorie || '').includes('_Pass');
        return `
            <tr class="analysis-row${isPassive ? ' passive-row' : ''}" data-pos="${form.pos}">
                <td class="col-arabic arabic-text">${form.forme_arabe || ''}</td>
                <td class="col-glose">${glose || '—'}</td>
                <td class="col-pos"><span class="pos-badge pos-${form.pos}${isPassive ? ' pos-passive' : ''}">${posText}</span></td>
                <td class="col-root">${rootCell}</td>
                <td class="col-form">${verbForm || '—'}</td>
            </tr>`;
    }

    // ── Ligne du tableau : analyse par décomposition ─────────────────────────
    _tableRowDecomp(form) {
        const glose        = this.cleanGlose(form.glose || '');
        const suffixeGlose = form.suffixe_glose ? this.cleanGlose(form.suffixe_glose) : '';
        const gloseComplete = (glose && suffixeGlose) ? `${suffixeGlose} ${glose}` : (glose || suffixeGlose);
        const posText  = this._posLabel(form.pos, form.radical_categorie || form.categorie);
        const isPassive = (form.radical_categorie || form.categorie || '').includes('_Pass');

        // Décomposition morphologique inline (préfixe + radical + suffixe)
        const parts = [];
        if (form.prefixe_ar) parts.push(`<span class="morph-part morph-prefix" title="Préfixe">${form.prefixe_ar}</span>`);
        if (form.radical_ar) parts.push(`<span class="morph-part morph-stem" title="Radical">${form.radical_ar}</span>`);
        if (form.suffixe_ar)  parts.push(`<span class="morph-part morph-suffix" title="${suffixeGlose || 'Suffixe'}">${form.suffixe_ar}</span>`);
        const decompCell = parts.length > 1
            ? `<span class="morph-breakdown">${parts.join('<span class="morph-sep">·</span>')}</span>`
            : (form.forme_arabe || '');

        return `
            <tr class="analysis-row decomp-row${isPassive ? ' passive-row' : ''}" data-pos="${form.pos}">
                <td class="col-arabic arabic-text">${decompCell}</td>
                <td class="col-glose">${gloseComplete || '—'}</td>
                <td class="col-pos"><span class="pos-badge pos-${form.pos}${isPassive ? ' pos-passive' : ''}">${posText}</span></td>
                <td class="col-root">—</td>
                <td class="col-form">${this.getVerbGroup({lemme_id: form.radical_lemme, categorie: form.radical_categorie}) || '—'}</td>
            </tr>`;
    }

    // Carte compacte : une ligne, expandable au clic
    // hidden=true → ajout de la classe form-hidden pour "Voir plus"
    generateFormItemCompact(form, type = 'derived', hidden = false) {
        const group = this.getVerbGroup(form);
        const groupBadge = group ? `<span class="group-badge">${group}</span>` : '';
        const isPassive = (form.categorie || '').includes('_Pass');
        const posText = this._posLabel(form.pos, form.categorie);
        const posBadge = `<span class="pos-badge pos-${form.pos}${isPassive ? ' pos-passive' : ''}">${posText}</span>`;
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

    // ── Numéro de forme verbale (I–X) depuis le lemme_id ────────────────────
    // Principe : le préfixe du lemme_id encode la forme Buckwalter de façon fiable.
    //   • Forme X  : {iso… / Asto… / <sto…
    //   • Forme VIII: {i + C1 + ot (C1 immédiatement suivi de sukun+ta)
    //   • Forme VII : {ino… / Ano…
    //   • Forme VI  : ta + C + A  (tafāEala — pas de géminée)
    //   • Forme V   : ta… avec ~  (taFaEEala — géminée sur C2)
    //   • Forme IV  : > (hamzat al-qat3 initiale)
    //   • Forme II  : ~ dans les premiers caractères (géminée C2) sans ta-
    //   • Forme III : C + A au début (sans _V dans cat, pour exclure les creux)
    //   • Forme I   : défaut
    getVerbGroup(form) {
        const lemme = form.lemme_id || '';
        const cat   = form.categorie || '';

        // Noms, adjectifs, mots fonctionnels → pas de groupe verbal
        if (!cat || cat.startsWith('N') || cat.startsWith('F')) return null;
        const isVerb = cat.startsWith('PV') || cat.startsWith('IV') || cat.startsWith('CV');
        if (!isVerb) return null;

        // Forme X : {isotaFEal
        if (lemme.startsWith('{iso') || lemme.startsWith('Asto') || lemme.startsWith('<sto'))
            return 'Forme X';

        // Forme VIII : {iFtaEal → {i + C1 + ot
        if (/^\{i[a-zA-Z]ot/.test(lemme) || /^A[a-zA-Z]ot/.test(lemme))
            return 'Forme VIII';

        // Forme VII : {inoFaEal
        if (lemme.startsWith('{ino') || lemme.startsWith('Ano'))
            return 'Forme VII';

        // Forme VI : taFAEal → ta + consonne + A (alif long, pas de géminée)
        if (/^ta[a-zA-Z]A/.test(lemme))
            return 'Forme VI';

        // Forme V : taFaEEal → ta… avec géminée (~)
        if (lemme.startsWith('ta') && lemme.includes('~'))
            return 'Forme V';

        // Forme IV : >aFEal (hamzat al-qat3 préfixe)
        if (lemme.startsWith('>'))
            return 'Forme IV';

        // Forme II : FaEEal → géminée ~ (sans préfixe ta-)
        // La catégorie IV_yu/PV_yu indique aussi la Forme II (inaccompli)
        if (lemme.includes('~') || cat.startsWith('IV_yu') || cat.startsWith('PV_yu'))
            return 'Forme II';

        // Forme III : FAEal → consonne + A en position 1-2
        // Exclure les verbes creux Forme I (cat PV_V / IV_V)
        if (/^[a-zA-Z]A/.test(lemme) && !cat.includes('_V'))
            return 'Forme III';

        // Forme I par défaut
        return 'Forme I';
    }

    // ── Label POS en tenant compte de la catégorie (actif / passif) ──────────
    _posLabel(pos, cat) {
        if (cat) {
            if (cat.startsWith('PV_Pass') || cat.startsWith('IV_Pass')) return 'Passif';
            if (cat.startsWith('CV'))  return 'Impératif';
            if (cat.startsWith('PV'))  return 'Accompli';
            if (cat.startsWith('IV'))  return 'Inaccompli';
        }
        return this.formatPOS(pos);
    }

    // Traduit les codes de catégorie Buckwalter en étiquettes lisibles
    formatCategorie(cat) {
        if (!cat) return '';
        // Correspondances partielles par préfixe (du plus spécifique au plus général)
        if (cat.startsWith('PV_Pass'))    return 'Accompli passif';
        if (cat.startsWith('IV_Pass'))    return 'Inaccompli passif';
        if (cat.startsWith('PV'))         return 'Verbe accompli';
        if (cat.startsWith('IV'))         return 'Verbe inaccompli';
        if (cat.startsWith('CV'))         return 'Impératif';
        // Noms et sous-types
        if (cat === 'N0_Nh' || cat === 'Nhy') return 'Nom (pluriel brisé)';
        if (cat.includes('At') || cat === 'NduAt') return 'Nom (pluriel régulier)';
        if (cat.includes('du') || cat === 'Ndu')   return 'Nom';
        if (cat === 'N/ap' || cat === 'N-ap')  return 'Participe actif';
        if (cat === 'Nall')   return 'Adjectif verbal';
        if (cat === 'Nap' || cat.includes('/ap')) return 'Nom d\'action / participe';
        if (cat === 'Napdu')  return 'Nom d\'action';
        if (cat === 'NAt')    return 'Nom (pluriel féminin)';
        if (cat === 'NF')     return 'Nom (locution)';
        if (cat === 'Nel')    return 'Élatif (superlatif)';
        if (cat === 'Ahl')    return 'Élatif';
        if (cat === 'Nprop' || cat === 'N0') return 'Nom propre';
        if (cat.startsWith('N'))  return 'Nom';
        // Adjectifs
        if (cat === 'ADJ')    return 'Adjectif';
        if (cat.startsWith('A'))  return 'Adjectif';
        // Mots fonctionnels
        if (cat === 'FUNC_WORD' || cat.startsWith('F')) return 'Mot fonctionnel';
        if (cat === 'CONJ')   return 'Conjonction';
        if (cat === 'PREP')   return 'Préposition';
        if (cat === 'PART')   return 'Particule';
        if (cat === 'PRON')   return 'Pronom';
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
            'MASDAR': 'Masdar',
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
        document.getElementById('clear-btn')?.classList.add('hidden');
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