// content.js - Script principal qui s'exécute sur les pages Pronote

console.log('Content script PRONOTE Average Extension chargé');

// Variables globales pour mémoriser les calculs
let cachedSimpleAverage = null;
let cachedWeightedAverage = null;
let currentDisplayType = null;
let calculatorEnabled = true; // Par défaut activé

// Fonction pour vérifier si on est sur la page Notes
function isOnNotesPage() {
    // Vérifier l'URL
    const url = window.location.href;
    if (!url.includes('pronote') && !url.includes('index-education')) {
        return false;
    }
    
    // Recherche spécifique des éléments de notes PRONOTE
    const noteElements = document.querySelectorAll('.note-devoir');
    
    if (noteElements.length === 0) {
        console.log('Vérification page Notes: Aucun élément .note-devoir trouvé');
        return false;
    }
    
    // Test rapide : essayer d'extraire au moins une note valide
    let validNotesCount = 0;
    for (let i = 0; i < Math.min(noteElements.length, 5); i++) { // Test seulement les 5 premiers
        const noteElement = noteElements[i];
        const noteText = noteElement.textContent || '';
        
        // Vérifier si on peut extraire une note de ce texte
        const noteMatch = noteText.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
        if (noteMatch) {
            validNotesCount++;
        }
    }
    
    const canExtractNotes = validNotesCount > 0;
    
    console.log('Vérification page Notes:', {
        url: url,
        noteElementsFound: noteElements.length,
        validNotesCount: validNotesCount,
        canExtractNotes: canExtractNotes,
        isNotesPage: canExtractNotes
    });
    
    return canExtractNotes;
}

// Fonction pour vérifier si la calculatrice est activée
async function isCalculatorEnabled() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['calculatorEnabled'], function(result) {
            resolve(result.calculatorEnabled !== false); // Par défaut activé
        });
    });
}

// Fonction globale pour extraire un nombre d'une chaîne
    function extractNumber(text) {
        if (!text) return null;
        
        // Recherche de patterns comme "15/20", "15,5/20", "15.5/20"
        const match = text.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
        if (match) {
            return {
                grade: parseFloat(match[1].replace(',', '.')),
                max: parseFloat(match[2].replace(',', '.'))
            };
        }
        
        // Recherche de patterns comme "15", "15,5", "15.5"
        const simpleMatch = text.match(/(\d+(?:[.,]\d+)?)/);
        if (simpleMatch) {
            return {
                grade: parseFloat(simpleMatch[1].replace(',', '.')),
                max: 20 // Valeur par défaut
            };
        }
        
        return null;
    }
    
// Fonction pour extraire les notes de la page
function extractGrades() {
    const grades = [];
    const subjects = new Map();
    
    // Cibler spécifiquement les éléments avec la classe "note-devoir" qui contiennent les vraies notes
    const noteElements = document.querySelectorAll('.note-devoir');
    
    noteElements.forEach(noteElement => {
        const text = noteElement.textContent || noteElement.innerText || '';
        
        // Vérifier si c'est une note
        const gradeData = extractNumber(text);
        if (gradeData && gradeData.grade >= 0 && gradeData.grade <= gradeData.max) {
            // Trouver la matière associée en remontant dans la hiérarchie DOM
            let subject = 'Matière inconnue';
            
            // Chercher dans les éléments parents pour trouver le titre de la matière
            let parent = noteElement.parentElement;
            let attempts = 0;
            while (parent && attempts < 10) {
                // Chercher un élément avec la classe "titre-principal" qui contient le nom de la matière
                const titrePrincipal = parent.querySelector('.titre-principal');
                if (titrePrincipal) {
                    const titreText = titrePrincipal.textContent || '';
                    // Le premier div dans titre-principal contient le nom de la matière
                    const matiereDiv = titrePrincipal.querySelector('div');
                    if (matiereDiv) {
                        subject = matiereDiv.textContent.trim();
                        break;
                    }
                }
                
                parent = parent.parentElement;
                attempts++;
            }
            
            grades.push({
                grade: gradeData.grade,
                max: gradeData.max,
                subject: subject,
                element: noteElement
            });
            
            // Ajouter à la map des matières
            if (!subjects.has(subject)) {
                subjects.set(subject, []);
            }
            subjects.get(subject).push(gradeData.grade);
        }
    });
    
    return { grades, subjects };
}


