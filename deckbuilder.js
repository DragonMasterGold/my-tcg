// Deck builder state
let hoveredCard = null;
let allCards = [];
let currentDeck = { main: [], extra: [], side: [] };
let currentFilter = 'All';
let currentDeckView = 'main'; // This is our active tab ('main', 'extra', or 'side')
let keywordRepo = {};
let spamInterval = null;
let holdTimer = null;

// === INITIALIZATION ===
window.addEventListener('DOMContentLoaded', loadCards);

async function loadCards() {
    try {
        const response = await fetch('cards.json');
        allCards = await response.json();
        
        // --- ADD THIS: Load Keywords ---
        const kwResponse = await fetch('keywords.json');
        keywordRepo = await kwResponse.json();
    } catch (error) {
        console.error('Error loading databases:', error);
        createTestCards();
    }
    filterCards();
    updateDeckDisplay();
    updateDeckStats();
    showDefaultControls();
}

const defaultImages = {
    'phantom': 'Images/Cards/Phantom Card.png',
    'spirit': 'Images/Cards/Spirit Card.png',
    'counter': 'Images/Cards/Counter Card.png',
    'environment': 'Images/Cards/Environment Card.png',
    'token': 'Images/Cards/Token Card.png'
};

// === ROBUST FILTERING & RENDERING ===
function filterCards() {
    const rawTerm = document.getElementById('card-search').value.toLowerCase().trim();
    const cardPool = document.getElementById('card-pool');
    cardPool.innerHTML = ''; 

    let filtered = allCards.filter(card => {
        // Handle the Top Category Filter Buttons first
        if (currentFilter !== 'All' && card.type !== currentFilter) return false;

        if (!rawTerm) return true;

        // --- Structured Search (e.g., "Level: 2") ---
        if (rawTerm.includes(':')) {
            const parts = rawTerm.split(':');
            const key = parts[0].trim();
            const val = parts[1].trim();

            if (key === 'level') return String(card.level) === val;
            if (key === 'archetype') {
                return (card.archetype || "").toLowerCase().includes(val) || 
                       (card.archetypes || []).some(a => a.toLowerCase().includes(val));
            }
            if (key === 'form' || key === 'type') return (card.type || "").toLowerCase().includes(val);
        }

        // --- General Search (Search everything at once) ---
        const searchableText = [
            card.name,
            card.type,
            card.description,
            card.archetype,
            ...(card.archetypes || []),
            `level ${card.level}`
        ].join(' ').toLowerCase();

        return searchableText.includes(rawTerm);
    });

    // Apply the sorting rules before displaying
    sortCardList(filtered).forEach(card => {
        cardPool.appendChild(createCardElement(card, true));
    });
}

function filterByType(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        // Match button text to Form
        if (btn.textContent.toLowerCase().includes(type.toLowerCase()) || (type === 'All' && btn.textContent === 'All')) {
            btn.classList.add('active');
        }
    });
    filterCards(); // This now handles the sorting automatically
}

