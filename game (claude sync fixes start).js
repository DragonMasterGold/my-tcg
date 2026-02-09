let allCards = [];
let cardImages = {};

async function loadCardDatabase() {
    try {
        const response = await fetch('cards.json');
        allCards = await response.json();
        allCards.forEach(card => {
            if (card.image) cardImages[card.id] = card.image;
        });
    } catch (error) {
        console.error('Failed to load cards.json:', error);
    }
}
const state = {
    player: { lp: 10000, sp: 4, hand: [], deck: [], sideDeck: [], extraDeck: [], afterlife: [], shadow: [], oblivion: [], field: [] },
    opponent: { lp: 10000, sp: 4, hand: [], deck: [], sideDeck: [], extraDeck: [], afterlife: [], shadow: [], oblivion: [], field: [], handVisible: false }
};

let idCounter = 0;
let draggedId = null;
let hoveredId = null;
let ctxTarget = null;
let viewerTarget = null;
let highlightTimer = null;
let hoveredZone = null;

window.onload = async () => {
    await loadCardDatabase();
    setupListeners();
    updateStats();
    
    // Spawn test decks by default
    initDeck('player');
    initDeck('opponent');
    
    document.getElementById('main-menu').classList.remove('hidden');
};

function setupListeners() {
    let shiftHeld = false;
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Shift') shiftHeld = true;
        if (e.key === 'Escape') {
            const viewer = document.getElementById('deck-viewer');
            const info = document.getElementById('card-info-panel');
            if ((viewer && !viewer.classList.contains('hidden')) || (info && !info.classList.contains('hidden'))) {
                closeAllModals();
                if (typeof closeCardInfo === 'function') closeCardInfo();
            } else {
                toggleMenu();
            }
        } else {
            handleKeys(e);
        }
    });
    
    document.addEventListener('keyup', e => {
        if (e.key === 'Shift') { shiftHeld = false; hideZoom(); }
    });
    
    document.addEventListener('mousemove', e => {
        if (shiftHeld && hoveredId) {
            const card = findCard(hoveredId);
            if (card) showZoom(card);
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ctx-menu')) hideCtx();
        if (e.target.classList.contains('modal')) closeAllModals();
    });

    const zones = document.querySelectorAll('.zone, .hand-area');
    zones.forEach(z => {
        z.addEventListener('dragover', e => e.preventDefault());
        z.addEventListener('drop', handleDrop);
        z.addEventListener('mouseenter', () => { hoveredZone = z; });
        z.addEventListener('mouseleave', () => { hoveredZone = null; });

        // === DRAG-TO-EXTRACT LOGIC ===
        z.addEventListener('mousedown', e => {
            if (e.button !== 0 || z.classList.contains('hand-area')) return;
            if (z.querySelector('.card')) return;

            const owner = z.dataset.owner;
            const type = z.dataset.type;

            if (owner && type && state[owner][type].length > 0) {
                const card = state[owner][type].pop();
                
                // Add to field state so it's not lost
                card.loc = 'field'; 
                state[owner].field.push(card);
                
                const cardEl = createCardEl(card);
                
                // Start INVISIBLE so a click doesn't show a flickering card
                cardEl.style.opacity = '0'; 
                
                // If the drag starts, make it visible
                cardEl.addEventListener('dragstart', () => {
                    cardEl.style.opacity = '1';
                    draggedId = card.id;
                });

                // If the drag is cancelled or fails, handle cleanup in the click/drop
                z.appendChild(cardEl);
                updateCounts(owner);
            }
        });

        // === CLICK TO DRAW/SEARCH ===
        if (z.dataset.type) {
            z.addEventListener('click', e => { 
                const owner = z.dataset.owner;
                const type = z.dataset.type;
                const spawnedCardEl = z.querySelector('.card');

                // If an invisible card was spawned but NOT dragged (a simple click)
                if (spawnedCardEl && spawnedCardEl.style.opacity === '0') {
                    const card = findCard(spawnedCardEl.id);
                    if (card) {
                        // Put the spawned card back into the deck state
                        removeCard(card);
                        state[owner][type].push(card);
                        updateCounts(owner);
                    }
                    
                    // Now perform the intended click action
                    if (type === 'deck') drawCard(owner, 'deck');
                    else openViewer(owner, type, false);
                    
                    return;
                }
                
                // Normal click if no card was spawned
                if (e.target === z) {
                    if (type === 'deck') drawCard(owner, 'deck');
                    else openViewer(owner, type, false);
                }
            });

            z.addEventListener('contextmenu', e => { 
                e.preventDefault(); 
                openDeckCtx(e, z.dataset.owner, z.dataset.type); 
            });
        }
    });
}

