// network.js - VERSION CORRIGÉE
class NetworkVisualization {
    constructor() {
        this.apiUrl = '/api/network-json';
        this.container = d3.select("#graph-container");
        this.detailPanel = d3.select("#detail-panel");
        this.loadingScreen = d3.select("#loading");
        
        this.allLinks = [];
        this.allNodes = [];
        this.currentLinks = [];
        this.currentMaxLinks = 300;
        this.currentMinProductivity = 1;
        
        this.simulation = null;
        this.svg = null;
        this.g = null;
        this.linkElements = null;
        this.nodeElements = null;
        
        this.colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.initVisualization();
            this.setupControls();
            this.loadingScreen.style("display", "none");
        } catch (error) {
            console.error(" Erreur de chargement :", error);
            this.showError("Erreur de chargement des données réseau: " + error.message);
        }
    }

    async loadData() {
        console.log(" Chargement des données réseau...");
        const response = await fetch(this.apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const graphData = await response.json();
        
        console.log(" Données brutes reçues:", graphData);
        
        // DEBUG: Vérifier la structure des données
        if (graphData.nodes && graphData.nodes.length > 0) {
            console.log(" Premier nœud:", graphData.nodes[0]);
            console.log(" Structure words:", typeof graphData.nodes[0].words, graphData.nodes[0].words);
        }
        if (graphData.links && graphData.links.length > 0) {
            console.log(" Premier lien:", graphData.links[0]);
        }
        
        this.allNodes = this.validateNodes(graphData.nodes || []);
        this.allLinks = this.validateLinks(graphData.links || [], this.allNodes);
        
        console.log(" Données validées:");
        console.log(`- Nœuds: ${this.allNodes.length}`);
        console.log(`- Liens: ${this.allLinks.length}`);
        
        this.updateStats();
    }

    validateNodes(nodes) {
        console.log(" Validation des nœuds...");
        const validatedNodes = nodes.map((node, index) => {
            if (!node.id) {
                node.id = `node-${index}`;
            }
            
            // CORRECTION: Gestion robuste des words
            let wordsArray = [];
            if (Array.isArray(node.words)) {
                wordsArray = node.words;
            } else if (typeof node.words === 'string') {
                try {
                    // Essayer de parser si c'est une string JSON
                    const parsed = JSON.parse(node.words);
                    wordsArray = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    // Si ce n'est pas du JSON, traiter comme une string simple
                    wordsArray = node.words.split(',').map(w => w.trim()).filter(w => w);
                }
            } else if (node.words && typeof node.words === 'object') {
                // Si c'est un objet, prendre les valeurs
                wordsArray = Object.values(node.words);
            } else {
                wordsArray = [];
            }
            
            // Nettoyer les words
            wordsArray = wordsArray.map(word => {
                if (word && typeof word === 'object') {
                    return JSON.stringify(word); // Fallback pour les objets
                }
                return String(word || '');
            }).filter(word => word.trim() !== '');
            
            // Calculer la productivité
            node.productivity = Math.max(1, wordsArray.length);
            
            // Position aléatoire si non définie
            if (node.x === undefined || node.y === undefined) {
                const angle = Math.random() * 2 * Math.PI;
                const radius = 200 + Math.random() * 300;
                node.x = Math.cos(angle) * radius;
                node.y = Math.sin(angle) * radius;
            }
            
            return {
                id: String(node.id),
                x: node.x,
                y: node.y,
                vx: 0,
                vy: 0,
                fx: null,
                fy: null,
                words: wordsArray,
                productivity: node.productivity,
                community: node.community || 1,
                group: node.group || 1,
                degree: node.degree || 0
            };
        });
        
        console.log(` ${validatedNodes.length} nœuds validés`);
        if (validatedNodes.length > 0) {
            console.log("🔍 Exemple nœud validé:", validatedNodes[0]);
        }
        return validatedNodes;
    }

    validateLinks(links, validNodes) {
        console.log(" Validation des liens...");
        const nodeIds = new Set(validNodes.map(node => node.id));
        let validCount = 0;
        let invalidCount = 0;
        
        const validatedLinks = links.map(link => {
            let sourceId, targetId;
            
            // Extraction des IDs
            if (typeof link.source === 'object' && link.source.id) {
                sourceId = String(link.source.id);
            } else if (typeof link.source === 'string') {
                sourceId = link.source;
            } else {
                sourceId = String(link.source);
            }
            
            if (typeof link.target === 'object' && link.target.id) {
                targetId = String(link.target.id);
            } else if (typeof link.target === 'string') {
                targetId = link.target;
            } else {
                targetId = String(link.target);
            }
            
            const sourceExists = nodeIds.has(sourceId);
            const targetExists = nodeIds.has(targetId);
            
            if (!sourceExists || !targetExists) {
                console.warn(` Lien invalide: ${sourceId} -> ${targetId}`);
                invalidCount++;
                return null;
            }
            
            validCount++;
            
            return {
                source: sourceId,
                target: targetId,
                value: link.value || link.weight || 1,
                importance: link.value || link.weight || 1,
                id: link.id || `${sourceId}-${targetId}`
            };
        }).filter(link => link !== null);
        
        console.log(` Liens validés: ${validCount} valides, ${invalidCount} invalides`);
        if (validatedLinks.length > 0) {
            console.log(" Exemple lien validé:", validatedLinks[0]);
        }
        return validatedLinks;
    }

    showError(message) {
        console.error("🚨 Erreur affichée:", message);
        this.loadingScreen.html(`
            <div class="error">
                <h3>❌ Erreur</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="window.location.reload()">
                    🔄 Recharger
                </button>
            </div>
        `);
    }

    updateStats() {
        console.log(" Mise à jour des statistiques...");
        try {
            document.getElementById("node-count").textContent = this.allNodes.length;
            document.getElementById("link-count").textContent = this.allLinks.length;
            
            const communities = new Set(this.allNodes.map(d => d.community).filter(Boolean));
            document.getElementById("community-count").textContent = communities.size;
        } catch (error) {
            console.error("❌ Erreur dans updateStats:", error);
        }
    }

    initVisualization() {
        console.log(" Initialisation de la visualisation...");
        
        if (this.allNodes.length === 0) {
            this.showError("Aucun nœud à afficher");
            return;
        }
        
        this.container.html("");
        
        const containerWidth = this.container.node().getBoundingClientRect().width;
        const containerHeight = this.container.node().getBoundingClientRect().height;
        
        console.log(` Container: ${containerWidth}x${containerHeight}`);
        
        this.svg = this.container
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
            .style("background-color", "#f8f9fa")
            .call(d3.zoom()
                .scaleExtent([0.1, 4])
                .on("zoom", (event) => {
                    this.g.attr("transform", event.transform);
                }));

        this.g = this.svg.append("g");
        
        this.applyInitialFiltering();
        this.createSimulation();
        this.drawLinks();
        this.drawNodes();
        this.setupInteractions();
        
        this.startSimulation();
        
        // Debug approfondi
        setTimeout(() => {
            this.debugVisualization();
        }, 1000);
    }

    applyInitialFiltering() {
        this.currentLinks = this.filterLinksByImportance(this.currentMaxLinks);
        console.log(` Filtrage initial: ${this.allLinks.length} → ${this.currentLinks.length} liens`);
    }

    filterLinksByImportance(maxLinks) {
        const sortedLinks = [...this.allLinks].sort((a, b) => (b.importance || 1) - (a.importance || 1));
        const filtered = sortedLinks.slice(0, maxLinks);
        console.log(` Filtrage liens: ${this.allLinks.length} → ${filtered.length}`);
        return filtered;
    }

    filterNodesByProductivity(minProductivity) {
        const filtered = this.allNodes.filter(node => node.productivity >= minProductivity);
        return filtered;
    }

    createSimulation() {
        console.log(" Création de la simulation...");
        
        const filteredNodes = this.filterNodesByProductivity(this.currentMinProductivity);
        
        console.log(` Configuration simulation:
            - Nœuds: ${filteredNodes.length}
            - Liens: ${this.currentLinks.length}
        `);

        // CORRECTION: Recréer la simulation proprement
        if (this.simulation) {
            this.simulation.stop();
        }

        this.simulation = d3.forceSimulation(filteredNodes)
            .force("charge", d3.forceManyBody().strength(-50)) // Réduit la force pour plus de stabilité
            .force("center", d3.forceCenter(
                this.container.node().getBoundingClientRect().width / 2,
                this.container.node().getBoundingClientRect().height / 2
            ))
            .force("collision", d3.forceCollide().radius(d => this.calculateNodeRadius(d) + 2))
            .alphaDecay(0.05)
            .alpha(0.3);

        if (this.currentLinks.length > 0) {
            console.log("🔗 Ajout de la force 'link' à la simulation");
            this.simulation.force("link", d3.forceLink(this.currentLinks)
                .id(d => d.id)
                .distance(80)
                .strength(0.2));
        }

        this.simulation.on("tick", () => this.onTick());
        
        console.log(" Simulation créée");
    }

    startSimulation() {
        console.log("▶ Démarrage de la simulation...");
        
        if (this.simulation) {
            this.simulation.alpha(0.5).restart();
            console.log(" Simulation démarrée");
        } else {
            console.error(" Simulation non initialisée");
        }
    }

    calculateNodeRadius(d) {
        const baseSize = 6;
        const productivityBonus = Math.min(d.productivity * 0.5, 15);
        return baseSize + productivityBonus;
    }

    drawLinks() {
        console.log("🔍 DEBUG drawLinks - Début");
        this.g.selectAll(".link").remove();

        // Utiliser le même filtrage que pour la simulation
        const filteredNodes = this.filterNodesByProductivity(this.currentMinProductivity);
        const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
        
        // CORRECTION: Extraire correctement les IDs des liens
        const validLinks = this.currentLinks.filter(l => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
        });

        console.log(`🔗 Liens valides: ${validLinks.length}/${this.currentLinks.length}`);

        if (validLinks.length === 0) {
            console.log(" Aucun lien à dessiner après filtrage");
            return;
        }

        this.linkElements = this.g.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(validLinks, d => d.id)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke", "#2c3e50")
            .attr("stroke-opacity", 0.7)
            .attr("stroke-width", d => {
                const baseWidth = 1.5;
                const importanceWidth = Math.min((d.importance || 1) * 2, 6);
                return baseWidth + importanceWidth;
            });

        const linksInDOM = this.g.selectAll(".link").size();
        console.log(`✅ ${validLinks.length} liens dessinés, ${linksInDOM} dans le DOM`);
    }

    drawNodes() {
        console.log(" Dessin des nœuds...");

        const filteredNodes = this.filterNodesByProductivity(this.currentMinProductivity);

        // Supprimer les anciens nœuds
        this.g.selectAll(".node").remove();

        this.nodeElements = this.g.append("g")
            .attr("class", "nodes")
            .selectAll(".node")
            .data(filteredNodes, d => d.id)
            .enter().append("g")
            .attr("class", "node")
            .attr("data-id", d => d.id)
            .call(d3.drag()
                .on("start", (event, d) => this.dragstarted(event, d))
                .on("drag", (event, d) => this.dragged(event, d))
                .on("end", (event, d) => this.dragended(event, d)));

        this.nodeElements.append("circle")
            .attr("r", d => this.calculateNodeRadius(d))
            .attr("fill", d => this.colorScale(d.community || 1))
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .attr("cursor", "pointer");

        this.nodeElements.append("text")
            .text(d => d.id)
            .attr("dy", 4)
            .attr("text-anchor", "middle")
            .style("font-family", "'Amiri', serif")
            .style("font-size", "10px")
            .style("font-weight", "bold")
            .style("pointer-events", "none")
            .style("fill", "#2c3e50")
            .style("display", d => this.calculateNodeRadius(d) > 10 ? "block" : "none");

        this.nodes = this.nodeElements;
        console.log(`✅ ${filteredNodes.length} nœuds dessinés`);
    }

    setupInteractions() {
        console.log(" Configuration des interactions...");
        
        this.nodes.on("mouseover", (event, d) => {
            this.highlightNode(event, d);
        })
        .on("mouseout", (event, d) => {
            this.unhighlightNode(d);
        })
        .on("click", (event, d) => {
            this.showNodeDetails(d);
        });
        
        console.log(" Interactions configurées");
    }

    setupControls() {
        console.log(" Configuration des contrôles...");
        
        const maxProductivity = Math.max(...this.allNodes.map(node => node.productivity));
        const maxLinks = Math.min(2000, this.allLinks.length);
        
        const controlsHtml = `
            <div class="control-group">
                <input type="text" id="search" placeholder=" Rechercher une racine..." dir="rtl">
            </div>
            <br>
            <br>
            <div class="control-group">
                <div class="slider-container">
                    <label for="productivity-filter">Productivité des racines (≥):</label>
                    <input type="range" id="productivity-filter" min="1" max="${maxProductivity}" value="${this.currentMinProductivity}" step="1">
                    <span id="productivity-value">${this.currentMinProductivity}</span>
                </div>
            </div>
            
            <div class="control-group">
                <div class="slider-container">
                    <label for="links-filter">Liens les plus importants:</label>
                    <input type="range" id="links-filter" min="50" max="${maxLinks}" value="${this.currentMaxLinks}" step="50">
                    <span id="links-value">${this.currentMaxLinks}</span>
                </div>
            </div>
            <br>
            <br>
            <div class="control-group">
                <button id="reset-view" class="btn btn-secondary"> Réinitialiser vue</button>
                <button id="restart-simulation" class="btn btn-secondary"> Redémarrer simulation</button>
                <button id="debug-btn" class="btn btn-secondary"> Debug</button>
            </div>
        `;
        
        d3.select("#controls").html(controlsHtml);

        d3.select("#search").on("input", (event) => {
            const query = event.target.value.trim().toLowerCase();
            this.filterNodesBySearch(query);
        });

        d3.select("#productivity-filter").on("input", (event) => {
            const minProductivity = +event.target.value;
            this.currentMinProductivity = minProductivity;
            d3.select("#productivity-value").text(minProductivity);
            this.applyProductivityFilter(minProductivity);
        });

        d3.select("#links-filter").on("input", (event) => {
            const maxLinks = +event.target.value;
            this.currentMaxLinks = maxLinks;
            d3.select("#links-value").text(maxLinks);
            this.updateLinksFilter(maxLinks);
        });

        d3.select("#reset-view").on("click", () => this.resetView());
        d3.select("#restart-simulation").on("click", () => this.restartSimulation());
        d3.select("#debug-btn").on("click", () => this.debugVisualization());
        
        console.log("✅ Contrôles configurés");
    }

    debugVisualization() {
        console.log("🐛 DÉBOGAGE COMPLET =====================");
        
        console.log("📊 DONNÉES:");
        console.log("- Nœuds totaux:", this.allNodes.length);
        console.log("- Liens totaux:", this.allLinks.length);
        console.log("- Liens actuels:", this.currentLinks.length);
        
        const linksInDOM = this.g.selectAll(".link").size();
        const nodesInDOM = this.g.selectAll(".node").size();
        console.log("🔍 ÉLÉMENTS VISUELS:");
        console.log("- Liens dans DOM:", linksInDOM);
        console.log("- Nœuds dans DOM:", nodesInDOM);

        this.g.selectAll(".link").each(function(d, i) {
            if (i < 5) console.log("DOM link:", d);
        });
        this.g.selectAll(".node").each(function(d, i) {
            if (i < 5) console.log("DOM node:", d);
        });
        
        // Vérifier la structure des données
        if (this.allNodes.length > 0) {
            console.log("🔍 Structure du premier nœud:", this.allNodes[0]);
        }
        if (this.allLinks.length > 0) {
            console.log("🔍 Structure du premier lien:", this.allLinks[0]);
        }
        
        console.log("🐛 FIN DÉBOGAGE =========================");
    }

    filterNodesBySearch(query) {
        this.nodes.attr("display", d => 
            d.id.toLowerCase().includes(query) ? null : "none");
    }

    applyProductivityFilter(minProductivity) {
        console.log(`🎯 Filtrage productivité: ≥ ${minProductivity}`);
        this.createSimulation();
        this.redrawNodes();
        this.redrawLinks();
        this.startSimulation();
    }

    updateLinksFilter(maxLinks) {
        console.log(`🔗 Filtrage liens: ${maxLinks} plus importants`);
        this.currentLinks = this.filterLinksByImportance(maxLinks);
        this.createSimulation();
        this.redrawLinks();
        this.startSimulation();
    }

    redrawLinks() {
        this.drawLinks();
    }

    redrawNodes() {
        this.drawNodes();
        this.setupInteractions();
    }

    highlightNode(event, d) {
        this.nodes.select("circle")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2);
            
        d3.select(event.currentTarget).select("circle")
            .attr("stroke", "#e34a33")
            .attr("stroke-width", 3);
        
        this.g.selectAll(".link")
            .attr("stroke-opacity", l => {
                // CORRECTION: Gérer les objets et strings
                const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                return (sourceId === d.id || targetId === d.id) ? 1 : 0.2;
            });
    }

    unhighlightNode(d) {
        this.nodes.select("circle")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2);
        
        this.g.selectAll(".link")
            .attr("stroke-opacity", 0.7);
    }

    showNodeDetails(d) {
        console.log(`📖 Affichage détails: ${d.id}`, d);
        
        // CORRECTION: Parser correctement les données structurées
        let wordsData = [];
        
        if (Array.isArray(d.words)) {
            // Si c'est déjà un array, traiter chaque élément
            d.words.forEach(word => {
                if (typeof word === 'string' && word.includes('{') && word.includes('}')) {
                    try {
                        // Essayer de parser les strings JSON
                        const parsed = JSON.parse(word);
                        wordsData.push(parsed);
                    } catch (e) {
                        // Si échec, garder la string
                        wordsData.push({ value: word });
                    }
                } else if (typeof word === 'object') {
                    // Si c'est déjà un objet, l'utiliser directement
                    wordsData.push(word);
                } else {
                    // Sinon, créer un objet simple
                    wordsData.push({ value: String(word) });
                }
            });
        } else {
            wordsData = [{ value: String(d.words || '') }];
        }
        
        console.log("🔍 Données words parsées:", wordsData);
        
        // Filtrer les données valides
        const validWords = wordsData.filter(word => word && word.value && word.value.trim() !== '');
        
        const displayedWords = validWords.slice(0, 15);
        
        const content = `
            <h3 class="arabic-title">${d.id}</h3>
            <div class="node-stats">
                <div class="stat">
                    <span class="stat-label">Productivité:</span>
                    <span class="stat-value">${d.productivity} mots dérivés</span>
                </div>
                ${d.community ? `
                <div class="stat">
                    <span class="stat-label">Communauté:</span>
                    <span class="stat-value">${d.community}</span>
                </div>
                ` : ''}
                ${d.degree ? `
                <div class="stat">
                    <span class="stat-label">Connexions:</span>
                    <span class="stat-value">${d.degree}</span>
                </div>
                ` : ''}
            </div>
            <div class="word-count">${validWords.length} mots dérivés${validWords.length > 15 ? ' (15 affichés)' : ''}</div>
            <div class="word-list">
                ${displayedWords.map(word => this.formatArabicWord(word)).join('')}
                ${validWords.length > 15 ? `
                <div class="more-words">
                    <p>... et ${validWords.length - 15} autres mots dérivés</p>
                </div>
                ` : ''}
            </div>
            <div class="node-actions">
                <a href="/analyze?word=${encodeURIComponent(d.id)}" class="btn btn-primary">
                    🔍 Analyser cette racine
                </a>
            </div>
        `;
        
        document.getElementById("panel-content").innerHTML = content;
        this.detailPanel.classed("show", true);
        
        // Ajouter les styles
        this.addArabicCardStyles();
    }

    formatArabicWord(wordData) {
        const arabicWord = wordData.value || '';
        const synsetId = wordData.synsetid || '';
        const isPrimary = wordData.is_primary || false;
        
        // Déterminer le type de mot
        let wordType = 'Autres dérivés';
        let typeClass = 'derived-word';
        let typeIcon = '↳';
        
        if (isPrimary) {
            wordType = 'Dérivé principal';
            typeClass = 'primary-word';
            typeIcon = '';
        }
        
        // Extraire le synonyme proche
        const nearestWord = synsetId ? this.extractNearestWord(synsetId) : '';
        
        return `
            <div class="word-item ${typeClass}">
                <div class="word-header">
                    <span class="word-icon">${typeIcon}</span>
                    <span class="word-type">${wordType}</span>
                </div>
                <div class="word-content">
                    <span class="arabic-word">${arabicWord}</span>
                    ${nearestWord ? `
                    <div class="nearest-info">
                        <span class="nearest-label">mot le plus proche :</span>
                        <span class="nearest-value">${nearestWord}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // NOUVELLE MÉTHODE: Extraire un mot proche du synset ID avec debugging
    extractNearestWord(synsetId) {
        console.log("🔍 Conversion synsetId:", synsetId);
        
        // Table de conversion complète
        const conversionTable = {
            '>': 'ء', '|': 'آ', '&': 'ؤ', '<': 'إ', '}': 'ئ', 'A': 'ا',
            'b': 'ب', 'p': 'ة', 't': 'ت', 'v': 'ث', 'j': 'ج', 'H': 'ح', 'x': 'خ',
            'd': 'د', '*': 'ذ', 'r': 'ر', 'z': 'ز', 's': 'س', '$': 'ش', 'S': 'ص',
            'D': 'ض', 'T': 'ط', 'Z': 'ظ', 'E': 'ع', 'g': 'غ', '_': 'ـ', 'f': 'ف',
            'q': 'ق', 'k': 'ك', 'l': 'ل', 'm': 'م', 'n': 'ن', 'h': 'ه', 'w': 'و',
            'Y': 'ى', 'y': 'ي', 'F': 'ً', 'N': 'ٌ', 'K': 'ٍ', 'a': 'َ', 'u': 'ُ',
            'i': 'ِ', '~': 'ّ', 'o': 'ْ', '`': 'ٰ', '{': 'ٱ', 'P': 'پ', 'J': 'چ',
            'V': 'ڤ', 'G': 'گ'
        };

        if (synsetId && typeof synsetId === 'string') {
            // Séparer le synset ID pour obtenir la partie mot (avant le premier underscore)
            const parts = synsetId.split('_');
            if (parts.length > 0) {
                let wordPart = parts[0];
                console.log("🔍 Partie à convertir:", wordPart);
                
                // Convertir caractère par caractère
                let arabicWord = '';
                for (let char of wordPart) {
                    if (conversionTable[char] !== undefined) {
                        arabicWord += conversionTable[char];
                        console.log(`🔍 ${char} → ${conversionTable[char]}`);
                    } else {
                        // Ignorer les chiffres et caractères non dans la table
                        if (!/\d/.test(char)) {
                            arabicWord += char;
                        }
                        console.log(`🔍 ${char} → ignoré/gardé`);
                    }
                }
                
                console.log("🔍 Résultat conversion:", arabicWord);
                
                // Nettoyer les caractères non-arabes restants (meilleur regex)
                const cleanArabic = arabicWord.replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '');
                console.log("🔍 Après nettoyage:", cleanArabic);
                
                return cleanArabic || synsetId;
            }
        }
        
        console.log("🔍 Retour fallback:", synsetId);
        return synsetId;
    }

    addArabicCardStyles() {
        if (!document.getElementById('arabic-card-styles')) {
            const styles = `
                <style id="arabic-card-styles">
                    .arabic-title {
                        font-family: 'Amiri', 'Traditional Arabic', serif;
                        font-size: 1.8em;
                        font-weight: bold;
                        text-align: center;
                        color: #2c3e50;
                        margin-bottom: 15px;
                        border-bottom: 2px solid #3498db;
                        padding-bottom: 10px;
                    }
                    
                    .word-list {
                        max-height: 400px;
                        overflow-y: auto;
                        margin: 15px 0;
                        padding: 10px;
                        background: #f8f9fa;
                        border-radius: 8px;
                        border: 1px solid #e9ecef;
                    }
                    
                    .word-item {
                        padding: 12px;
                        margin-bottom: 10px;
                        border-radius: 6px;
                        background: white;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        border-left: 4px solid #bdc3c7;
                    }
                    
                    .word-item.primary-word {
                        border-left-color: #e74c3c;
                        background: #fff5f5;
                    }
                    
                    .word-item.derived-word {
                        border-left-color: #3498db;
                    }
                    
                    .word-header {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 8px;
                        flex-wrap: wrap;
                    }
                    
                    .word-icon {
                        font-size: 1em;
                    }
                    
                    .word-type {
                        font-size: 0.75em;
                        font-weight: 600;
                        color: #7f8c8d;
                        text-transform: uppercase;
                        background: #ecf0f1;
                        padding: 2px 6px;
                        border-radius: 3px;
                    }
                    
                    .synset-badge {
                        font-size: 0.7em;
                        font-family: monospace;
                        background: #34495e;
                        color: white;
                        padding: 2px 6px;
                        border-radius: 3px;
                        margin-left: auto;
                    }
                    
                    .word-content {
                        text-align: right;
                    }
                    
                    .arabic-word {
                        font-family: 'Amiri', 'Traditional Arabic', serif;
                        font-size: 1.4em;
                        font-weight: bold;
                        color: #2c3e50;
                        display: block;
                        margin-bottom: 5px;
                    }
                    
                    .nearest-info {
                        font-size: 0.85em;
                        color: #7f8c8d;
                        margin-top: 5px;
                    }
                    
                    .nearest-label {
                        font-family: system-ui, -apple-system, sans-serif;
                        color: #95a5a6;
                    }
                    
                    .nearest-value {
                        font-family: 'Amiri', 'Traditional Arabic', serif;
                        color: #34495e;
                        font-weight: 500;
                        margin-right: 5px;
                    }
                    
                    .word-count {
                        text-align: center;
                        font-size: 0.9em;
                        color: #7f8c8d;
                        font-style: italic;
                        margin: 10px 0;
                    }
                    
                    .more-words {
                        text-align: center;
                        margin-top: 15px;
                        padding-top: 10px;
                        border-top: 1px dashed #bdc3c7;
                        color: #7f8c8d;
                        font-style: italic;
                    }
                    
                    .node-stats {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 8px;
                        margin: 15px 0;
                    }
                    
                    .stat {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 12px;
                        background: #ecf0f1;
                        border-radius: 5px;
                    }
                    
                    .stat-label {
                        font-weight: 600;
                        color: #555;
                    }
                    
                    .stat-value {
                        font-weight: bold;
                        color: #2c3e50;
                    }
                    
                    .node-actions {
                        text-align: center;
                        margin-top: 20px;
                        padding-top: 15px;
                        border-top: 1px solid #ecf0f1;
                    }
                    
                    .btn-primary {
                        background: #3498db;
                        color: white;
                        padding: 10px 20px;
                        border-radius: 5px;
                        text-decoration: none;
                        display: inline-block;
                        font-weight: 600;
                        transition: background 0.3s;
                    }
                    
                    .btn-primary:hover {
                        background: #2980b9;
                    }
                </style>
            `;
            document.head.insertAdjacentHTML('beforeend', styles);
        }
    }

    onTick() {
        try {
            // CORRECTION CRITIQUE: Utiliser directement les objets de D3
            if (this.currentLinks.length > 0 && this.linkElements) {
                this.linkElements
                    .attr("x1", d => {
                        // D3.js convertit les strings en objets, utiliser directement
                        return typeof d.source === 'object' ? d.source.x : 0;
                    })
                    .attr("y1", d => {
                        return typeof d.source === 'object' ? d.source.y : 0;
                    })
                    .attr("x2", d => {
                        return typeof d.target === 'object' ? d.target.x : 0;
                    })
                    .attr("y2", d => {
                        return typeof d.target === 'object' ? d.target.y : 0;
                    });
            }

            if (this.nodes) {
                this.nodes
                    .attr("transform", d => `translate(${d.x || 0},${d.y || 0})`);
            }
        } catch (error) {
            console.error("❌ Erreur dans onTick:", error);
        }
    }

    resetView() {
        this.simulation.alpha(0.5).restart();
    }

    restartSimulation() {
        if (this.simulation) {
            this.simulation.alpha(0.5).restart();
        }
    }

    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
}

// Initialisation
if (document.getElementById('graph-container')) {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("🚀 Initialisation du réseau...");
        window.networkViz = new NetworkVisualization();
    });
}