// === CARD CREATION (Unified) ===
function createCardElement(card, isPool = false) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    cardEl.dataset.type = card.type;

    // Visual Content
	const typeKey = card.type.toLowerCase();
	const defaultImg = defaultImages[typeKey];
	const primaryImage = card.image && card.image.trim() !== "" ? card.image : null;

	// Set default image first
	if (defaultImg) {
		cardEl.style.backgroundImage = `url("${defaultImg}")`;
		cardEl.style.backgroundSize = "cover";
		cardEl.style.backgroundPosition = "center";
	}

	// Try to upgrade to specific image
	if (primaryImage) {
		const img = new Image();
		img.onload = () => {
			cardEl.style.backgroundImage = `url("${primaryImage}")`;
		};
		img.src = primaryImage;
	}

	// Always add name label if there's any image
	if (defaultImg || primaryImage) {
		const nameLabel = document.createElement('div');
		nameLabel.className = 'card-name-fallback';
		nameLabel.style.background = 'rgba(0,0,0,0.6)';
		nameLabel.style.width = '100%';
		nameLabel.style.position = 'absolute';
		nameLabel.style.bottom = '0';
		nameLabel.textContent = card.name;
		cardEl.appendChild(nameLabel);
	} else {
		cardEl.innerText = card.name;
	}
	
    // Badge logic (How many are in the total deck)
    const count = getCardCount(card.id);
    if (count > 0) {
        const badge = document.createElement('div');
        badge.className = 'card-count';
        badge.innerText = count;
        cardEl.appendChild(badge);
    }

    // --- TRACKING FOR HOTKEYS ---
    cardEl.onmouseenter = () => { hoveredCard = card; };
    cardEl.onmouseleave = () => { hoveredCard = null; };

    // --- INTERACTIONS ---
    cardEl.onmousedown = (e) => {
        // Prevent default browser behavior (especially for right-click)
        if (e.button === 2) e.preventDefault();
        e.stopPropagation();

        const triggerAction = () => {
            if (isPool) addCardToDeck(card);
            else removeCardFromDeck(card);
        };

        // LEFT CLICK: Only show info
        if (e.button === 0) {
            showCardInfo(card);
            return;
        }

        // RIGHT CLICK: Trigger once + Start Hold Timer
        if (e.button === 2) {
            showCardInfo(card); // Also update info on right click
            triggerAction();

            // Clear any lingering timers
            clearTimeout(holdTimer);
            clearInterval(spamInterval);

            // 3. Start repeat logic with a very short delay (200ms)
            holdTimer = setTimeout(() => {
                spamInterval = setInterval(triggerAction, 80); 
            }, 170);
        }
    };

    // Global cleanup for mouse release
    const stopSpam = () => {
        clearTimeout(holdTimer);
        clearInterval(spamInterval);
    };

    cardEl.onmouseup = stopSpam;
    cardEl.onmouseleave = stopSpam;

    // Necessary to prevent the actual browser menu from appearing
    cardEl.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
	    return cardEl;
}

// === INFO PANEL ===
function showDefaultControls() {
    const nameEl = document.getElementById('info-name');
    const statsDiv = document.getElementById('info-stats');
    const textDiv = document.getElementById('info-text');

    if (nameEl) nameEl.innerText = "Select a Card";
    if (statsDiv) statsDiv.innerHTML = ""; // Leaves the middle section empty
    if (textDiv) {
        textDiv.innerHTML = `
            <strong>Controls:</strong><br>
            • Left Click to view info.<br>
			• Right click to add or remove a card.<br>
			• Hold Right Click to add/remove multiple cards.<br>
            • Press + or - keys to quickly add/remove cards.<br>
        `;
    }
}

function showCardInfo(card) {
    const nameEl = document.getElementById('info-name');
    const statsDiv = document.getElementById('info-stats');
    const textDiv = document.getElementById('info-text');
    if (!nameEl) return;

    nameEl.innerText = card.name;
    statsDiv.innerHTML = '';

    const addStatLine = (label, value) => {
        if (value === undefined || value === null) return;
        const div = document.createElement('div');
        div.className = 'info-stats-item';
        div.innerHTML = `<strong>${label}:</strong> ${value}`;
        statsDiv.appendChild(div);
    };

    addStatLine('Form', card.type);
    if (card.level !== undefined) addStatLine('Level', card.level);
    
    const archs = [];
    if (card.archetype) archs.push(card.archetype);
    if (card.archetypes && card.archetypes[1]) archs.push(card.archetypes[1]);
    if (archs.length > 0) addStatLine('Archetypes', archs.join(' - '));

    if (card.type === 'Phantom') {
        addStatLine('Stats', `ATK: ${card.attack} / HP: ${card.health}`);
    }

    textDiv.innerHTML = card.description ? `<strong>Ability:</strong><br>${injectKeywords(card.description)}` : '';
}

