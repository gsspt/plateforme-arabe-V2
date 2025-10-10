// main.js - Gestion de la navigation et fonctionnalités globales V2
class NavigationManager {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.searchHistory = new SearchHistory();
        this.initializeGlobalEvents();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path === '/analyze') return 'analyze';
        if (path === '/network') return 'network';
        if (path === '/ocr') return 'ocr';
        if (path === '/about') return 'about';
        return 'home';
    }

    initializeGlobalEvents() {
        this.highlightCurrentPage();
        this.initializePageSpecificFeatures();
        this.setupGlobalSearch();
    }

    highlightCurrentPage() {
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    initializePageSpecificFeatures() {
        switch(this.currentPage) {
            case 'analyze':
                this.initializeAnalyzerPage();
                break;
            case 'network':
                this.initializeNetworkPage();
                break;
            case 'ocr':
                this.initializeOCRPage();
                break;
            case 'home':
                this.initializeHomePage();
                break;
        }
    }

    initializeAnalyzerPage() {
        console.log('Page analyseur initialisée');
        // L'analyseur est initialisé dans analyzer.js
    }

    initializeNetworkPage() {
        console.log('Page réseau initialisée');
        // Le réseau est initialisé dans network.js
    }

    initializeOCRPage() {
        console.log('Page OCR initialisée');
        // L'OCR est initialisé dans ocr.js
    }

    initializeHomePage() {
        this.setupFeatureCards();
        this.setupQuickSearch();
    }

    setupFeatureCards() {
        const cards = document.querySelectorAll('.feature-card');
        cards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-5px) scale(1.02)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0) scale(1)';
            });
        });
    }

    setupQuickSearch() {
        // Gestion des boutons de recherche rapide
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const word = e.target.getAttribute('data-word');
                URLManager.navigateToPage('/analyze', { word: word });
            });
        });
    }

    setupGlobalSearch() {
        // Recherche globale depuis n'importe quelle page
        const globalSearch = document.getElementById('global-search');
        if (globalSearch) {
            globalSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) {
                        URLManager.navigateToPage('/analyze', { word: query });
                    }
                }
            });
        }
    }
}

class SearchHistory {
    constructor() {
        this.storageKey = 'arabic_search_history';
        this.maxItems = 50;
    }

    addSearch(word, results) {
        const history = this.getHistory();
        const searchEntry = {
            word: word,
            word_arabic: results.input_word,
            roots: results.roots_found,
            timestamp: new Date().toISOString(),
            analysisCount: results.analysis_summary.total_direct_forms + results.analysis_summary.total_derived_forms
        };

        // Éviter les doublons récents
        const filteredHistory = history.filter(item => 
            item.word !== word || 
            (new Date() - new Date(item.timestamp)) > 300000 // 5 minutes
        );

        filteredHistory.unshift(searchEntry);
        
        // Limiter la taille
        const limitedHistory = filteredHistory.slice(0, this.maxItems);
        
        localStorage.setItem(this.storageKey, JSON.stringify(limitedHistory));
        return limitedHistory;
    }

    getHistory(limit = 10) {
        try {
            const history = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
            return history.slice(0, limit);
        } catch (e) {
            console.error('Erreur lecture historique:', e);
            return [];
        }
    }

    clearHistory() {
        localStorage.removeItem(this.storageKey);
    }
}

// Gestion des paramètres d'URL
class URLManager {
    static getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }

    static setQueryParam(param, value) {
        const url = new URL(window.location);
        url.searchParams.set(param, value);
        window.history.pushState({}, '', url);
    }

    static navigateToPage(page, params = {}) {
        let url = page;
        if (Object.keys(params).length > 0) {
            const searchParams = new URLSearchParams(params);
            url += '?' + searchParams.toString();
        }
        window.location.href = url;
    }

    static getCurrentPath() {
        return window.location.pathname;
    }
}

// Fonctions utilitaires globales
class Utils {
    static showLoading(element, message = 'Chargement...') {
        element.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        element.classList.remove('hidden');
    }

    static hideLoading(element, content = '') {
        element.classList.add('hidden');
        if (content) {
            element.innerHTML = content;
        }
    }

    static formatArabicText(text) {
        return `<span class="arabic-text" dir="rtl">${text}</span>`;
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static showNotification(message, type = 'info', duration = 3000) {
        // Créer une notification temporaire
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

        // Styles de notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#fee' : type === 'success' ? '#efe' : '#eef'};
            border: 1px solid ${type === 'error' ? '#fcc' : type === 'success' ? '#cfc' : '#ccf'};
            border-radius: 5px;
            padding: 15px;
            z-index: 10000;
            max-width: 400px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;

        document.body.appendChild(notification);

        // Fermeture automatique
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, duration);

        // Fermeture manuelle
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static copyToClipboard(text) {
        return navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Texte copié dans le presse-papier', 'success', 2000);
            return true;
        }).catch(err => {
            console.error('Erreur copie:', err);
            this.showNotification('Erreur lors de la copie', 'error', 3000);
            return false;
        });
    }
}

// Gestion des thèmes
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'light';
        this.applyTheme(this.currentTheme);
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(this.currentTheme);
        localStorage.setItem('theme', this.currentTheme);
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        
        // Mettre à jour les métas si nécessaire
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.setAttribute('content', theme === 'dark' ? '#1a1a1a' : '#2b8cbe');
        }
    }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.navigationManager = new NavigationManager();
    window.themeManager = new ThemeManager();
    
    // Gestion du pré-remplissage depuis les paramètres URL
    const wordFromUrl = URLManager.getQueryParam('word');
    if (wordFromUrl && document.getElementById('arabic-input')) {
        document.getElementById('arabic-input').value = wordFromUrl;
    }

    // Gestion des erreurs globales
    window.addEventListener('error', (e) => {
        console.error('Erreur globale:', e.error);
        Utils.showNotification('Une erreur inattendue est survenue', 'error');
    });

    // Gestion des promesses rejetées
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Promesse rejetée:', e.reason);
        Utils.showNotification('Erreur de traitement des données', 'error');
    });
});

// Export pour utilisation dans d'autres fichiers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        NavigationManager, 
        URLManager, 
        Utils, 
        SearchHistory,
        ThemeManager 
    };
}