// Fonction pour extraire les coefficients en cliquant sur les notes
async function extractCoefficients() {
    const gradesWithCoeffs = [];
    const noteElements = document.querySelectorAll('.note-devoir');
    
    console.log(`Extraction des coefficients pour ${noteElements.length} notes...`);
    
    for (let i = 0; i < noteElements.length; i++) {
        const noteElement = noteElements[i];
        const text = noteElement.textContent || noteElement.innerText || '';
        
        // Extraire les données de base de la note
        const gradeData = extractNumber(text);
        if (!gradeData) continue;
        
        // Trouver la matière
        let subject = 'Matière inconnue';
        let parent = noteElement.parentElement;
        let attempts = 0;
        while (parent && attempts < 10) {
            const titrePrincipal = parent.querySelector('.titre-principal');
            if (titrePrincipal) {
                const matiereDiv = titrePrincipal.querySelector('div');
                if (matiereDiv) {
                    subject = matiereDiv.textContent.trim();
                    break;
                }
            }
            parent = parent.parentElement;
            attempts++;
        }
        
        try {
            // Cliquer sur la note pour ouvrir la fenêtre de détails
            noteElement.click();
            
            // Attendre que le panneau de droite se mette à jour avec les détails de la note
            await new Promise(resolve => setTimeout(resolve, 300));
            
            let coefficient = 1; // Coefficient par défaut
            
            // Chercher le coefficient dans le panneau de droite (pas dans une fenêtre modale)
            // D'après l'image, le coefficient est affiché dans le panneau de droite sous "Coefficient: X"
            const rightPanelSelectors = [
                '[class*="detail"]',
                '[class*="panel"]', 
                '.contenu-detail',
                '.detail-note',
                '.panel-droit',
                '.zone-detail'
            ];
            
            let rightPanel = null;
            for (const selector of rightPanelSelectors) {
                rightPanel = document.querySelector(selector);
                if (rightPanel) break;
            }
            
            if (rightPanel) {
                const panelText = rightPanel.textContent || '';
                console.log(`Contenu du panneau de droite pour ${subject}:`, panelText);
                
                // Chercher le pattern "Coefficient: X" ou "Coefficient : X"
                const coeffMatch = panelText.match(/[Cc]oefficient\s*:\s*(\d+(?:[.,]\d+)?)/i);
                if (coeffMatch) {
                    coefficient = parseFloat(coeffMatch[1].replace(',', '.'));
                    console.log(`Coefficient trouvé dans le panneau: ${coefficient}`);
                } else {
                    console.log(`Aucun coefficient trouvé pour ${subject}, utilisation du défaut: 1`);
                }
            } else {
                console.log(`Panneau de droite non trouvé pour ${subject}`);
            }
            
            gradesWithCoeffs.push({
                grade: gradeData.grade,
                max: gradeData.max,
                subject: subject,
                coefficient: coefficient,
                element: noteElement
            });
            
            console.log(`Note ${i + 1}/${noteElements.length}: ${gradeData.grade}/${gradeData.max} (${subject}) - Coeff: ${coefficient}`);
            
        } catch (error) {
            console.warn(`Erreur lors de l'extraction du coefficient pour la note ${i + 1}:`, error);
            // En cas d'erreur, utiliser un coefficient par défaut
            gradesWithCoeffs.push({
                grade: gradeData.grade,
                max: gradeData.max,
                subject: subject,
                coefficient: 1,
                element: noteElement
            });
        }
    }
    
    return gradesWithCoeffs;
}

// Fonction pour calculer la moyenne pondérée avec coefficients
async function calculateWeightedAverage() {
    try {
        console.log('Calcul de la moyenne pondérée avec coefficients...');
        
        // Extraire les notes avec leurs coefficients
        const gradesWithCoeffs = await extractCoefficients();
        
        if (gradesWithCoeffs.length === 0) {
            return {
                success: false,
                error: 'Aucune note trouvée sur cette page'
            };
        }
        
        // Calcul de la moyenne pondérée
        let totalWeightedGrade = 0;
        let totalWeightedMax = 0;
        const subjects = new Map();
        
        gradesWithCoeffs.forEach(grade => {
            // Ignorer les notes avec coefficient 0
            if (grade.coefficient === 0) {
                console.log(`Note ignorée (coeff 0): ${grade.grade}/${grade.max} en ${grade.subject}`);
                return;
            }
            
            // Formule PRONOTE : (note × coeff) / (max × coeff) × 20
            const weightedGrade = grade.grade * grade.coefficient;
            const weightedMax = grade.max * grade.coefficient;
            
            totalWeightedGrade += weightedGrade;
            totalWeightedMax += weightedMax;
            
            console.log(`Note comptée: ${grade.grade} × ${grade.coefficient} = ${weightedGrade}, Max: ${grade.max} × ${grade.coefficient} = ${weightedMax} en ${grade.subject}`);
            
            // Ajouter à la map des matières
            if (!subjects.has(grade.subject)) {
                subjects.set(grade.subject, []);
            }
            subjects.get(grade.subject).push({
                grade: grade.grade,
                max: grade.max,
                coefficient: grade.coefficient,
                original: `${grade.grade}/${grade.max}`
            });
        });
        
        if (totalWeightedMax === 0) {
            return {
                success: false,
                error: 'Toutes les notes ont un coefficient de 0'
            };
        }
        
        // Formule PRONOTE : (somme des notes × coeff) / (somme des max × coeff) × 20
        const weightedAverage = (totalWeightedGrade / totalWeightedMax) * 20;
        
        // Calcul des moyennes par matière (formule PRONOTE)
        const subjectAverages = [];
        subjects.forEach((subjectGrades, subjectName) => {
            // Filtrer les notes avec coefficient > 0
            const validGrades = subjectGrades.filter(g => g.coefficient > 0);
            
            if (validGrades.length === 0) {
                console.log(`Matière ${subjectName}: aucune note valide (tous coeff 0)`);
                return;
            }
            
            // Formule PRONOTE pour chaque matière
            const totalWeightedGrade = validGrades.reduce((sum, g) => sum + (g.grade * g.coefficient), 0);
            const totalWeightedMax = validGrades.reduce((sum, g) => sum + (g.max * g.coefficient), 0);
            const subjectAverage = (totalWeightedGrade / totalWeightedMax) * 20;
            
            console.log(`Matière ${subjectName}: ${validGrades.length} notes valides, moyenne = ${subjectAverage.toFixed(2)}`);
            
            subjectAverages.push({
                name: subjectName,
                average: subjectAverage,
                count: validGrades.length,
                totalCoefficient: validGrades.reduce((sum, g) => sum + g.coefficient, 0),
                originalGrades: validGrades.map(g => g.original)
            });
        });
        
        // Compter les notes valides (avec coefficient > 0)
        const validGradesCount = gradesWithCoeffs.filter(g => g.coefficient > 0).length;
        
        const result = {
            success: true,
            data: {
                average: weightedAverage,
                totalGrades: gradesWithCoeffs.length,
                validGrades: validGradesCount,
                totalCoefficient: totalWeightedMax / 20, // Coefficient total pondéré
                subjects: subjectAverages,
                allGrades: gradesWithCoeffs.map(g => ({
                    ...g,
                    normalizedGrade: (g.grade / g.max) * 20
                }))
            }
        };
        
        // Mémoriser le résultat
        cachedWeightedAverage = result;
        
        return result;
        
    } catch (error) {
        return {
            success: false,
            error: 'Erreur lors du calcul pondéré: ' + error.message
        };
    }
}