// === DECK MANAGEMENT ===
function getCardCount(cardId) {
    return [...currentDeck.main, ...currentDeck.side, ...currentDeck.extra].filter(c => c.id === cardId).length;
}

function addCardToDeck(card) {
    if (getCardCount(card.id) >= 3) return;

    const limit = (currentDeckView === 'main') ? 50 : (currentDeckView === 'side' ? 15 : 5);
    
    // FIX: Removed alert. If full, we just exit silently.
    if (currentDeck[currentDeckView].length >= limit) {
        return;
    }

    currentDeck[currentDeckView].push(card);
    refreshUI();
}

function removeCardFromDeck(card) {
    const idx = currentDeck[currentDeckView].findIndex(c => c.id === card.id);
    if (idx > -1) {
        currentDeck[currentDeckView].splice(idx, 1);
        refreshUI();
    }
}

function refreshUI() {
    updateDeckDisplay();
    updateDeckStats();
    filterCards(); 
}

function updateDeckDisplay() {
    ['main', 'side', 'extra'].forEach(type => {
        const display = document.getElementById(`${type}-deck-display`);
        if (display) {
            display.innerHTML = '';
            // Sort the cards in this deck tab before rendering
            const sortedDeck = sortCardList([...currentDeck[type]]); 
            sortedDeck.forEach(card => display.appendChild(createCardElement(card, false)));
        }
    });
}

function updateDeckStats() {
    const mainNum = currentDeck.main.length;
    const sideNum = currentDeck.side.length;
    const extraNum = currentDeck.extra.length;
    
    document.getElementById('main-deck-count').textContent = mainNum;
    document.getElementById('side-deck-count').textContent = sideNum;
    document.getElementById('extra-deck-count').textContent = extraNum;
    
    document.getElementById('main-deck-count').className = 'stat-value ' + (mainNum >= 30 && mainNum <= 50 ? 'valid' : 'invalid');
}

function switchDeckView(deckType) {
    currentDeckView = deckType;
    document.querySelectorAll('.deck-tab').forEach(tab => tab.classList.remove('active'));
    // Handle both direct click and function call
    if (event) event.target.classList.add('active');
    
    ['main', 'side', 'extra'].forEach(t => {
        const el = document.getElementById(`${t}-deck-display`);
        if(el) el.classList.toggle('hidden', t !== deckType);
    });
    updateDeckDisplay();
}

function clearDeck() {
    if (!confirm('Clear entire deck?')) return;
    currentDeck = { main: [], extra: [], side: [] };
    refreshUI();
}