function handleKeys(e) {
    const k = e.key.toLowerCase();
	


    if (k === 'i') { openViewer('player', 'deck', true); return; }	

    if (hoveredId) {
        const card = findCard(hoveredId);
        if (!card) return;
        const el = document.getElementById(card.id);

        if (k === 'f') { card.faceUp = !card.faceUp; refreshCard(card); }
        if (k === 'r') { card.rotated = !card.rotated; refreshCard(card); }
        if (k === 'd') moveCardTo(card, 'afterlife');
        if (k === 's') moveCardTo(card, 'shadow');
        if (k === 'a') moveCardTo(card, 'oblivion');
        
        // NEW HOTKEYS
        if (k === 'h') moveCardTo(card, 'hand');
        if (k === 'c') cloneCard(card);
        if (k === 'e') toggleHighlight(el);
        if (e.key === 'Delete') removeCard(card);
        
        if (k === 'w') {
            if (card.type === 'Phantom') playCardToField(card, 'Phantom', true, false);
            else if (card.type === 'Spirit') playCardToField(card, 'Spirit', true, false);
            else if (card.type === 'Counter') playCardToField(card, 'Counter', false, false);
            else if (card.type === 'Environment') playCardToField(card, 'Environment', true, false);
        }
        return;
    } else if (hoveredZone) {
        const owner = hoveredZone.dataset.owner;
        const type = hoveredZone.dataset.type;
        if (owner && type) {
            const list = state[owner][type];
            if (k === 'r' && type.toLowerCase().includes('deck')) {
                shuffle(list); alert(`${type} Shuffled!`);
            }
            if (['d', 's', 'a'].includes(k)) {
                const card = list.pop();
                if (card) {
                    const dest = k === 'd' ? 'afterlife' : (k === 's' ? 'shadow' : 'oblivion');
                    state[owner][dest].push(card);
                    updateCounts(owner);
                }
            }
        }
    }
}

function closeAllModals() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('deck-viewer').classList.add('hidden');
	document.getElementById('card-info-panel').classList.add('hidden');
}

function startGame() {
    document.querySelectorAll('.card').forEach(c => c.remove());
    
    ['player', 'opponent'].forEach(p => {
        // Return cards from field/hand/piles back to deck
        const allCards = [...state[p].hand, ...state[p].field, ...state[p].afterlife, ...state[p].shadow, ...state[p].oblivion];
        allCards.forEach(card => {
            card.faceUp = true;
            card.rotated = false;
            card.loc = 'deck';
        });
        state[p].deck.push(...allCards);
        
        // Clear zones
        state[p].hand = [];
        state[p].afterlife = [];
        state[p].shadow = [];
        state[p].oblivion = [];
        state[p].field = [];
        state[p].lp = 10000;
        state[p].sp = 4;
        if (p === 'opponent') state[p].handVisible = false;
        
        shuffle(state[p].deck);
        updateCounts(p);
    });
    
    draw(5, 'player');
    draw(5, 'opponent');
    updateStats();
    closeAllModals();
}

function resetGame() {
    document.querySelectorAll('.card').forEach(c => c.remove());
    ['player', 'opponent'].forEach(p => {
        state[p] = { lp: 10000, sp: 4, hand: [], deck: [], sideDeck: [], extraDeck: [], afterlife: [], shadow: [], oblivion: [], field: [] };
        if (p === 'opponent') state[p].handVisible = false;
        updateCounts(p);
    });
    updateStats();
    document.getElementById('end-turn-btn').classList.remove('pulsing');
}

function initDeck(owner) {
    for(let i=0; i<40; i++) state[owner].deck.push(makeCard(owner, 'deck', 'spell'));
    for(let i=0; i<15; i++) state[owner].sideDeck.push(makeCard(owner, 'sideDeck', 'trap'));
    for(let i=0; i<5; i++) state[owner].extraDeck.push(makeCard(owner, 'extraDeck', 'monster'));
    shuffle(state[owner].deck);
    updateCounts(owner);
}

function makeCard(owner, loc, forcedType) {
    idCounter++;
    let cardData = allCards[Math.floor(Math.random() * allCards.length)];
    if (!cardData) {
        cardData = { name: 'Test Card', type: 'Phantom', level: 1, attack: 0, health: 0 };
    }
    return {
        id: `c-${idCounter}`,
        owner,
        name: cardData.name,
        type: cardData.type || 'Phantom',
        level: cardData.level || 1,
        attack: cardData.attack || 0,
        health: cardData.health || 0,
        description: cardData.description || '',
        image: cardData.image || null,
        faceUp: true,
        rotated: false,
		counter: 0,
		isToken: false,
        loc
    };
}