// Fonction pour calculer la moyenne simple (sans coefficients)
function calculateAverage() {
    try {
        const { grades, subjects } = extractGrades();
        
        if (grades.length === 0) {
            return {
                success: false,
                error: 'Aucune note trouvée sur cette page'
            };
        }
        
        // Calcul de la moyenne générale en convertissant toutes les notes sur 20
        const totalGrade = grades.reduce((sum, grade) => {
            // Convertir la note sur 20
            const normalizedGrade = (grade.grade / grade.max) * 20;
            return sum + normalizedGrade;
        }, 0);
        const average = totalGrade / grades.length;
        
        // Calcul des moyennes par matière (en convertissant sur 20)
        const subjectAverages = [];
        subjects.forEach((subjectGrades, subjectName) => {
            // Trouver les notes correspondantes pour cette matière
            const subjectGradeObjects = grades.filter(g => g.subject === subjectName);
            const normalizedGrades = subjectGradeObjects.map(g => (g.grade / g.max) * 20);
            const subjectAverage = normalizedGrades.reduce((sum, grade) => sum + grade, 0) / normalizedGrades.length;
            
            subjectAverages.push({
                name: subjectName,
                average: subjectAverage,
                count: subjectGrades.length,
                originalGrades: subjectGradeObjects.map(g => `${g.grade}/${g.max}`)
            });
        });
        
        // Déterminer la note maximale la plus fréquente
        const maxGrades = grades.map(g => g.max);
        const maxGradeCounts = {};
        maxGrades.forEach(max => {
            maxGradeCounts[max] = (maxGradeCounts[max] || 0) + 1;
        });
        const mostCommonMax = Object.keys(maxGradeCounts).reduce((a, b) => 
            maxGradeCounts[a] > maxGradeCounts[b] ? a : b
        );
        
        const result = {
            success: true,
            data: {
                average: average,
                totalGrades: grades.length,
                maxGrade: parseFloat(mostCommonMax),
                subjects: subjectAverages,
                allGrades: grades
            }
        };
        
        // Mémoriser le résultat
        cachedSimpleAverage = result;
        
        return result;
        
    } catch (error) {
        return {
            success: false,
            error: 'Erreur lors du calcul: ' + error.message
        };
    }
}

