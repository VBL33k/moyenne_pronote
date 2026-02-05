document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitch = document.getElementById('toggleSwitch');
    const statusText = document.getElementById('statusText');
    
    // Charger l'état actuel
    chrome.storage.local.get(['calculatorEnabled'], function(result) {
        const isEnabled = result.calculatorEnabled !== false; // Par défaut activé
        updateUI(isEnabled);
    });
    
    // Gérer le clic sur le toggle
    toggleSwitch.addEventListener('click', function() {
        chrome.storage.local.get(['calculatorEnabled'], function(result) {
            const currentState = result.calculatorEnabled !== false;
            const newState = !currentState;
            
            chrome.storage.local.set({calculatorEnabled: newState}, function() {
                updateUI(newState);
                
                // Envoyer un message au content script pour mettre à jour l'affichage
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'toggleCalculator',
                        enabled: newState
                    });
                });
            });
        });
    });
    
    function updateUI(isEnabled) {
        if (isEnabled) {
            toggleSwitch.classList.add('active');
            statusText.textContent = 'Calculatrice activée';
            statusText.className = 'status-text active';
        } else {
            toggleSwitch.classList.remove('active');
            statusText.textContent = 'Calculatrice désactivée';
            statusText.className = 'status-text inactive';
        }
    }
});