function createCardEl(data) {
    const el = document.createElement('div');
    el.id = data.id;
    el.className = `card ${data.type.toLowerCase()}`;
	const oldEl = document.getElementById(data.id);
    if (oldEl && oldEl.classList.contains('highlighted')) el.classList.add('highlighted');
    
    if (data.image) {
        el.style.backgroundImage = `url('${data.image}')`;
        el.classList.add('has-image');
    }
    
    if (!data.faceUp) el.classList.add('face-down');
    if (data.rotated) el.classList.add('rotated');
    el.draggable = true;
    
    const isOppHand = data.loc === 'hand' && data.owner === 'opponent';
        // Opponent sees it if global handVisible is on OR the individual card is revealed
    if (isOppHand && !state.opponent.handVisible && !data.revealed) {
        el.innerText = '';
        el.classList.add('face-down');
    } else if (data.faceUp) {
        if (data.type === 'Phantom' && data.loc === 'field') {
            el.innerHTML = `
                <div class="level-stat" onclick="editStat('${data.id}', 'level')">${data.level ?? 0}</div>
                <div class="card-stats">
                    <div class="stat-box atk" onclick="editStat('${data.id}', 'attack')">${data.attack || 0}</div>
                    <div class="stat-box hp" onclick="editStat('${data.id}', 'health')">${data.health || 0}</div>
                </div>
            `;
        } else if (!data.image) {
            el.innerText = data.name;
        }
    }

    el.addEventListener('dragstart', e => { draggedId = data.id; el.style.opacity = '0.5'; });
    el.addEventListener('dragend', () => el.style.opacity = '1');
    el.addEventListener('mouseenter', e => { hoveredId = data.id; if (e.shiftKey) showZoom(data); });
    el.addEventListener('mouseleave', () => { hoveredId = null; hideZoom(); });
    el.addEventListener('click', e => { if (!e.defaultPrevented && !e.target.classList.contains('stat-box')) showCardInfo(data); });
    el.addEventListener('dblclick', e => { e.stopPropagation(); toggleHighlight(el); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); hoveredId = data.id; openCardCtx(e, data); });
    // Render Counter Bubbles
	if (data.counter > 0) {
			const c = document.createElement('div');
			c.className = 'counter-bubble';
			c.innerText = data.counter;
			el.appendChild(c);
		}
	return el;
}

function toggleHighlight(el) {
    const card = findCard(el.id);
    if (!card) return;

    if (el.classList.contains('highlighted')) {
        el.classList.remove('highlighted');
        card.revealed = false;
        refreshCard(card);
    } else {
        el.classList.add('highlighted');
        
        // Reveal logic ONLY for player's hand
        if (card.owner === 'player' && card.loc === 'hand') {
            card.revealed = true;
            refreshCard(card);
            setTimeout(() => {
                card.revealed = false;
                const currentEl = document.getElementById(card.id);
                if (currentEl) currentEl.classList.remove('highlighted');
                refreshCard(card);
            }, 5000);
        } else {
            // General highlight (opponent cards or field cards)
            setTimeout(() => { 
                const currentEl = document.getElementById(card.id);
                if (currentEl) currentEl.classList.remove('highlighted'); 
            }, 2000);
        }
    }
}

function renderHand(owner) {
    const container = document.getElementById(`${owner}-hand`);
    container.innerHTML = '';
    state[owner].hand.forEach(c => { c.loc = 'hand'; container.appendChild(createCardEl(c)); });
}

function handleDrop(e) {
    e.preventDefault();
    if (!draggedId) return;

    // 1. Check if valid card
    const card = findCard(draggedId);
    if (!card) return;
    
    // 2. Check if valid target
    let target = e.target.closest('.zone, .hand-area');
    if (!target) return;

    // 3. Send Signal (Do not move logic here)
    executeAction('move_card', {
        cardId: draggedId,
        targetId: target.id
    });
}

function moveCardTo(card, destType) {
    removeCard(card);
    card.faceUp = true; card.rotated = false;
    
    const ownerList = state[card.owner];
    
    if (destType === 'topdeck') ownerList.deck.push(card);
    else if (destType === 'bottomdeck') ownerList.deck.unshift(card);
    else if (destType === 'randomdeck') {
        const idx = Math.floor(Math.random() * (ownerList.deck.length + 1));
        ownerList.deck.splice(idx, 0, card);
    }
    else ownerList[destType].push(card);
    
    updateCounts(card.owner);
    if(destType === 'hand') renderHand(card.owner);
}

function playCardToField(card, type) {
    removeCard(card);
    card.loc = 'field';
    state[card.owner].field.push(card);
    
    const prefix = card.owner;
    const zoneType = type === 'monster' ? 'monster' : 'spell';
    for(let i=1; i<=3; i++) {
        const zone = document.getElementById(`${prefix}-${zoneType}-${i}`);
        if(zone && zone.children.length === 0) {
            zone.appendChild(createCardEl(card));
            return;
        }
    }
    document.getElementById(`${prefix}-${zoneType}-1`).appendChild(createCardEl(card));
}

function removeCard(card) {
    const owner = state[card.owner];
    ['hand', 'deck', 'sideDeck', 'extraDeck', 'afterlife', 'shadow', 'oblivion', 'field'].forEach(list => {
        const idx = owner[list].findIndex(c => c.id === card.id);
        if (idx > -1) owner[list].splice(idx, 1);
    });
    const el = document.getElementById(card.id);
    if (el) el.remove();
}

function findCard(id) {
    for (const p of ['player', 'opponent']) {
        const s = state[p];
        const all = [...s.hand, ...s.deck, ...s.sideDeck, ...s.extraDeck, ...s.afterlife, ...s.shadow, ...s.oblivion, ...s.field];
        const found = all.find(c => c.id === id);
        if (found) return found;
    }
    return null;
}

function updateCounts(owner) {
    ['deck', 'sideDeck', 'extraDeck', 'afterlife', 'shadow', 'oblivion'].forEach(t => {
        const list = state[owner][t];
        const el = document.getElementById(`${owner}-${t}-count`);
        if (el) el.innerText = list.length;
        
        const zone = document.getElementById(`${owner}-${t}`);
        if(zone && ['afterlife', 'shadow', 'oblivion'].includes(t)) {
            if (list.length > 0) {
                const top = list[list.length-1];
                let color = '#795548'; 
                if(top.type === 'monster') color = '#d4a017';
                if(top.type === 'spell') color = '#16a085';
                if(top.type === 'trap') color = '#c0392b';
                zone.style.background = color;
                zone.style.opacity = '0.7';
            } else {
                zone.style.background = '';
                zone.style.backgroundColor = 'rgba(255,255,255,0.03)';
            }
        }
    });
}