// Fonction de test pour forcer l'affichage de l'interface
function forceShowInterface() {
    // Vérifier si on est sur la page Notes
    if (!isOnNotesPage()) {
        console.log('Pas sur la page Notes, interface de test non créée');
        return;
    }
    
    console.log('=== FORÇAGE DE L\'AFFICHAGE DE L\'INTERFACE ===');
    
    // Supprimer l'ancienne interface si elle existe
    const existingInterface = document.getElementById('pronote-average-integrated');
    if (existingInterface) {
        existingInterface.remove();
    }
    
    // Créer l'interface en position fixe
    const interface = document.createElement('div');
    interface.id = 'pronote-average-integrated';
        interface.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 300px;
            background: #ffffff;
            border: 2px solid #28a745;
            border-radius: 8px;
            padding: 15px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
        `;
    
    interface.innerHTML = `
        <style>
            /* Règles pour éviter les conflits avec PRONOTE */
            #pronote-average-integrated * {
                box-sizing: border-box !important;
                background-image: none !important;
            }
            
            #pronote-average-integrated *::before,
            #pronote-average-integrated *::after {
                background-image: none !important;
            }
            
            /* Supprimer tous les effets de fond bleu de PRONOTE */
            #pronote-average-integrated,
            #pronote-average-integrated *,
            #pronote-average-integrated *::before,
            #pronote-average-integrated *::after {
                background-color: transparent !important;
            }
            
            #pronote-average-integrated .pronote-display {
                background-color: #ffffff !important;
            }
            
            #pronote-average-integrated .pronote-details {
                background-color: #ffffff !important;
            }
            
            #pronote-average-integrated .pronote-button {
                background-color: #6c757d !important;
            }
            
            #pronote-average-integrated {
                all: initial !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                position: fixed !important;
                bottom: 20px !important;
                right: 20px !important;
                width: 300px !important;
                background: #ffffff !important;
                border: 1px solid #e9ecef !important;
                border-radius: 8px !important;
                padding: 15px !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
                z-index: 10000 !important;
                display: block !important;
            }
            
            .pronote-interface {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                background: transparent !important;
            }
            
            .pronote-title {
                margin: 0 0 15px 0;
                color: #2c3e50;
                font-size: 18px;
                font-weight: 700;
                text-align: center;
                border-bottom: 2px solid #e9ecef;
                padding-bottom: 8px;
            }
            
            .pronote-button {
                border: none;
                padding: 12px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                flex: 1;
                min-width: 0;
            }
            
            .pronote-button::before {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: -100% !important;
                width: 100% !important;
                height: 100% !important;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent) !important;
                transition: left 0.5s !important;
            }
            
            .pronote-button:hover::before {
                left: 100% !important;
            }
            
            .pronote-button::after {
                display: none !important;
            }
            
            .pronote-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.15);
            }
            
            .pronote-button:active {
                transform: translateY(0);
                transition: transform 0.1s;
            }
            
            .btn-simple {
                background: linear-gradient(135deg, #6c757d, #868e96);
                color: white;
            }
            
            .btn-weighted {
                background: linear-gradient(135deg, #6c757d, #868e96);
                color: white;
            }
            
            .btn-details-simple {
                background: linear-gradient(135deg, #6c757d, #868e96);
                color: white;
            }
            
            .btn-details-weighted {
                background: linear-gradient(135deg, #6c757d, #868e96);
                color: white;
            }
            
            .pronote-display {
                background: #ffffff !important;
                border: 2px solid #e9ecef !important;
                border-radius: 8px !important;
                padding: 15px !important;
                text-align: center !important;
                min-height: 50px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.3s ease !important;
                position: relative !important;
            }
            
            .pronote-display:hover {
                border-color: #e9ecef !important;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1) !important;
            }
            
            .pronote-display::before {
                display: none !important;
            }
            
            .pronote-display::after {
                display: none !important;
            }
            
            .pronote-display:hover {
                border-color: #e9ecef;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            }
            
            .pronote-details {
                background: linear-gradient(135deg, #ffffff, #f8f9fa);
                border: 2px solid #e9ecef;
                border-radius: 8px;
                padding: 15px;
                margin-top: 12px;
                display: none;
                max-height: 250px;
                overflow-y: auto;
                animation: slideDown 0.3s ease-out;
            }
            
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .pronote-status {
                font-size: 12px;
                color: #7f8c8d;
                margin-top: 12px;
                text-align: center;
                font-style: italic;
                transition: color 0.3s ease;
            }
            
            .pronote-status.loading {
                color: #6c757d;
            }
            
            .pronote-status.success {
                color: #27ae60;
            }
            
            .pronote-status.error {
                color: #e74c3c;
            }
            
            .button-container {
                display: flex;
                gap: 20px;
                margin-bottom: 15px;
                align-items: center;
            }
            
            .button-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
                flex: 1;
            }
            
            .separator {
                width: 4px;
                height: 70px;
                background: linear-gradient(to bottom, #495057, #212529, #495057);
                border-radius: 3px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                border: 1px solid #343a40;
            }
            
            .subject-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #ecf0f1;
                font-size: 13px;
                transition: background 0.2s ease;
            }
            
            .subject-item:hover {
                background: rgba(0, 0, 0, 0.05);
                padding-left: 8px;
                border-radius: 4px;
            }
            
            .subject-name {
                color: #2c3e50;
                font-weight: 600;
            }
            
            .subject-average {
                color: #7f8c8d;
                font-weight: 700;
            }
        </style>
        
        <div class="pronote-interface">
            <h3 class="pronote-title">Calculatrice de Moyenne</h3>
            
            <div class="button-container">
                <div class="button-group">
                    <button id="btn-calc-simple" class="pronote-button btn-simple">Moyenne Simple</button>
                    <button id="btn-details-simple" class="pronote-button btn-details-simple">Détails Simple</button>
                </div>
                
                <div class="separator"></div>
                
                <div class="button-group">
                    <button id="btn-calc-weighted" class="pronote-button btn-weighted">Moyenne Pondérée</button>
                    <button id="btn-details-weighted" class="pronote-button btn-details-weighted">Détails Pondéré</button>
                </div>
            </div>
            
            <div id="average-display" class="pronote-display">
                <span style="color: #7f8c8d; font-size: 14px;">Cliquez sur un bouton pour calculer</span>
            </div>
            
            <div id="details-display" class="pronote-details">
                <div id="details-content"></div>
            </div>
            
            <div id="status-text" class="pronote-status">Prêt</div>
        </div>
    `;
    
    // Ajouter au body
    document.body.appendChild(interface);
    
    // Ajouter les event listeners
    setupIntegratedInterfaceEvents();
    
    console.log('Interface de test créée en position fixe');
}

// Fonction pour créer l'interface intégrée dans PRONOTE
async function createIntegratedInterface() {
    // Vérifier si on est sur la page Notes
    if (!isOnNotesPage()) {
        console.log('Pas sur la page Notes, interface non créée');
        return;
    }
    
    // Vérifier si la calculatrice est activée
    calculatorEnabled = await isCalculatorEnabled();
    if (!calculatorEnabled) {
        console.log('Calculatrice désactivée, interface non créée');
        return;
    }
    
    // Supprimer l'ancienne interface si elle existe
    const existingInterface = document.getElementById('pronote-average-integrated');
    if (existingInterface) {
        existingInterface.remove();
    }
    
    // Créer l'interface intégrée
    const interface = document.createElement('div');
    interface.id = 'pronote-average-integrated';
    
    interface.innerHTML = `
        <style>
            /* Règles pour éviter les conflits avec PRONOTE */
            #pronote-average-integrated * {
                box-sizing: border-box !important;
                background-image: none !important;
            }
            
            #pronote-average-integrated *::before,
            #pronote-average-integrated *::after {
                background-image: none !important;
            }
            
            /* Supprimer tous les effets de fond bleu de PRONOTE */
            #pronote-average-integrated,
            #pronote-average-integrated *,
            #pronote-average-integrated *::before,
            #pronote-average-integrated *::after {
                background-color: transparent !important;
            }
            
            #pronote-average-integrated .pronote-display {
                background-color: #ffffff !important;
            }
            
            #pronote-average-integrated .pronote-details {
                background-color: #ffffff !important;
            }
            
            #pronote-average-integrated .pronote-button {
                background-color: #6c757d !important;
            }
            
            #pronote-average-integrated {
                all: initial !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                position: fixed !important;
                bottom: 20px !important;
                right: 20px !important;
                width: 300px !important;
                background: #ffffff !important;
                border: 1px solid #e9ecef !important;
                border-radius: 8px !important;
                padding: 15px !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
                z-index: 10000 !important;
                display: block !important;
            }
            
            .pronote-interface {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                background: transparent !important;
            }
            
            .pronote-title {
                margin: 0 0 15px 0;
                color: #2c3e50;
                font-size: 18px;
                font-weight: 700;
                text-align: center;
                border-bottom: 2px solid #e9ecef;
                padding-bottom: 8px;
            }
            
            .pronote-button {
                border: none;
                padding: 12px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                flex: 1;
                min-width: 0;
            }
            
            .pronote-button::before {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: -100% !important;
                width: 100% !important;
                height: 100% !important;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent) !important;
                transition: left 0.5s !important;
            }
            
            .pronote-button:hover::before {
                left: 100% !important;
            }
            
            .pronote-button::after {
                display: none !important;
            }
            
            .pronote-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.15);
            }
            
            .pronote-button:active {
                transform: translateY(0);
                transition: transform 0.1s;
            }
            
            .btn-simple {
                background: linear-gradient(135deg, #6c757d, #868e96);
                color: white;
            }
            
            .btn-weighted {
                background: linear-gradient(135deg, #6c757d, #868e96);
                color: white;
            }
            
            .btn-details-simple {
                background: linear-gradient(135deg, #6c757d, #868e96);
                color: white;
            }
            
            .btn-details-weighted {
                background: linear-gradient(135deg, #6c757d, #868e96);
                color: white;
            }
            
            .pronote-display {
                background: #ffffff !important;
                border: 2px solid #e9ecef !important;
                border-radius: 8px !important;
                padding: 15px !important;
                text-align: center !important;
                min-height: 50px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.3s ease !important;
                position: relative !important;
            }
            
            .pronote-display:hover {
                border-color: #e9ecef !important;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1) !important;
            }
            
            .pronote-display::before {
                display: none !important;
            }
            
            .pronote-display::after {
                display: none !important;
            }
            
            .pronote-display:hover {
                border-color: #e9ecef;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            }
            
            .pronote-details {
                background: linear-gradient(135deg, #ffffff, #f8f9fa);
                border: 2px solid #e9ecef;
                border-radius: 8px;
                padding: 15px;
                margin-top: 12px;
                display: none;
                max-height: 250px;
                overflow-y: auto;
                animation: slideDown 0.3s ease-out;
            }
            
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .pronote-status {
                font-size: 12px;
                color: #7f8c8d;
                margin-top: 12px;
                text-align: center;
                font-style: italic;
                transition: color 0.3s ease;
            }
            
            .pronote-status.loading {
                color: #6c757d;
            }
            
            .pronote-status.success {
                color: #27ae60;
            }
            
            .pronote-status.error {
                color: #e74c3c;
            }
            
            .button-container {
                display: flex;
                gap: 20px;
                margin-bottom: 15px;
                align-items: center;
            }
            
            .button-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
                flex: 1;
            }
            
            .separator {
                width: 4px;
                height: 70px;
                background: linear-gradient(to bottom, #495057, #212529, #495057);
                border-radius: 3px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                border: 1px solid #343a40;
            }
            
            .subject-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #ecf0f1;
                font-size: 13px;
                transition: background 0.2s ease;
            }
            
            .subject-item:hover {
                background: rgba(0, 0, 0, 0.05);
                padding-left: 8px;
                border-radius: 4px;
            }
            
            .subject-name {
                color: #2c3e50;
                font-weight: 600;
            }
            
            .subject-average {
                color: #7f8c8d;
                font-weight: 700;
            }
        </style>
        
        <div class="pronote-interface">
            <h3 class="pronote-title">Calculatrice de Moyenne</h3>
            
            <div class="button-container">
                <div class="button-group">
                    <button id="btn-calc-simple" class="pronote-button btn-simple">Moyenne Simple</button>
                    <button id="btn-details-simple" class="pronote-button btn-details-simple">Détails Simple</button>
                </div>
                
                <div class="separator"></div>
                
                <div class="button-group">
                    <button id="btn-calc-weighted" class="pronote-button btn-weighted">Moyenne Pondérée</button>
                    <button id="btn-details-weighted" class="pronote-button btn-details-weighted">Détails Pondéré</button>
                </div>
            </div>
            
            <div id="average-display" class="pronote-display">
                <span style="color: #7f8c8d; font-size: 14px;">Cliquez sur un bouton pour calculer</span>
            </div>
            
            <div id="details-display" class="pronote-details">
                <div id="details-content"></div>
            </div>
            
            <div id="status-text" class="pronote-status">Prêt</div>
        </div>
    `;
    
    // Chercher la zone blanche sous les détails d'une note
    // Essayer plusieurs sélecteurs pour trouver le bon panneau
    const rightPanelSelectors = [
        // Sélecteurs génériques pour le panneau de droite
        '.contenu-detail',
        '.zone-detail', 
        '.detail-note',
        '.panel-droit',
        '[class*="detail"]',
        '[class*="panel"]',
        // Sélecteurs plus spécifiques basés sur l'image
        '.zone-contenu',
        '.contenu-principal',
        '.zone-droite',
        // Sélecteurs par position (panneau de droite)
        'div[style*="float: right"]',
        'div[style*="right"]',
        // Sélecteurs par contenu
        'div:has(.note-élève)',
        'div:has(.moyenne-classe)',
        'div:has(.coefficient)'
    ];
    
    let rightPanel = null;
    for (const selector of rightPanelSelectors) {
        rightPanel = document.querySelector(selector);
        if (rightPanel) {
            console.log(`Panneau trouvé avec le sélecteur: ${selector}`);
            break;
        }
    }
    
    // Si aucun panneau spécifique trouvé, chercher par position
    if (!rightPanel) {
        // Chercher tous les divs et trouver celui qui contient les détails d'une note
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
            const text = div.textContent || '';
            if (text.includes('Note élève') && text.includes('Coefficient')) {
                rightPanel = div;
                console.log('Panneau trouvé par contenu (Note élève + Coefficient)');
                break;
            }
        }
    }
    
    // Toujours utiliser la position fixe en bas à droite pour la cohérence
    console.log('Création de l\'interface en position fixe (bas à droite)');
    rightPanel = document.body;
    interface.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 300px;
        background: #ffffff;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 15px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
    `;
    
    // Ajouter l'interface à la zone de détails
    rightPanel.appendChild(interface);
    
    // Ajouter les event listeners
    setupIntegratedInterfaceEvents();
    
    console.log('Interface intégrée créée dans PRONOTE');
    
    // Debug : afficher des informations sur le panneau trouvé
    console.log('Panneau utilisé:', rightPanel);
    console.log('Classes du panneau:', rightPanel.className);
    console.log('Position du panneau:', rightPanel.getBoundingClientRect());
}

// Fonction pour configurer les événements de l'interface intégrée
function setupIntegratedInterfaceEvents() {
    const interface = document.getElementById('pronote-average-integrated');
    if (!interface) return;
    
    const averageDisplay = interface.querySelector('#average-display');
    const detailsDisplay = interface.querySelector('#details-display');
    const detailsContent = interface.querySelector('#details-content');
    const statusText = interface.querySelector('#status-text');
    
    let detailsVisible = false;
    let currentDetailsType = null;
    
    // Fonction pour mettre à jour l'affichage de la moyenne
    function updateAverageDisplay(data, type) {
        if (!data || data.average === null) return;
        
        averageDisplay.innerHTML = `
            <div style="font-size: 24px; font-weight: bold; color: #2c3e50;">
                ${data.average.toFixed(2)}/20
            </div>
        `;
    }
    
    // Fonction pour basculer l'affichage des détails
    function toggleDetailsDisplay(type, data) {
        if (detailsVisible && currentDetailsType === type) {
            // Masquer les détails
            detailsDisplay.style.display = 'none';
            detailsVisible = false;
            currentDetailsType = null;
            updateButtonTexts();
        } else {
            // Afficher les détails
            detailsDisplay.style.display = 'block';
            detailsVisible = true;
            currentDetailsType = type;
            updateButtonTexts();
            
            // Mettre à jour l'affichage de la moyenne avec les données des détails
            updateAverageDisplay(data, type);
            
            // Afficher le contenu des détails
            if (data && data.subjects) {
                detailsContent.innerHTML = '';
                data.subjects.forEach(subject => {
                    const subjectDiv = document.createElement('div');
                    subjectDiv.className = 'subject-item';
                    
                    let details = `${subject.average.toFixed(2)}/20`;
                    if (subject.totalCoefficient) {
                        details += ` (coeff: ${subject.totalCoefficient})`;
                    }
                    if (subject.originalGrades) {
                        details += ` [${subject.originalGrades.join(', ')}]`;
                    }
                    
                    subjectDiv.innerHTML = `
                        <span class="subject-name">${subject.name}</span>
                        <span class="subject-average">${details}</span>
                    `;
                    detailsContent.appendChild(subjectDiv);
                });
            }
        }
    }
    
    // Fonction pour mettre à jour les textes des boutons
    function updateButtonTexts() {
        const btnDetailsSimple = interface.querySelector('#btn-details-simple');
        const btnDetailsWeighted = interface.querySelector('#btn-details-weighted');
        
        if (detailsVisible) {
            if (currentDetailsType === 'simple') {
                btnDetailsSimple.textContent = 'Masquer détails';
                btnDetailsWeighted.textContent = 'Détails Pondéré';
            } else {
                btnDetailsSimple.textContent = 'Détails Simple';
                btnDetailsWeighted.textContent = 'Masquer détails';
            }
        } else {
            btnDetailsSimple.textContent = 'Détails Simple';
            btnDetailsWeighted.textContent = 'Détails Pondéré';
        }
    }
    
    // Event listeners
    interface.querySelector('#btn-calc-simple').addEventListener('click', () => {
        statusText.textContent = 'Calcul de la moyenne simple...';
        statusText.className = 'pronote-status loading';
        
        // Utiliser le cache s'il existe, sinon calculer
        if (cachedSimpleAverage) {
            updateAverageDisplay(cachedSimpleAverage.data, 'simple');
            statusText.textContent = 'Moyenne simple calculée (cache)';
            statusText.className = 'pronote-status success';
        } else {
            const result = calculateAverage();
            if (result.success) {
                updateAverageDisplay(result.data, 'simple');
                statusText.textContent = 'Moyenne simple calculée';
                statusText.className = 'pronote-status success';
            } else {
                statusText.textContent = result.error;
                statusText.className = 'pronote-status error';
            }
        }
    });
    
    interface.querySelector('#btn-calc-weighted').addEventListener('click', () => {
        statusText.textContent = 'Calcul de la moyenne pondérée...';
        statusText.className = 'pronote-status loading';
        
        // Utiliser le cache s'il existe, sinon calculer
        if (cachedWeightedAverage) {
            updateAverageDisplay(cachedWeightedAverage.data, 'weighted');
            statusText.textContent = 'Moyenne pondérée calculée (cache)';
            statusText.className = 'pronote-status success';
        } else {
            calculateWeightedAverage().then(result => {
                if (result.success) {
                    updateAverageDisplay(result.data, 'weighted');
                    statusText.textContent = 'Moyenne pondérée calculée';
                    statusText.className = 'pronote-status success';
                } else {
                    statusText.textContent = result.error;
                    statusText.className = 'pronote-status error';
                }
            }).catch(error => {
                statusText.textContent = 'Erreur: ' + error.message;
                statusText.className = 'pronote-status error';
            });
        }
    });
    
    interface.querySelector('#btn-details-simple').addEventListener('click', () => {
        if (!cachedSimpleAverage) {
            statusText.textContent = 'Calculez d\'abord la moyenne simple';
            statusText.className = 'pronote-status error';
            return;
        }
        
        toggleDetailsDisplay('simple', cachedSimpleAverage.data);
        statusText.textContent = detailsVisible ? 'Détails simples affichés' : 'Détails masqués';
        statusText.className = 'pronote-status success';
    });
    
    interface.querySelector('#btn-details-weighted').addEventListener('click', () => {
        if (!cachedWeightedAverage) {
            statusText.textContent = 'Calculez d\'abord la moyenne pondérée';
            statusText.className = 'pronote-status error';
            return;
        }
        
        toggleDetailsDisplay('weighted', cachedWeightedAverage.data);
        statusText.textContent = detailsVisible ? 'Détails pondérés affichés' : 'Détails masqués';
        statusText.className = 'pronote-status success';
    });
    
    // Supprimer les anciens effets hover car ils sont maintenant dans le CSS
}

// Fonction pour ajouter un indicateur visuel sur la page
function addVisualIndicator(average, totalGrades) {
    // Supprimer l'ancien indicateur s'il existe
    const existingIndicator = document.getElementById('pronote-average-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Créer le nouvel indicateur
    const indicator = document.createElement('div');
    indicator.id = 'pronote-average-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 10000;
        cursor: pointer;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
    `;
    
    indicator.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 20px; margin-bottom: 5px;">📊</div>
            <div>Moyenne: ${average.toFixed(2)}</div>
            <div style="font-size: 12px; opacity: 0.8;">${totalGrades} notes</div>
        </div>
    `;
    
    // Ajouter un effet hover
    indicator.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.05)';
    });
    
    indicator.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
    });
    
    // Ajouter au DOM
    document.body.appendChild(indicator);
    
    // Auto-suppression après 5 secondes
    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.remove();
        }
    }, 5000);
}

