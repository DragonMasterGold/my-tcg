// Deck builder state
let hoveredCard = null;
let allCards = [];
let currentDeck = { main: [], extra: [], side: [] };
let currentFilter = 'All';
let currentDeckView = 'main';

// === INITIALIZATION ===
window.addEventListener('DOMContentLoaded', loadCards);

async function loadCards() {
    try {
        const response = await fetch('cards.json');
        allCards = await response.json();
    } catch (error) {
        console.error('Error loading cards:', error);
        createTestCards();
    }
    // Initial Render
    filterCards();
    updateDeckDisplay();
    updateDeckStats();
}

// === ROBUST FILTERING & RENDERING ===
// This function handles Search AND Type filtering together
function filterCards() {
    const term = document.getElementById('card-search').value.toLowerCase();
    const cardPool = document.getElementById('card-pool');
    cardPool.innerHTML = ''; // Clear current pool

    // Filter the actual data array
    const filtered = allCards.filter(card => {
        // 1. Check Type
        if (currentFilter !== 'All' && card.type !== currentFilter) return false;
        // 2. Check Search Term (Name or Description)
        const nameMatch = card.name.toLowerCase().includes(term);
        const descMatch = (card.description || "").toLowerCase().includes(term);
        return nameMatch || descMatch;
    });

    // Render only the matching cards
    filtered.forEach(card => {
        cardPool.appendChild(createCardElement(card, true));
    });
}

function filterByType(type) {
    currentFilter = type;
    
    // Update active button visual
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(type) || (type === 'All' && btn.textContent === 'All')) {
            btn.classList.add('active');
        }
    });

    filterCards(); // Re-render pool
}

// === CARD CREATION ===
function createCardElement(card, isPool = false) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    cardEl.dataset.type = card.type;

    if (card.image) {
        const img = document.createElement('img');
        img.src = card.image;
        img.className = 'card-image';
        cardEl.appendChild(img);
    } else {
        cardEl.innerText = card.name;
    }

    // Badge logic (Pool only)
    if (isPool) {
        const count = getCardCount(card.id);
        if (count > 0) {
            const badge = document.createElement('div');
            badge.className = 'card-count';
            badge.innerText = count;
            cardEl.appendChild(badge);
        }
    }

    // --- MOUSE TRACKING (For +/- Hotkeys) ---
    cardEl.onmouseenter = () => { hoveredCard = card; };
    cardEl.onmouseleave = () => { hoveredCard = null; };

    // --- INTERACTIONS ---
    
    // 1. Left Click: Show Info (Fixed function name)
    cardEl.onclick = () => showCardInfo(card);

    // 2. Right Click: Add/Remove (Context menu)
    cardEl.oncontextmenu = (e) => {
        e.preventDefault();
        if (isPool) addCardToDeck(card);
        else removeCardFromDeck(card);
    };

    // 3. Double Click: Add/Remove
    cardEl.ondblclick = (e) => {
        e.preventDefault();
        if (isPool) {
            addCardToDeck(card);
        } else {
            removeCardFromDeck(card); // Removes if clicking card in deck list
        }
    };

    return cardEl;
}

// === INFO PANEL ===
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
    
    // Archetype formatting
    const archs = [];
    if (card.archetype) archs.push(card.archetype);
    if (card.archetypes && card.archetypes[1]) archs.push(card.archetypes[1]);
    if (archs.length > 0) addStatLine('Archetypes', archs.join(' - '));

    if (card.type === 'Phantom') {
        addStatLine('Stats', `ATK: ${card.attack} / HP: ${card.health}`);
    }

    textDiv.innerHTML = card.description ? `<strong>Ability:</strong><br>${card.description}` : '';
}

// === DECK MANAGEMENT ===
function getCardCount(cardId) {
    return [...currentDeck.main, ...currentDeck.side, ...currentDeck.extra].filter(c => c.id === cardId).length;
}

function addCardToDeck(card) {
    // Check limits, etc. BEFORE
    if (getCardCount(card.id) >= 3) return alert('Max 3 copies!');
    if (currentDeckView === 'main' && currentDeck.main.length >= 50) return;
    if (currentDeckView === 'side' && currentDeck.side.length >= 15) return;
    if (currentDeckView === 'extra' && currentDeck.extra.length >= 5) return;

    // Execute the action instead of doing it directly
    executeAction('add_to_deck', { cardId: card.id, deckType: currentDeckView });
}

function removeCardFromDeck(card) {
    const idx = currentDeck[currentDeckView].findIndex(c => c.id === card.id);
    if (idx !== -1) {
        currentDeck[currentDeckView].splice(idx, 1);
        updateDeckDisplay();
        updateDeckStats();
        filterCards(); // Refresh pool to update count badges
    }
}

function updateDeckDisplay() {
    ['main', 'side', 'extra'].forEach(type => {
        const display = document.getElementById(`${type}-deck-display`);
        if (display) {
            display.innerHTML = '';
            currentDeck[type].forEach(card => display.appendChild(createCardElement(card, false)));
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
    
    // Visual Validation
    document.getElementById('main-deck-count').className = 'stat-value ' + (mainNum >= 30 && mainNum <= 50 ? 'valid' : 'invalid');
}

function switchDeckView(deckType) {
    currentDeckView = deckType;
    document.querySelectorAll('.deck-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    ['main', 'side', 'extra'].forEach(t => {
        const el = document.getElementById(`${t}-deck-display`);
        if(el) el.classList.toggle('hidden', t !== deckType);
    });
}

function clearDeck() {
    if (!confirm('Clear entire deck?')) return;
    currentDeck = { main: [], extra: [], side: [] };
    updateDeckDisplay();
    updateDeckStats();
    filterCards();
}

// === SAVING / LOADING / TEST DATA ===

function createTestCards() {
    const types = ['Phantom', 'Spirit', 'Counter', 'Environment'];
    const archetypes = ['Standard', 'Life', 'Creation', 'Light', 'Death', 'Destruction', 'Shadow', 'Cosmic', 'Elemental', 'Chaos'];
    allCards = [];
    for (let i = 1; i <= 50; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const mainArch = archetypes[Math.floor(Math.random() * archetypes.length)];
        const card = {
            id: `card_${i}`,
            name: `${type} ${i}`,
            type: type,
            description: `Ability text for ${type} ${i}.`,
            archetype: mainArch,
            archetypes: [mainArch, "Secondary"]
        };
        if (type === 'Phantom') {
            card.level = Math.floor(Math.random() * 10);
            card.attack = Math.floor(Math.random() * 3000);
            card.health = Math.floor(Math.random() * 3000);
        }
        allCards.push(card);
    }
}

function saveDeck() {
    const deckName = prompt('Deck Name:', 'MyDeck') || 'MyDeck';
    const dataStr = JSON.stringify({ name: deckName, ...currentDeck });
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${deckName}.json`;
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
            updateDeckDisplay();
            updateDeckStats();
            filterCards();
        } catch (err) {
            alert('Invalid Deck File');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// === HOTKEYS (+ / -) ===
document.addEventListener('keydown', (e) => {
    // Only work if dragging/typing isn't happening
    if (!hoveredCard || document.activeElement.tagName === 'INPUT') return;

    // Plus or Equals key adds card
    if (e.key === '+' || e.key === '=') {
        addCardToDeck(hoveredCard);
    }
    
    // Minus or Underscore key removes card
    if (e.key === '-' || e.key === '_') {
        removeCardFromDeck(hoveredCard);
    }
});