function draw(amt, owner, deckType = 'deck') {
    const list = state[owner][deckType];
    for(let i=0; i<amt; i++) {
        if (list.length === 0) break;
        state[owner].hand.push(list.pop());
    }
    updateCounts(owner); renderHand(owner);
}

function drawCard(owner, deckType = 'deck') { draw(1, owner, deckType); }

function drawPhase() {
    const btn = document.querySelector('.phase-btn');
    btn.classList.add('pulsing-purple');
    
    // Remove class after animation finishes
    setTimeout(() => {
        btn.classList.remove('pulsing-purple');
    }, 1000);

    // Trigger the phase action
    executeAction('draw_phase', {});
}

function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }

function updateStats() {
    ['player', 'opponent'].forEach(p => {
        const el = document.getElementById(`${p}-lp`);
        if (el) el.value = state[p].lp; // Updates the input box
        
        const spEl = document.getElementById(`${p}-sp-val`);
        if (spEl) spEl.innerText = state[p].sp;
        
        const pipCon = document.getElementById(`${p}-sp-pips`);
        if (pipCon) {
            pipCon.innerHTML = '';
            for(let i=0; i<state[p].sp; i++) {
                const pip = document.createElement('div');
                pip.className = 'pip active';
                pipCon.appendChild(pip);
            }
        }
    });
}

function adjustLP(p, dir) { 
    let val = prompt("Amount?", "");
    if (val !== null && val.trim() !== "") { 
        const amount = parseInt(val);
        if (!isNaN(amount)) {
            // Hijack: Send to Action Engine instead of doing math here
            executeAction('adjust_lp', { target: p, amount: amount * dir });
        }
    }
}

function adjustSP(p, dir) { state[p].sp = Math.max(0, state[p].sp + dir); updateStats(); }
function resetSP(p) { state[p].sp = 4; updateStats(); }
function endTurn() { 
    document.getElementById('end-turn-btn').classList.add('pulsing');
    resetSP('player'); resetSP('opponent');
    setTimeout(() => document.getElementById('end-turn-btn').classList.remove('pulsing'), 3000);
}


function refreshCard(card) {
    const old = document.getElementById(card.id);
    if(old) old.replaceWith(createCardEl(card));
}

function cloneCard(card) {
    idCounter++;
    const newCard = { ...card, id: `c-${idCounter}` };
    
    if (card.loc === 'field') {
        const el = document.getElementById(card.id);
        const parent = el ? el.parentElement : null;
        if (parent && parent.classList.contains('zone')) {
            state[card.owner].field.push(newCard);
            parent.appendChild(createCardEl(newCard));
            return;
        }
    }
    
    state[card.owner].hand.push(newCard);
    renderHand(card.owner);
}

function openCardCtx(e, card) {
    ctxTarget = card;
    const menu = document.getElementById('ctx-card');
    menu.innerHTML = ''; 

    const addMsg = (text, action) => {
        const div = document.createElement('div');
        div.innerText = text;
        div.onclick = (event) => { event.stopPropagation(); cardAction(action); };
        menu.appendChild(div);
    };
    const addSep = () => {
        const div = document.createElement('div');
        div.className = 'sep';
        menu.appendChild(div);
    };

    const inHand = card.loc === 'hand';
    const isMyCard = card.owner === 'player';

    // 1. Play / Set Options (Hide for Opponent Hand)
    if (card.loc !== 'field' && (isMyCard || !inHand)) {
        if (card.type === 'Phantom') {
            addMsg('Play in Attack (W)', 'play-atk');
            addMsg('Play in Defense', 'play-def');
            addSep();
            addMsg('Set in Attack', 'set-atk');
            addMsg('Set in Defense', 'set-def');
            addSep();
        } else if (card.type === 'Spirit' || card.type === 'Counter') {
            addMsg('Play (Face-Up)', 'play-spirit');
            addMsg('Set (Face-Down)', 'set-spirit');
            addSep();
        } else if (card.type === 'Environment') {
            addMsg('Play Environment', 'play-env');
            addMsg('Set Environment', 'set-env');
            addSep();
        }
    }

    // 2. State Options
    if (!inHand) {
        addMsg('Flip (F)', 'flip');
        addMsg('Rotate (R)', 'rotate');
    }
    
    // Highlight
    addMsg(inHand && isMyCard ? 'Reveal & Highlight (E)' : 'Highlight (E)', 'highlight');
    
    // 3. Clone (Hide for Opponent Hand)
    if (isMyCard || !inHand) {
        addMsg('Copy/Clone (C)', 'clone');
    }
    addSep();

    // 4. Movement
    if (!inHand) addMsg('To Hand (H)', 'hand');
    addMsg('To Top Deck', 'topdeck');
    addMsg('To Bottom Deck', 'bottomdeck');
    addMsg('To Deck (Random)', 'randomdeck');
    addSep();

    // 5. Counters
    if (card.loc === 'field') {
        addMsg('Add Counter', 'add-counter');
        if (card.counter > 0) addMsg('Remove Counter', 'remove-counter');
        addSep();
    }

    // 6. Piles
    addMsg('To Afterlife (A)', 'afterlife');
    addMsg('To Shadow (S)', 'shadow');
    addMsg('To Oblivion (D)', 'oblivion');

    showMenu('ctx-card', e.pageX, e.pageY);
}

