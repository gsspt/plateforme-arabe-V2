# Données de la Plateforme Éducative Arabe V2

Ce dossier contient toutes les données nécessaires au fonctionnement de la plateforme.

## Structure
data/
├── buckwalter/ # Données morphologiques Buckwalter
│ ├── dictPrefixes.txt # Préfixes arabes
│ ├── dictStems.txt # Radicaux et racines
│ ├── dictSuffixes.txt # Suffixes arabes
│ ├── tableAB.txt # Table de compatibilité A-B
│ ├── tableAC.txt # Table de compatibilité A-C
│ └── tableBC.txt # Table de compatibilité B-C
├── network_data.json # Données du réseau sémantique
└── arabic_platform.db # Base de données SQLite (créée automatiquement)


## Fichiers Buckwalter

Les fichiers Buckwalter utilisent le système de translittération Buckwalter pour représenter l'arabe en caractères ASCII.

### Format des fichiers

- **dictStems.txt** : Contient les radicaux avec leurs formes dérivées
- **dictPrefixes.txt** : Contient les préfixes grammaticaux
- **dictSuffixes.txt** : Contient les suffixes grammaticaux
- **tableAB.txt, tableAC.txt, tableBC.txt** : Tables de compatibilité morphologique

### Exemple de ligne dans dictStems.txt
;--- ktb
;; stem_1
ktb katab PV katab/VERB_PERFECT


## network_data.json

Fichier JSON contenant les données pour la visualisation du réseau des racines.

Format :
```json
{
  "nodes": [
    {
      "id": "racine_arabe",
      "group": 1,
      "community": 1,
      "words": ["mot1", "mot2", ...],
      "degree": 5
    }
  ],
  "links": [
    {
      "source": "racine1",
      "target": "racine2", 
      "value": 0.8
    }
  ]
}


## **32. README.md**
```markdown
# 📖 Plateforme Éducative Arabe V2

Une plateforme web avancée pour l'analyse linguistique et morphologique de la langue arabe.

## 🚀 Fonctionnalités

### 🔍 Analyseur Morphologique
- Analyse complète des mots arabes
- Identification des racines et formes dérivées
- Support de la translittération Buckwalter
- Catégorisation grammaticale avancée

### 🌐 Réseau des Racines
- Visualisation interactive des connections sémantiques
- Filtrage par productivité des racines
- Détection de communautés lexicales
- Navigation intuitive

### 📄 OCR Arabe
- Reconnaissance de texte arabe dans les PDF
- Intégration Google Vision API
- Optimisation pour l'écriture arabe RTL
- Export des résultats

### 💾 Gestion des Données
- Historique des recherches
- Système de favoris
- Statistiques d'usage
- Cache performant

## 🛠️ Installation

### Prérequis
- Python 3.8+
- pip
- Clé API Google Vision (pour l'OCR)

### Installation rapide

1. **Cloner le repository**
```bash
git clone <repository-url>
cd plateforme_arabe_v2