# Instructions d'installation - Extension Calculatrice de Moyenne Pronote

## 📋 Fichiers de l'extension

Votre extension est maintenant prête ! Voici les fichiers créés :

```
pronote-average-extension/
├── manifest.json          # Configuration de l'extension
├── popup.html            # Interface du popup
├── popup.js              # Logique du popup
├── content.js            # Script principal (analyse des notes)
├── styles.css            # Styles CSS
├── README.md             # Documentation complète
├── test-page.html        # Page de test
└── icons/
    ├── icon16.svg        # Icône 16x16
    ├── icon48.svg        # Icône 48x48
    └── icon128.svg       # Icône 128x128
```

## 🚀 Installation dans Chrome

### Étape 1 : Ouvrir Chrome
1. Ouvrez Google Chrome
2. Tapez `chrome://extensions/` dans la barre d'adresse
3. Appuyez sur Entrée

### Étape 2 : Activer le mode développeur
1. Activez le toggle "Mode développeur" en haut à droite
2. Vous devriez voir apparaître de nouveaux boutons

### Étape 3 : Charger l'extension
1. Cliquez sur "Charger l'extension non empaquetée"
2. Naviguez vers le dossier `C:\Users\victo\pronote-average-extension`
3. Sélectionnez le dossier et cliquez sur "Sélectionner un dossier"

### Étape 4 : Vérifier l'installation
1. L'extension devrait apparaître dans la liste
2. L'icône 📊 devrait apparaître dans la barre d'outils Chrome
3. Cliquez sur l'icône pour tester le popup

## 🧪 Test de l'extension

### Test avec la page de démonstration
1. Ouvrez le fichier `test-page.html` dans Chrome
2. L'extension devrait détecter les notes et calculer la moyenne
3. Un indicateur devrait apparaître en haut à droite
4. Cliquez sur l'icône de l'extension pour voir le popup

### Test sur Pronote réel
1. Connectez-vous à votre espace Pronote
2. Naviguez vers une page contenant des notes
3. L'extension devrait fonctionner automatiquement

## 🔧 Fonctionnalités

### Calcul automatique
- ✅ Détection automatique des notes (format "15/20", "15,5/20")
- ✅ Calcul de la moyenne générale
- ✅ Calcul des moyennes par matière
- ✅ Indicateur visuel sur la page

### Interface utilisateur
- ✅ Popup moderne avec gradient
- ✅ Affichage de la moyenne générale
- ✅ Détails par matière
- ✅ Bouton de recalcul

### Compatibilité
- ✅ Chrome (version 88+)
- ✅ Edge (version 88+)
- ✅ Tous les établissements Pronote
- ✅ Pages : bulletins, relevés de notes, évaluations

## 🛠️ Dépannage

### L'extension ne s'installe pas
- Vérifiez que tous les fichiers sont présents
- Assurez-vous que le fichier `manifest.json` est valide
- Redémarrez Chrome et réessayez

### L'extension ne fonctionne pas sur Pronote
- Vérifiez que vous êtes bien sur un site Pronote
- Actualisez la page Pronote
- Vérifiez que l'extension est activée

### Erreurs dans la console
1. Ouvrez les outils de développement (F12)
2. Allez dans l'onglet "Console"
3. Recherchez les erreurs liées à l'extension

## 📱 Utilisation

### Sur Pronote
1. Connectez-vous à votre espace Pronote
2. Naviguez vers la page des notes
3. L'extension calcule automatiquement votre moyenne
4. Un indicateur apparaît en haut à droite

### Via le popup
1. Cliquez sur l'icône de l'extension
2. La moyenne générale s'affiche
3. Cliquez sur "Recalculer" pour mettre à jour
4. Cliquez sur "Détails par matière" pour voir les moyennes

## 🔒 Sécurité

- ✅ Aucune donnée envoyée vers l'extérieur
- ✅ Tous les calculs sont effectués localement
- ✅ Respect total de la vie privée
- ✅ Aucune connexion internet requise

## 📞 Support

Si vous rencontrez des problèmes :
1. Consultez le fichier README.md
2. Vérifiez les instructions d'installation
3. Testez avec la page de démonstration
4. Contactez le développeur si nécessaire

---
🎉 Votre extension est prête à être utilisée !