function cardAction(act) {
    hideCtx();
    if (!ctxTarget) return;
    const card = ctxTarget;

    // Play/Set Actions
    if (act === 'play-atk') executeAction('play_card', { cardId: card.id, zone: 'monster', attack: true, defense: false });
    else if (act === 'play-def') executeAction('play_card', { cardId: card.id, zone: 'monster', attack: false, defense: true });
    else if (act === 'set-atk')  executeAction('play_card', { cardId: card.id, zone: 'monster', attack: false, defense: false, set: true });
    else if (act === 'set-def')  executeAction('play_card', { cardId: card.id, zone: 'monster', attack: false, defense: true, set: true });
    else if (act === 'play-spirit') executeAction('play_card', { cardId: card.id, zone: 'spell' });
    else if (act === 'set-spirit')  executeAction('play_card', { cardId: card.id, zone: 'spell', set: true });
    else if (act === 'play-env') executeAction('play_card', { cardId: card.id, zone: 'environment' });
    else if (act === 'set-env')  executeAction('play_card', { cardId: card.id, zone: 'environment', set: true });
    
    // State Actions
    else if (act === 'flip') executeAction('flip_card', { cardId: card.id });
    else if (act === 'rotate') executeAction('rotate_card', { cardId: card.id });
    else if (act === 'highlight') toggleHighlight(document.getElementById(card.id)); // Local
    else if (act === 'clone') executeAction('clone_card', { cardId: card.id });
    
    // Movement Actions
    else if (act === 'hand') executeAction('move_card', { cardId: card.id, targetId: 'player-hand' });
    else if (act === 'topdeck') executeAction('move_card', { cardId: card.id, targetId: 'player-deck' });
    else if (act === 'bottomdeck') executeAction('move_card', { cardId: card.id, targetId: 'player-deck', toBottom: true });
    else if (act === 'randomdeck') executeAction('move_card', { cardId: card.id, targetId: 'player-deck', random: true });
    else if (act === 'afterlife') executeAction('move_card', { cardId: card.id, targetId: 'player-afterlife' });
    else if (act === 'shadow') executeAction('move_card', { cardId: card.id, targetId: 'player-shadow' });
    else if (act === 'oblivion') executeAction('move_card', { cardId: card.id, targetId: 'player-oblivion' });
    
    // Counter Actions
    else if (act === 'add-counter') executeAction('add_counter', { cardId: card.id });
    else if (act === 'remove-counter') executeAction('remove_counter', { cardId: card.id });
    
    // Reveal (Toggle)
    else if (act === 'toggle-reveal') { card.revealed = !card.revealed; refreshCard(card); }
}

function playCardToField(card, typeName, faceUp, rotated) {
    removeCard(card);
    card.loc = 'field';
    card.faceUp = faceUp;
    card.rotated = rotated;
    state[card.owner].field.push(card);

    const prefix = card.owner;
    let targetZone = null;

    // Map internal names (Phantom/Spirit) to HTML ID names (monster/spell)
    let htmlType = 'monster';
    if (typeName === 'Spirit' || typeName === 'Counter') htmlType = 'spell';

    if (typeName === 'Environment') {
        targetZone = document.getElementById(`${prefix}-env`);
    } else {
        // Priority: Middle(2) -> Left(1) -> Right(3) -> Balance 1 -> Balance 2
        const priorityIds = [
            `${prefix}-${htmlType}-2`,
            `${prefix}-${htmlType}-1`,
            `${prefix}-${htmlType}-3`,
            `${prefix}-balance-1`,
            `${prefix}-balance-2`
        ];

        for (let id of priorityIds) {
            const z = document.getElementById(id);
            if (z && z.children.length === 0) {
                targetZone = z;
                break;
            }
        }
        
        // Fallback: if all prioritized zones are full, default to center slot
        if (!targetZone) targetZone = document.getElementById(`${prefix}-${htmlType}-2`);
    }

    if (targetZone) {
        targetZone.appendChild(createCardEl(card));
    }
}

function openDeckCtx(e, owner, type) { viewerTarget = { owner, type }; showMenu('ctx-deck', e.pageX, e.pageY); }

function showMenu(id, x, y) { 
    const m = document.getElementById(id); 
    
    // 1. Show the menu instantly so we can measure its width/height
    m.classList.remove('hidden');
    
    const menuWidth = m.offsetWidth;
    const menuHeight = m.offsetHeight;
    const padding = 10; // Small buffer from the edge

    // 2. Flip horizontal if it goes off the right edge
    if (x + menuWidth > window.innerWidth) {
        x = x - menuWidth;
    }

    // 3. Flip vertical if it goes off the bottom edge
    if (y + menuHeight > window.innerHeight) {
        y = y - menuHeight;
    }

    // 4. Safety: ensure it doesn't flip off the top or left edges
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    m.style.left = x + 'px'; 
    m.style.top = y + 'px'; 
}