// Fonction pour ajouter un indicateur visuel pondéré sur la page
function addWeightedVisualIndicator(average, totalGrades, totalCoefficient) {
    // Supprimer l'ancien indicateur s'il existe
    const existingIndicator = document.getElementById('pronote-average-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Créer le nouvel indicateur
    const indicator = document.createElement('div');
    indicator.id = 'pronote-average-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 10000;
        cursor: pointer;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
    `;
    
    indicator.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 20px; margin-bottom: 5px;">⚖️</div>
            <div>Moyenne pondérée: ${average.toFixed(2)}</div>
            <div style="font-size: 12px; opacity: 0.8;">${totalGrades} notes (coeff: ${totalCoefficient})</div>
        </div>
    `;
    
    // Ajouter un effet hover
    indicator.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.05)';
    });
    
    indicator.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
    });
    
    // Ajouter au DOM
    document.body.appendChild(indicator);
    
    // Auto-suppression après 8 secondes (plus long car le calcul prend du temps)
    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.remove();
        }
    }, 8000);
}

// Écouter les messages du popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message reçu dans content script:', request);
    
    if (request.action === 'calculateAverage') {
        // Vérifier le cache d'abord
        if (cachedSimpleAverage) {
            console.log('Utilisation du cache pour la moyenne simple');
            currentDisplayType = 'simple';
            sendResponse(cachedSimpleAverage);
            return;
        }
        
        const result = calculateAverage();
        
        if (result.success) {
            // Plus d'indicateur visuel, l'interface intégrée gère l'affichage
            currentDisplayType = 'simple';
        }
        
        sendResponse(result);
    } else if (request.action === 'calculateWeightedAverage') {
        // Vérifier le cache d'abord
        if (cachedWeightedAverage) {
            console.log('Utilisation du cache pour la moyenne pondérée');
            if (cachedWeightedAverage.success) {
                // Plus d'indicateur visuel, l'interface intégrée gère l'affichage
            }
            currentDisplayType = 'weighted';
            sendResponse(cachedWeightedAverage);
            return;
        }
        
        // Calcul asynchrone avec coefficients
        calculateWeightedAverage().then(result => {
            if (result.success) {
                // Plus d'indicateur visuel, l'interface intégrée gère l'affichage
                currentDisplayType = 'weighted';
            }
            sendResponse(result);
        }).catch(error => {
            sendResponse({
                success: false,
                error: 'Erreur lors du calcul pondéré: ' + error.message
            });
        });
        
        return true; // Indique que la réponse sera asynchrone
    } else if (request.action === 'showSimpleDetails') {
        // Afficher les détails de la moyenne simple
        if (!cachedSimpleAverage) {
            sendResponse({
                success: false,
                error: 'Calculez d\'abord la moyenne simple'
            });
            return;
        }
        
        sendResponse(cachedSimpleAverage);
    } else if (request.action === 'showWeightedDetails') {
        // Afficher les détails de la moyenne pondérée
        if (!cachedWeightedAverage) {
            sendResponse({
                success: false,
                error: 'Calculez d\'abord la moyenne pondérée'
            });
            return;
        }
        
        sendResponse(cachedWeightedAverage);
    } else if (request.action === 'toggleCalculator') {
        // Gérer l'activation/désactivation de la calculatrice
        calculatorEnabled = request.enabled;
        
        if (calculatorEnabled) {
            // Réactiver l'interface
            createIntegratedInterface();
            sendResponse({success: true, message: 'Calculatrice activée'});
} else {
            // Désactiver l'interface
            const existingInterface = document.getElementById('pronote-average-integrated');
            if (existingInterface) {
                existingInterface.remove();
            }
            sendResponse({success: true, message: 'Calculatrice désactivée'});
        }
    }
});