// === SAVING / LOADING / TEST DATA ===
function saveDeck() {
    const name = prompt('Deck Name:', 'MyDeck') || 'MyDeck';
    const dataStr = JSON.stringify({ name: name, ...currentDeck });
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.json`;
    link.click();
}

function loadDeck(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            currentDeck = { main: data.main || [], extra: data.extra || [], side: data.side || [] };
            refreshUI();
        } catch (err) {
            alert('Invalid Deck File');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function createTestCards() {
    const types = ['Phantom', 'Spirit', 'Counter', 'Environment'];
    allCards = [];
    for (let i = 1; i <= 50; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const card = {
            id: `card_${i}`,
            name: `${type} ${i}`,
            type: type,
            description: `Ability text for ${type} ${i}.`,
            level: type === 'Phantom' ? Math.floor(Math.random() * 10) : undefined,
            attack: type === 'Phantom' ? Math.floor(Math.random() * 3000) : undefined,
            health: type === 'Phantom' ? Math.floor(Math.random() * 3000) : undefined,
            archetype: "Standard"
        };
        allCards.push(card);
    }
}

// === HOTKEYS (+ / -) ===
document.addEventListener('keydown', (e) => {
    // Escape key logic
    if (e.key === 'Escape') {
        const popup = document.getElementById('keyword-popup');
        if (popup && !popup.classList.contains('hidden')) {
            popup.classList.add('hidden');
            return;
        }
    }
	if (!hoveredCard || document.activeElement.tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') addCardToDeck(hoveredCard);
    if (e.key === '-' || e.key === '_') removeCardFromDeck(hoveredCard);
});

function injectKeywords(text) {
    if (!text) return "";
    if (!keywordRepo || Object.keys(keywordRepo).length === 0) return text;

    let html = text;
    const placeholders = []; 
    let pIndex = 0;

    // 1. Identify Special Context Keys
    const specialKeys = ['Copy', 'Flip'];

    // 2. Sort Standard Keys (Longest First), EXCLUDING the special ones
    const standardKeys = Object.keys(keywordRepo)
        .filter(k => !specialKeys.includes(k))
        .sort((a, b) => b.length - a.length);

    // 3. Helper to process replacements
    const processReplacement = (regex, key) => {
        html = html.replace(regex, (match) => {
            placeholders.push(`<span class="kw-trigger" onclick="handleKeywordClick(event, '${key}')">${match}</span>`);
            return `%%%KW${pIndex++}%%%`;
        });
    };

    // --- PHASE 1: Run Special Context Rules FIRST ---
    // This ensures "Create a Copy" is caught before "Create" can break it.

    if (keywordRepo["Copy"]) {
        // Matches: "Copy this", "Create a Copy", "Create a 1-SP Copy"
        // (?: [\w-]+) handles words with hyphens like "1-SP"
        processReplacement(/\b(Create a(?: [\w-]+){0,4} Copy|Copy this)\b/gi, "Copy");
    }

    if (keywordRepo["Flip"]) {
        // Matches "Flip:" (must have colon)
        processReplacement(/\b(Flip):/g, "Flip");
    }

    // --- PHASE 2: Run Standard Keys ---
    standardKeys.forEach(key => {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match whole words only
        const regex = new RegExp(`\\b(${escapedKey})\\b`, 'gi');
        processReplacement(regex, key);
    });

    // 4. Swap Placeholders back to HTML
    placeholders.forEach((tag, i) => {
        html = html.replace(`%%%KW${i}%%%`, tag);
    });

    return html;
}

function handleKeywordClick(event, word) {
    event.stopPropagation(); 
    const exactKey = Object.keys(keywordRepo).find(k => k.toLowerCase() === word.toLowerCase());
    const definition = keywordRepo[exactKey];
    if (!definition) return;

    const popup = document.getElementById('keyword-popup');
    popup.innerHTML = `
        <span class="kw-close" onclick="document.getElementById('keyword-popup').classList.add('hidden')">×</span>
        <strong style="color:#3498db; font-size:1.1em;">${exactKey}</strong>
        <br><div style="margin-top:5px; border-top:1px solid #444; padding-top:5px;">${definition}</div>
    `;
    popup.classList.remove('hidden');
    popup.style.left = (event.pageX + 15) + 'px';
    popup.style.top = (event.pageY - 20) + 'px';

    if (window.kwTimer) clearTimeout(window.kwTimer);
    window.kwTimer = setTimeout(() => { popup.classList.add('hidden'); }, 10000);
}

function sortCardList(list) {
    const order = { 'phantom': 1, 'spirit': 2, 'counter': 3, 'environment': 4 };
    
    return list.sort((a, b) => {
        // 1. Sort by Form/Type (Phantom -> Spirit -> Counter)
        const typeA = order[(a.type || "").toLowerCase()] || 99;
        const typeB = order[(b.type || "").toLowerCase()] || 99;
        if (typeA !== typeB) return typeA - typeB;

        // 2. Sort by Level (Ascending)
        const levelA = parseInt(a.level) || 0;
        const levelB = parseInt(b.level) || 0;
        if (levelA !== levelB) return levelA - levelB;

        // 3. Sort by Name (Alphabetical)
        return a.name.localeCompare(b.name);
    });
}