function hideCtx() { document.querySelectorAll('.ctx-menu').forEach(e => e.classList.add('hidden')); }


function viewPile(owner, type) { openViewer(owner, type); }

function deckAction(act) {
    hideCtx(); 
    if (!viewerTarget) return;
    const { owner, type } = viewerTarget;
    const list = state[owner][type];

    if (act === 'draw') drawCard(owner, type); 
    else if (act === 'search') openViewer(owner, type, true); 
    else if (act === 'view') openViewer(owner, type, false);   
    else if (act === 'shuffle') { shuffle(list); alert('Shuffled'); }
    else if (act === 'mill') { const c = list.pop(); if (c) { state[owner].afterlife.push(c); updateCounts(owner); } }
    
    // NEW DECK OPTIONS
    else if (act === 'draw-bottom') {
        if (list.length > 0) {
            const c = list.shift(); // Take from index 0
            state[owner].hand.push(c);
            renderHand(owner);
            updateCounts(owner);
        }
    }
    else if (act.startsWith('draw-first-')) {
        const targetType = act.replace('draw-first-', ''); // e.id. 'Phantom'
        const idx = list.findIndex(c => c.type === targetType);
        if (idx > -1) {
            const c = list.splice(idx, 1)[0];
            state[owner].hand.push(c);
            renderHand(owner);
            updateCounts(owner);
        }
    }
}

function openViewer(owner, type, shouldSort) {
    viewerTarget = { owner, type, shouldSort }; 
    const viewer = document.getElementById('deck-viewer');
    if (!viewer) return; // Safety check

    viewer.classList.remove('hidden');
    document.getElementById('viewer-title').innerText = `${owner} ${type} (${shouldSort ? 'Sorted' : 'Top-to-Bottom'})`;
    renderViewer();
}

function renderViewer() {
    const grid = document.getElementById('viewer-grid');
    if (!grid) return; // Safety check
    grid.innerHTML = '';
    
    // Get a copy of the list so we don't accidentally mutate the real deck while viewing
    let list = [...state[viewerTarget.owner][viewerTarget.type]];
    const term = document.getElementById('viewer-search').value.toLowerCase();

    if (viewerTarget.shouldSort) {
        // SORTING LOGIC: Phantom (Monster) -> Spirit (Spell) -> Counter (Trap) -> Environment
        const typeOrder = { 'monster': 1, 'phantom': 1, 'spell': 2, 'spirit': 2, 'trap': 3, 'counter': 3, 'environment': 4 };
        list.sort((a, b) => {
            if (typeOrder[a.type] !== typeOrder[b.type]) {
                return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
            }
            return a.name.localeCompare(b.name);
        });
    } else {
        // VIEW LOGIC: Show top of deck (end of array) first
        list.reverse();
    }

    list.forEach((c) => {
        if (term && !c.name.toLowerCase().includes(term)) return;
        
        const el = createCardEl(c); 
        el.classList.remove('face-down'); // Always show cards face-up in viewer
        el.draggable = false;
        
        el.onclick = () => {
            const originalList = state[viewerTarget.owner][viewerTarget.type];
            // Find the specific card by ID in the actual deck
            const idx = originalList.findIndex(card => card.id === c.id);
            if (idx > -1) {
                const movedCard = originalList.splice(idx, 1)[0];
                state[viewerTarget.owner].hand.push(movedCard);
                renderHand(viewerTarget.owner);
                updateCounts(viewerTarget.owner);
                closeAllModals();
            }
        };
        grid.appendChild(el);
    });
}
function filterViewer() { renderViewer(); }
function closeViewer() { document.getElementById('deck-viewer').classList.add('hidden'); }
function showZoom(card) {
    const img = document.getElementById('zoomed-card-img'); img.innerHTML = '';
    const clone = createCardEl({ ...card, faceUp: true, rotated: false }); clone.style.position = 'static';
    img.appendChild(clone); document.getElementById('zoom-overlay').classList.remove('hidden');
}
function hideZoom() { document.getElementById('zoom-overlay').classList.add('hidden'); }
function toggleMenu() { document.getElementById('main-menu').classList.toggle('hidden'); }
function rollDie() { document.getElementById('die-result').innerText = Math.floor(Math.random()*6)+1; }
function flipCoin() { document.getElementById('coin-result').innerText = Math.random()>0.5?"Heads":"Tails"; }
function toggleOpponentHand() { state.opponent.handVisible = !state.opponent.handVisible; renderHand('opponent'); }
function togglePlayerHand() { }