// Fonction pour vérifier en continu si on peut calculer une moyenne
async function checkForNotesContinuously() {
    // Vérifier si la calculatrice est activée
    calculatorEnabled = await isCalculatorEnabled();
    if (!calculatorEnabled) {
        console.log('Calculatrice désactivée');
        // Supprimer l'interface si elle existe
        const existingInterface = document.getElementById('pronote-average-integrated');
        if (existingInterface) {
            existingInterface.remove();
        }
        return;
    }
    
    // Vérifier si l'interface existe déjà
    const existingInterface = document.getElementById('pronote-average-integrated');
    
    // Vérifier si on peut extraire des notes
    if (isOnNotesPage()) {
        if (!existingInterface) {
            console.log('Notes détectées, création de l\'interface');
            
            // Créer la nouvelle interface
            createIntegratedInterface();
            
            // Vérifier que l'interface a été créée
    setTimeout(() => {
                const interface = document.getElementById('pronote-average-integrated');
                if (!interface) {
                    console.log('Interface non créée, utilisation du mode de test');
                    forceShowInterface();
                }
            }, 1000);
        } else {
            console.log('Interface déjà présente, pas de recréation');
        }
    } else {
        // Supprimer l'interface si elle existe mais qu'on n'est plus sur une page avec notes
        if (existingInterface) {
            console.log('Plus de notes détectées, suppression de l\'interface');
            existingInterface.remove();
        }
    }
}