function showCardInfo(card) {
    if (card.owner === 'opponent' && (!card.faceUp || (card.loc === 'hand' && !state.opponent.handVisible))) {
        return;
    }
    
    const panel = document.getElementById('card-info-panel');
    document.getElementById('card-info-name').innerText = card.name;
    
    const statsDiv = document.getElementById('card-info-stats');
    statsDiv.innerHTML = '<div class="info-divider"></div>';
    
    // Line 1: Form & Level (Left Aligned)
    const line1 = document.createElement('div');
    line1.className = 'info-line';
    let line1HTML = `Form: ${card.type || '???'}`;
    if (card.type === 'Phantom') {
		line1HTML += ` &nbsp; Level: <span onclick="editStat('${card.id}', 'level')" class="editable">${card.level ?? 0}</span>`;
    }
    line1.innerHTML = line1HTML;
    statsDiv.appendChild(line1);

    // Line 2: Archetypes (Left Aligned, Regular Dash)
    const archs = [];
    if (card.archetype) archs.push(card.archetype);
    if (card.archetypes && card.archetypes[1]) archs.push(card.archetypes[1]);
    if (card.archetypes && card.archetypes[2]) archs.push(card.archetypes[2]);
    
    const archDiv = document.createElement('div');
    archDiv.className = 'info-line';
    archDiv.innerText = `Archetypes: ${archs.length > 0 ? archs.join(' - ') : 'None'}`;
    statsDiv.appendChild(archDiv);

    // Line 3: Attack & Health (Now AFTER Archetypes)
    if (card.type === 'Phantom') {
        const line3 = document.createElement('div');
        line3.className = 'info-line';
        line3.innerHTML = `Attack: <span onclick="editStat('${card.id}', 'attack')" class="editable">${card.attack || 0}</span> 
                           &nbsp; Health: <span onclick="editStat('${card.id}', 'health')" class="editable">${card.health || 0}</span>`;
        statsDiv.appendChild(line3);
    }
    
    // Ability Text Section (Centered)
    const textDiv = document.getElementById('card-info-text');
    if (card.description) {
        const charCount = card.description.length;
        let fontSize = 22; // Adjusted max size to be smaller than before
        if (charCount > 120) fontSize = 18;
        if (charCount > 300) fontSize = 15;
        
        // Wrap header and divider in a container for centering
        const container = document.createElement('div');
        container.className = 'card-info-text-container';
		container.innerHTML = `
            <strong>Ability:</strong>
            <div class="info-divider" style="width: 60%; margin: 5px auto;"></div>
            <div style="font-size: ${fontSize}px; line-height: 1.4; text-align: left;">${card.description}</div>
        `;
        statsDiv.appendChild(container);
    }
    
    panel.classList.remove('hidden');
}

function closeCardInfo() {
    document.getElementById('card-info-panel').classList.add('hidden');
}

function editStat(cardId, stat) {
    const card = findCard(cardId);
    if (!card) return;
    const val = prompt(`New ${stat}:`, card[stat]);
    if (val !== null) {
        card[stat] = parseInt(val) || 0;
        showCardInfo(card);
        refreshCard(card);
    }
}

function loadDeckFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const deckData = JSON.parse(evt.target.result);
                
                // Convert to full card objects
                state.player.deck = (deckData.main || []).map(c => ({
                    ...c,
                    id: `c-${++idCounter}`,
                    owner: 'player',
                    loc: 'deck',
                    faceUp: true,
                    rotated: false
                }));
                
                state.player.sideDeck = (deckData.side || []).map(c => ({
                    ...c,
                    id: `c-${++idCounter}`,
                    owner: 'player',
                    loc: 'sideDeck',
                    faceUp: true,
                    rotated: false
                }));
                
                state.player.extraDeck = (deckData.extra || []).map(c => ({
                    ...c,
                    id: `c-${++idCounter}`,
                    owner: 'player',
                    loc: 'extraDeck',
                    faceUp: true,
                    rotated: false
                }));
                
                shuffle(state.player.deck);
                updateCounts('player');
                alert('Deck loaded! Click "Resume Game" to play.');
            } catch (err) {
                alert('Invalid deck file!');
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function spawnToken(owner) {
    idCounter++;
    const token = {
        id: `token-${idCounter}`,
        owner: owner,
        name: 'Token',
        type: 'Phantom',
        level: 0, // Level 0
        attack: 0,
        health: 0,
        description: 'Generated Token.',
        image: null,
        faceUp: true,
        rotated: true, // Defense Position
        loc: 'field',
        counter: 0,
        isToken: true
    };
    
    state[owner].field.push(token);
    const prefix = owner;

    // Priority List: Center(2), Left(1), Right(3), Bal1, Bal2
    const priority = [
        `${prefix}-monster-2`, 
        `${prefix}-monster-1`, 
        `${prefix}-monster-3`, 
        `${prefix}-balance-1`, 
        `${prefix}-balance-2`
    ];

    let targetZone = null;
    for (let id of priority) {
        const zone = document.getElementById(id);
        if (zone && zone.children.length === 0) {
            targetZone = zone;
            break;
        }
    }

    // Fallback if all zones full: Center
    if (!targetZone) targetZone = document.getElementById(`${prefix}-monster-2`);

    targetZone.appendChild(createCardEl(token));
}



// === SIMPLE ACTION-BASED MULTIPLAYER ===
let socket = null;
let isMultiplayer = false;
let myRole = null; 
let roomCode = null;

// The one true local port is 3000
const SERVER_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000' 
    : 'https://mytcg.teamdragonmaster.com';

function connectToServer(callback) {
    if (socket && socket.connected) {
        if (callback) callback();
        return;
    }
    
    console.log("Connecting to:", SERVER_URL);
    socket = io(SERVER_URL);

    socket.on('connect', () => {
        console.log("Socket connected!");
        if (callback) callback();
    });

    socket.on('connect_error', (err) => {
        console.warn("Socket connection error (local server failure):", err.message);
    });

    socket.on('room_created', (data) => {
        roomCode = data.roomCode;
        myRole = 'host';
        isMultiplayer = true;
        document.getElementById('room-status').innerText = `Room Code: ${roomCode}\nWaiting for opponent...`;
    });

    socket.on('room_joined', (data) => {
        roomCode = data.roomCode;
        myRole = 'guest';
        isMultiplayer = true;
        closeMultiplayerMenu();
        startGame();
    });

    socket.on('opponent_joined', () => {
        closeMultiplayerMenu();
        startGame();
    });

    socket.on('game_action', (data) => {
        executeAction(data.type, data.payload, true);
    });
}

function openMultiplayerMenu() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('multiplayer-menu').classList.remove('hidden');
    connectToServer(); 
}