// Vérification immédiate au chargement de la page
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(checkForNotesContinuously, 100); // Quasi-instantané
    });
} else {
    setTimeout(checkForNotesContinuously, 100); // Quasi-instantané
}

// Vérification continue toutes les 2 secondes (très fréquent)
setInterval(checkForNotesContinuously, 2000);

// Vérification lors des changements de contenu (pour les SPA)
let lastCheckTime = 0;
const CHECK_COOLDOWN = 500; // 0.5 seconde de cooldown pour réactivité maximale

const observer = new MutationObserver(function(mutations) {
    const now = Date.now();
    if (now - lastCheckTime < CHECK_COOLDOWN) {
        return; // Éviter les vérifications trop fréquentes
    }
    
    let shouldCheck = false;
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
            // Vérifier les ajouts d'éléments
            if (mutation.addedNodes.length > 0) {
                for (let node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Element node
                        if (node.querySelector && (
                            node.querySelector('.note-devoir') ||
                            node.classList.contains('note-devoir')
                        )) {
                            shouldCheck = true;
                            break;
                        }
                    }
                }
            }
            
            // Vérifier les suppressions d'éléments
            if (mutation.removedNodes.length > 0) {
                for (let node of mutation.removedNodes) {
                    if (node.nodeType === 1) { // Element node
                        if (node.querySelector && (
                            node.querySelector('.note-devoir') ||
                            node.classList.contains('note-devoir')
                        )) {
                            shouldCheck = true;
                            break;
                        }
                    }
                }
            }
        }
    });
    
    if (shouldCheck) {
        lastCheckTime = now;
        console.log('Changement de contenu détecté, vérification des notes');
        setTimeout(checkForNotesContinuously, 50); // Quasi-instantané
    }
});

// Démarrer l'observation
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Vérification immédiate lors des clics (pour navigation ultra-rapide)
document.addEventListener('click', function(event) {
    // Vérifier si c'est un clic sur un lien ou un élément de menu
    const target = event.target;
    if (target.tagName === 'A' || 
        target.closest('a') || 
        target.closest('[role="button"]') ||
        target.closest('.menu') ||
        target.closest('.nav') ||
        target.closest('[class*="menu"]') ||
        target.closest('[class*="nav"]')) {
        
        console.log('Clic détecté, vérification immédiate des notes');
        setTimeout(checkForNotesContinuously, 100); // Vérification très rapide après clic
    }
});

// Vérification lors des changements d'URL (pour navigation SPA)
let currentUrl = window.location.href;
setInterval(function() {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        console.log('Changement d\'URL détecté, vérification immédiate des notes');
        setTimeout(checkForNotesContinuously, 50); // Vérification quasi-instantanée
    }
}, 100); // Vérification toutes les 100ms