function closeMultiplayerMenu() {
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
}

// Function to handle connecting and waiting for the socket to be ready
function initSocket(callback) {
    if (!socket) connectToServer();
    
    if (socket.connected) {
        if (callback) callback();
    } else {
        // Wait for connection to be ready before calling the callback
        socket.once('connect', callback); 
    }
}

function createRoom() {
    initSocket(() => {
        socket.emit('create_room');
    });
}

function joinRoom() {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) return alert('Enter code!');
    initSocket(() => {
        socket.emit('join_room', code);
    });
}


function applyOpponentAction(data) {
    const { type, payload } = data;
    
    switch(type) {
        case 'move':
            const card = findCard(payload.cardId);
            if (!card) break;
            removeCard(card);
            
            const zone = document.getElementById(payload.toZone);
            if (!zone) break;
            
            if (zone.classList.contains('hand-area')) {
                card.owner = payload.owner;
                state[payload.owner].hand.push(card);
                renderHand(payload.owner);
            } else if (zone.dataset.type) {
                card.owner = payload.owner;
                state[payload.owner][zone.dataset.type].push(card);
                updateCounts(payload.owner);
            } else {
                card.loc = 'field';
                state[payload.owner].field.push(card);
                zone.appendChild(createCardEl(card));
            }
            break;
            
        case 'lp':
            state[payload.player].lp = payload.value;
            updateStats();
            break;
            
        case 'sp':
            state[payload.player].sp = payload.value;
            updateStats();
            break;
            
        case 'flip':
            const flipCard = findCard(payload.cardId);
            if (flipCard) {
                flipCard.faceUp = payload.faceUp;
                refreshCard(flipCard);
            }
            break;
            
        case 'rotate':
            const rotCard = findCard(payload.cardId);
            if (rotCard) {
                rotCard.rotated = payload.rotated;
                refreshCard(rotCard);
            }
            break;
            
        case 'die':
            document.getElementById('die-result').innerText = payload.value;
            break;
            
        case 'coin':
            document.getElementById('coin-result').innerText = payload.value;
            break;
            
        case 'draw':
            draw(payload.amount, payload.player, payload.deckType);
            break;
    }
}

// Wrap game functions
const __origHandleDrop = handleDrop;
window.handleDrop = function(e) {
    __origHandleDrop(e);
    
    if (!isMultiplayer || !draggedId) return;
    const card = findCard(draggedId);
    const target = e.target.closest('.zone, .hand-area');
    if (!card || !target) return;
    
    sendAction({
        type: 'move',
        payload: {
            cardId: card.id,
            toZone: target.id,
            owner: card.owner
        }
    });
};

const __origAdjustLP = adjustLP;
window.adjustLP = function(p, dir) {
    __origAdjustLP(p, dir);
    if (!isMultiplayer) return;
    sendAction({ type: 'lp', payload: { player: p, value: state[p].lp } });
};

const __origAdjustSP = adjustSP;
window.adjustSP = function(p, dir) {
    __origAdjustSP(p, dir);
    if (!isMultiplayer) return;
    sendAction({ type: 'sp', payload: { player: p, value: state[p].sp } });
};

const __origCardAction = cardAction;
window.cardAction = function(act) {
    __origCardAction(act);
    if (!isMultiplayer || !ctxTarget) return;
    
    if (act === 'flip') {
        sendAction({ type: 'flip', payload: { cardId: ctxTarget.id, faceUp: ctxTarget.faceUp } });
    } else if (act === 'rotate') {
        sendAction({ type: 'rotate', payload: { cardId: ctxTarget.id, rotated: ctxTarget.rotated } });
    }
};

const __origRollDie = rollDie;
window.rollDie = function() {
    __origRollDie();
    if (!isMultiplayer) return;
    sendAction({ type: 'die', payload: { value: document.getElementById('die-result').innerText } });
};

const __origFlipCoin = flipCoin;
window.flipCoin = function() {
    __origFlipCoin();
    if (!isMultiplayer) return;
    sendAction({ type: 'coin', payload: { value: document.getElementById('coin-result').innerText } });
};

const __origDraw = draw;
window.draw = function(amt, owner, deckType = 'deck') {
    __origDraw(amt, owner, deckType);
    if (!isMultiplayer) return;
    sendAction({ type: 'draw', payload: { amount: amt, player: owner, deckType } });
};