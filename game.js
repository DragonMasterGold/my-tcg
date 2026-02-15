let allCards = [];
let cardImages = {};
let keywordRepo = {};
let battleState = { attackerId: null, targetId: null };
let autoSP = true;

async function loadCardDatabase() {
    try {
        // Load Cards
        const response = await fetch('cards.json');
        allCards = await response.json();
        allCards.forEach(card => {
            if (card.image) cardImages[card.id] = card.image;
        });

        // --- 2. ADD THIS: Load Keywords ---
        const kwResponse = await fetch('keywords.json');
        keywordRepo = await kwResponse.json();
        console.log("Keywords Loaded:", Object.keys(keywordRepo)); 

    } catch (error) {
        console.error('Failed to load databases:', error);
    }
}
const state = {
    player: { lp: 10000, sp: 4, hand: [], deck: [], sideDeck: [], extraDeck: [], afterlife: [], shadow: [], oblivion: [], field: [] },
    opponent: { lp: 10000, sp: 4, hand: [], deck: [], sideDeck: [], extraDeck: [], afterlife: [], shadow: [], oblivion: [], field: [], handVisible: false }
};

const defaultImages = {
    'phantom': 'Images/Cards/Phantom Card.png',
    'spirit': 'Images/Cards/Spirit Card.png',
    'counter': 'Images/Cards/Counter Card.png',
    'environment': 'Images/Cards/Environment Card.png',
    'token': 'Images/Cards/Token Card.png'
};

let idCounter = 0;
let draggedId = null;
let hoveredId = null;
let currentZoomId = null;
let ctxTarget = null;
let viewerTarget = null;
let highlightTimer = null;
let hoveredZone = null;

window.onload = async () => {
    await loadCardDatabase();
    setupListeners();
    setupLPListeners(); // <-- ADD THIS LINE HERE
    updateStats();
    
    initDeck('player');
    initDeck('opponent');
    
    // Fix Coin visual
    const coinBtn = document.querySelector('button[onclick*="flipCoin"]');
	if (coinBtn) coinBtn.innerHTML = '<span class="coin-icon"></span>';

    document.getElementById('main-menu').classList.remove('hidden');
};

function setupListeners() {
    let shiftHeld = false;
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Shift') shiftHeld = true;
        if (e.key === 'Escape') {
            const kwPopup = document.getElementById('keyword-popup');
            const info = document.getElementById('card-info-panel');
            const viewer = document.getElementById('deck-viewer');
            const mainMenu = document.getElementById('main-menu');
            const multiplayerMenu = document.getElementById('multiplayer-menu');

            if (kwPopup && !kwPopup.classList.contains('hidden')) {
                kwPopup.classList.add('hidden');
            }
            else if (info && !info.classList.contains('hidden')) {
                if (typeof closeCardInfo === 'function') closeCardInfo();
            }
            else if (viewer && !viewer.classList.contains('hidden')) {
                viewer.classList.add('hidden');
            }
            else if (multiplayerMenu && !multiplayerMenu.classList.contains('hidden')) {
                multiplayerMenu.classList.add('hidden');
                if (mainMenu) mainMenu.classList.remove('hidden');
            }
            else {
                toggleMenu();
            }
        } else if (e.key === 'Enter') {
            const multiplayerMenu = document.getElementById('multiplayer-menu');
            if (multiplayerMenu && !multiplayerMenu.classList.contains('hidden')) {
                const codeInput = document.getElementById('room-code-input');
                if (document.activeElement === codeInput) {
                    joinRoom();
                }
            }
        } else {
            // FIX: This line connects the hotkeys (F, R, W, etc.) back to the game
            handleKeys(e);
        }
    });
    
    document.addEventListener('keyup', e => {
        if (e.key === 'Shift') { shiftHeld = false; hideZoom(); }
    });
    
    document.addEventListener('mousemove', e => {
        if (shiftHeld && hoveredId) {
            // Only trigger zoom if we aren't already zooming this specific card
            if (hoveredId === currentZoomId) return; 
            
            const card = findCard(hoveredId);
            if (card) {
                showZoom(card);
                currentZoomId = hoveredId;
            }
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
			// 1. Only left click
			if (e.button !== 0 || z.classList.contains('hand-area')) return;
			
			// 2. IMPORTANT: Only allow this for Decks! 
			// This stops Shadow/Oblivion/Field zones from popping cards from the main deck.
			const type = z.dataset.type;
			if (type !== 'deck' && type !== 'sideDeck' && type !== 'extraDeck') return;

			// 3. Only if the zone is empty
			if (z.querySelector('.card')) return;

			const owner = z.dataset.owner;
			if (owner === 'player' && state[owner][type].length > 0) {
				const card = state[owner][type].pop();
				card.loc = 'field'; 
				state[owner].field.push(card);
				
				// SYNC: Draw top card to field
				if (isMultiplayer) {
					sendAction('mill', { owner: 'player', source: type, dest: 'field', cardId: card.id });
				}

				const cardEl = createCardEl(card);
				cardEl.style.opacity = '0'; 
				cardEl.addEventListener('dragstart', () => {
					cardEl.style.opacity = '1';
					draggedId = card.id;
				});
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

						// FIX: Tell opponent to ALSO put it back (undoing the mousedown 'mill')
						if (isMultiplayer) {
							sendAction('move', { 
								cardId: card.id, 
								toZone: `${owner}-${type}`, // e.g. 'player-deck'
								fromZone: 'field' 
							});
						}
					}
					
					// Now perform the intended click action
					 if (e.target === z || z.contains(e.target)) {
						if (type === 'deck') drawCard(owner, 'deck');
						else openViewer(owner, type, false);
					}
					
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
	
	// 1. --- GLOBAL HOTKEYS ---
    if (k === 'n') {
        const aId = battleState.attackerId;
        const tId = battleState.targetId;
        battleState = { attackerId: null, targetId: null };
        if (aId) { const c = findCard(aId); if(c) refreshCard(c); }
        if (tId) { const c = findCard(tId); if(c) refreshCard(c); }
        if (isMultiplayer) sendAction('battle_sync', { step: 'cancel' });
        return;
    }
    if (k === 'i') { openViewer('player', 'deck', true); return; }	

    // STEP 3: Execute Battle (Global Check)
    // If both IDs are already set, pressing B executes immediately regardless of hover.
    // This fixes the "3rd click" lag.
    if (k === 'b' && battleState.attackerId && battleState.targetId) {
        executeBattleLogic();
        return;
    }

    // 2. --- DYNAMIC HOVER CHECK ---
    const hoveredEl = document.querySelector('.card:hover') || 
                      document.querySelector('.card *:hover')?.closest('.card');
    
    const hoveredOpponentSide = document.querySelector('.opponent-side:hover');

    if (hoveredEl) {
        const card = findCard(hoveredEl.id);
        if (!card) return;

        if (k === 'b') {
            if (!battleState.attackerId) {
                // Step 1: Set Attacker (Must be yours)
                if (card.owner === 'player' && !card.rotated && card.faceUp) {
                    battleState.attackerId = card.id;
                    refreshCard(card);
                    if (isMultiplayer) sendAction('battle_sync', { step: 'init', attackerId: card.id });
                }
            } else if (!battleState.targetId) {
                // Step 2: Set Target (Must be opponent's)
                if (card.owner === 'opponent' && card.id !== battleState.attackerId) {
                    battleState.targetId = card.id;
                    refreshCard(card);
                    if (isMultiplayer) sendAction('battle_sync', { step: 'target', targetId: card.id });
                }
            }
            return;
        }

        // F - Flip
        if (k === 'f') { 
			card.faceUp = !card.faceUp; 
			refreshCard(card);
			if (isMultiplayer) sendAction('flip', { cardId: card.id, faceUp: card.faceUp });
		}
        // R - Rotate
		if (k === 'r') { 
			card.rotated = !card.rotated; 
			refreshCard(card);
			if (isMultiplayer) sendAction('rotate', { cardId: card.id, rotated: card.rotated });
		}
		// D - Afterlife
		if (k === 'd') {
			moveCardTo(card, 'afterlife');
			if (isMultiplayer) sendAction('move', { 
				cardId: card.id, 
				fromZone: card.loc === 'field' ? 'field' : 'hand',
				toZone: `${card.owner}-afterlife`,
				owner: card.owner 
			});
		}
        // S - Shadow
		if (k === 's') {
			const originalLoc = card.loc;
			moveCardTo(card, 'shadow');
			if (isMultiplayer) sendAction('move', { 
				cardId: card.id, 
				fromZone: originalLoc,
				toZone: `${card.owner}-shadow`, 
				owner: card.owner 
			});
		}
        // A - Oblivion
		if (k === 'a') {
			const originalLoc = card.loc;
			moveCardTo(card, 'oblivion');
			if (isMultiplayer) sendAction('move', { 
				cardId: card.id, 
				fromZone: originalLoc,
				toZone: `${card.owner}-oblivion`, 
				owner: card.owner 
			});
		}
        // H - Hand
		if (k === 'h') {
			moveCardTo(card, 'hand');
			if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: `${card.owner}-hand`, owner: card.owner });
		}      
        // C - Clone
        if (k === 'c') cloneCard(card);
        // E - Highlight
        if (k === 'e') toggleHighlight(hoveredEl);
        // Delete
        if (e.key === 'Delete') {
			const cid = card.id;
			removeCard(card);
			if (isMultiplayer) sendAction('remove_card_absolute', { cardId: cid });
		}
		// P - Random Deck
		if (k === 'p') {
            const originalLoc = card.loc;
            const targetZone = `${card.owner}-deck`; 
            moveCardTo(card, 'randomdeck');
            if (isMultiplayer) {
                sendAction('move', { 
                    cardId: card.id, 
                    fromZone: originalLoc,
                    toZone: targetZone, 
                    random: true
                });
            }
        }
		
		// In handleKeys, add 'u' and update 'w'
		if (k === 'u') {
			if (card.loc === 'field') unsummonPhantom(card);
			return;
		}
		
        // W - Play to Field
        if (k === 'w') {
			if (!handleSummonCost(card)) return; // Check cost
            let typeName = 'Phantom';
            if (card.type === 'Spirit') typeName = 'Spirit';
            if (card.type === 'Counter') typeName = 'Counter';
            if (card.type === 'Environment') typeName = 'Environment';
            const faceUp = (card.type !== 'Counter');
            playCardToField(card, typeName, faceUp, false);
            const landedZone = document.getElementById(card.id).parentElement.id;
            if (isMultiplayer) sendAction('move', { 
                cardId: card.id, 
                toZone: landedZone,
                faceUp: faceUp 
            });
        }
        return;
	} 

    if (k === 'b' && battleState.attackerId && !battleState.targetId && hoveredOpponentSide) {
        // Step 2 Alternative: Direct Attack
        const atkCard = findCard(battleState.attackerId);
        if (!atkCard) return;

        // Rules check
        const oppPhantoms = state.opponent.field.filter(c => c.type === 'Phantom');
        if (oppPhantoms.length > 0) {
            alert("Cannot Direct Attack while opponent has Phantoms!");
            return;
        }
        if (atkCard.summonedThisTurn) {
            alert("Phantoms cannot Direct Attack the turn they are summoned!");
            return;
        }

        // Execute Direct Attack
        const dmg = atkCard.health > 0 ? atkCard.attack : 0;
        executeAction('adjust_lp', { target: 'opponent', amount: -dmg });
        
        // Cleanup
        battleState = { attackerId: null, targetId: null };
        refreshCard(atkCard);
        return;
    }

    // 3. --- ZONE ACTIONS (Hovering an empty deck/pile) ---
    else if (hoveredZone) {
        const owner = hoveredZone.dataset.owner;
        const type = hoveredZone.dataset.type;
        if (!type || !['deck', 'sideDeck', 'extraDeck', 'afterlife', 'shadow', 'oblivion'].includes(type)) return;
        if (hoveredZone.querySelector('.card')) return;

        const list = state[owner][type];
        if (owner && type && list && list.length > 0) {
            if (['d', 's', 'a'].includes(k)) {
                const card = list.pop(); 
                const dest = k === 'd' ? 'afterlife' : (k === 's' ? 'shadow' : 'oblivion');
                state[owner][dest].push(card);
                updateCounts(owner);
                if (isMultiplayer) sendAction('mill', { owner: owner, source: type, dest: dest });
            }
            if (k === 'r' && type.toLowerCase().includes('deck')) {
                shuffle(list);
                alert(`${type} Shuffled!`);
                updateCounts(owner);
                if (isMultiplayer) sendAction('shuffle_deck_simple', { owner: owner, type: type });
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
    if (!isMultiplayer) draw(5, 'opponent');
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
        
        // ADD THESE LINES:
        archetype: cardData.archetype || "",
        archetypes: cardData.archetypes || [], 
        
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
	el.addEventListener('mousedown', e => {
        e.stopPropagation(); 
    });
	
	if (data.id === battleState.attackerId) el.classList.add('battle-attacker');
	if (data.id === battleState.targetId) el.classList.add('battle-target');
    
	const oldEl = document.getElementById(data.id);
	if (data.isHighlighted) el.classList.add('highlighted');
    // Maintain highlight across refreshes
    
    
    
    if (data.rotated) el.classList.add('rotated');
    el.draggable = true;

    // --- VISIBILITY LOGIC ---
    const isOpponentHand = (data.loc === 'hand' && data.owner === 'opponent');
    const isRevealed = state[data.owner].handVisible || data.revealed;
    
    // Logic: Hide if it's set on the field (!faceUp) OR it's an unrevealed opponent hand card
    const shouldHide = !data.faceUp || (isOpponentHand && !isRevealed);

    if (shouldHide) {
        el.classList.add('face-down');
        el.style.backgroundImage = 'none';
        el.innerText = '';
        el.innerHTML = ''; // Completely empty content
    } else {
        el.classList.remove('face-down');
		
        
        // Determine and apply image with fallback
		// Always set name first
		const nameEl = document.createElement('div');
		nameEl.className = 'card-name';
		nameEl.innerText = data.name;
		el.appendChild(nameEl);

		// Start with default image immediately
		const typeKey = (data.type || "").toLowerCase().trim();
		const defaultImg = defaultImages[typeKey];
		const primaryImage = data.image && data.image.trim() !== "" ? data.image : null;

		// Set default first (always visible)
		if (defaultImg) {
			el.style.backgroundImage = `url('${defaultImg}')`;
			el.classList.add('has-image');
		}

		// Then try to upgrade to specific image if it exists
		if (primaryImage) {
			const img = new Image();
			img.onload = () => {
				// Specific image loaded successfully - use it
				el.style.backgroundImage = `url('${primaryImage}')`;
			};
			// If it fails, we already have default showing
			img.src = primaryImage;
		}
		
		if (data.type === 'Phantom' && data.loc !== 'pile') {
            el.insertAdjacentHTML('beforeend', `
                <div class="level-stat" onclick="event.stopPropagation(); editStat('${data.id}', 'level')">${data.level ?? 0}</div>
                <div class="card-stats">
                    <div class="stat-box atk" onclick="event.stopPropagation(); editStat('${data.id}', 'attack')">${data.attack || 0}</div>
                    <div class="stat-box hp" onclick="event.stopPropagation(); editStat('${data.id}', 'health')">${data.health || 0}</div>
                </div>
            `);
        }
    }

    // --- COUNTER BUBBLES ---
    if (data.counter > 0) {
        const c = document.createElement('div');
        c.className = 'counter-bubble';
        c.innerText = data.counter;
        el.appendChild(c);
    }

    // --- EVENT LISTENERS ---
    el.addEventListener('dragstart', e => { draggedId = data.id; el.style.opacity = '0.5'; });
    el.addEventListener('dragend', () => el.style.opacity = '1');
    el.addEventListener('mouseenter', e => { 
		hoveredId = data.id; 
		if (e.shiftKey) showZoom(data); 
	});
    el.addEventListener('mouseleave', () => { hoveredId = null; hideZoom(); });
    
    el.addEventListener('click', e => { 
        // 1. Only respond to Left Click (button 0)
        // 2. Do NOT show info box if the card is sitting on a pile (loc is 'pile')
        if (e.button !== 0 || data.loc === 'pile') return;

        if (!e.defaultPrevented && !e.target.classList.contains('stat-box') && !e.target.classList.contains('level-stat')) {
            showCardInfo(data); 
        }
    });

    el.addEventListener('dblclick', e => { 
        // Do not highlight cards sitting on piles
        if (data.loc === 'pile') return;
        e.stopPropagation(); 
        toggleHighlight(el); 
    });

    el.addEventListener('contextmenu', e => { 
        // FIX: If the location is 'pile', return immediately.
        // We do NOT call preventDefault or stopPropagation here.
        // This allows the right-click to "pass through" to the Deck/Pile zone beneath.
        if (data.loc === 'pile') return; 

        e.preventDefault(); 
        e.stopPropagation(); 
        hoveredId = data.id; 
        openCardCtx(e, data); 
    });

    return el;
}

function toggleHighlight(el) {
    const card = findCard(el.id);
    if (!card) return;

    // 1. Set highlight state in data
    card.isHighlighted = true;
    
    // 2. Reveal if in player's hand
    if (card.loc === 'hand' && card.owner === 'player') {
        card.revealed = true;
    }

    // 3. Redraw the card (it will now have the 'highlighted' class)
    refreshCard(card);

    if (isMultiplayer) {
        sendAction('highlight', { cardId: card.id, highlighted: true });
    }

    // 4. Timer handles the cleanup by updating data and refreshing again
    setTimeout(() => {
        card.isHighlighted = false;
        if (card.loc === 'hand' && card.owner === 'player') {
            card.revealed = false;
        }
        refreshCard(card);
        
        if (isMultiplayer) {
            sendAction('highlight', { cardId: card.id, highlighted: false });
        }
    }, 2000);
}

function renderHand(owner) {
    const container = document.getElementById(`${owner}-hand`);
    container.innerHTML = '';
    state[owner].hand.forEach(c => { c.loc = 'hand'; container.appendChild(createCardEl(c)); });
}

function handleDrop(e) {
    e.preventDefault();
    if (!draggedId) return;
    const card = findCard(draggedId);
    if (!card) return;
    
    let target = e.target.closest('.zone, .hand-area');
    if (!target) return;
	
	 // --- NEW: COST CHECK ---
    // If moving from Hand to Field, check cost
    if (card.loc === 'hand' && target.id.includes('field') || target.dataset.zone === 'field') {
        if (!handleSummonCost(card)) return; // Stop the drop if can't afford
    }
    

    executeAction('move_card', {
        cardId: draggedId,
        targetId: target.id
    });

    if (isMultiplayer && card) {
        // FIX: Added faceUp and rotated to the signal
        sendAction('move', { 
            cardId: card.id, 
            toZone: target.id, 
            owner: card.owner, 
            fromZone: card.loc,
            faceUp: card.faceUp,
            rotated: card.rotated
        });
    }
}

function moveCardTo(card, destType) {
    if (!card) return;
    const oldLoc = card.loc;
    removeCard(card);
    
    // Update location
    card.loc = destType;
    card.faceUp = true; 
    card.rotated = false;
    card.isHighlighted = false;

    // --- RESET STATS ---
    // Resets dynamic changes back to original values from cards.json
    if (card.type === 'Phantom') {
        const base = allCards.find(c => (c.name || "").toLowerCase() === (card.name || "").toLowerCase());
        if (base) {
            card.level = base.level ?? 1;
            card.attack = base.attack ?? 0;
            card.health = base.health ?? 0;
        }
    }
    
    const ownerList = state[card.owner];
    
    if (destType === 'topdeck') ownerList.deck.push(card);
    else if (destType === 'bottomdeck') ownerList.deck.unshift(card);
    else if (destType === 'randomdeck') {
        const idx = Math.floor(Math.random() * (ownerList.deck.length + 1));
        ownerList.deck.splice(idx, 0, card);
    }
    else {
        if (ownerList[destType]) ownerList[destType].push(card);
    }
    
    updateCounts(card.owner);
    if(destType === 'hand') renderHand(card.owner);
}

function playCardToField(card, type, faceUp = true, rotated = false) {
    removeCard(card);
    card.loc = 'field';
    card.faceUp = faceUp;
    card.rotated = rotated;
    card.summonedThisTurn = true; // For Direct Attack rules
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
    if (!card) return;
    const cardId = card.id;
	
	if (battleState.attackerId === cardId) battleState.attackerId = null;
    if (battleState.targetId === cardId) battleState.targetId = null;

    // We check zones in this specific order:
    // Hand and Field FIRST. Deck and Piles LAST.
    const zones = ['hand', 'field', 'afterlife', 'shadow', 'oblivion', 'deck', 'sideDeck', 'extraDeck'];
    const players = ['player', 'opponent'];

    let found = false;

    players.forEach(p => {
        if (found) return; // Stop searching if found
        
        zones.forEach(z => {
            if (found) return;
            
            const list = state[p][z];
            const idx = list.findIndex(c => c.id === cardId);
            
            if (idx > -1) {
                list.splice(idx, 1);
                // Only update visual deck numbers if we removed from a pile
                if (['deck', 'sideDeck', 'extraDeck', 'afterlife', 'shadow', 'oblivion'].includes(z)) {
                    updateCounts(p);
                }
                found = true;
            }
        });
    });

    // Physically remove the element from the screen
    const el = document.getElementById(cardId);
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
        if (zone) {
            const existingCard = zone.querySelector('.card');
            
            // Check if user is currently dragging an invisible card from here
            const isBeingDragged = existingCard && existingCard.style.opacity === '0';
            
            if (existingCard && !isBeingDragged) {
                existingCard.remove();
            }

            if (isBeingDragged) return;

            // Reset Opacity so the CSS overlay is visible
            zone.style.opacity = '1';

            if (list.length > 0) {
                // PILES: Render real card
                if (['afterlife', 'shadow', 'oblivion'].includes(t)) {
                    const topCard = list[list.length - 1];
                    
                    // Pass 'pile' location to hide stats
                    const cardEl = createCardEl({ ...topCard, loc: 'pile' });
                    
                    // FIX: Use Absolute to prevent "pushing" the count number
                    cardEl.style.position = 'absolute';
                    cardEl.style.top = '0';
                    cardEl.style.left = '0';
                    cardEl.style.zIndex = '5'; 
                    
                    zone.appendChild(cardEl);
                    zone.style.background = ''; // Clear background color
                } 
                // DECKS: Use background colors
                else {
                    const top = list[list.length-1];
                    let color = '#795548'; 
                    if(top.type === 'monster') color = '#d4a017';
                    if(top.type === 'spell') color = '#16a085';
                    if(top.type === 'trap') color = '#c0392b';
                    
                    zone.style.background = color;
                    zone.style.opacity = '0.7';
                }
            } else {
                // Empty state
                if (!['afterlife', 'shadow', 'oblivion'].includes(t)) {
                    zone.style.background = '';
                    zone.style.backgroundColor = 'rgba(255,255,255,0.03)';
                }
            }
        }
    });
}

function draw(amt, owner, deckType = 'deck') {
    const list = state[owner][deckType];
    for(let i=0; i<amt; i++) {
        if (!list || list.length === 0) break;
        
        const card = list.pop();
        state[owner].hand.push(card);
        
        // SYNC: Tell the opponent "I moved a card from my deck to my hand"
        // This ensures THEIR memory of OUR hand stays updated.
        if (isMultiplayer && owner === 'player') {
            sendAction('mill', { 
                owner: 'player', 
                source: deckType, 
                dest: 'hand',
				cardId: card.id				
            });
        }
    }
    updateCounts(owner); 
    renderHand(owner);
}


function drawCard(owner, deckType = 'deck') { draw(1, owner, deckType); }

function drawPhase() {
    const btn = document.querySelector('.phase-btn');
    if (btn) {
        btn.classList.add('pulsing-purple');
        setTimeout(() => btn.classList.remove('pulsing-purple'), 1000);
    }

    // 1. Draw for YOU (Local)
    draw(1, 'player');

    // 2. Draw for the OPPONENT (Local/Solo fix)
    draw(1, 'opponent');

    // 3. Sync: Tell the opponent to do the exact same thing on their screen
    if (isMultiplayer) {
        sendAction('draw_phase_global', {});
        sendAction('button_pulse', { button: 'draw' });
    }
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
            executeAction('adjust_lp', { target: p, amount: amount * dir });

            if (isMultiplayer) {
                sendAction('lp', { player: p, value: state[p].lp });
            }

            // --- ADD THIS FOR LP ANIMATION ---
            // Finds the specific arrow clicked (Up = 1, Down = -1)
            const btn = document.querySelector(`button[onclick*="adjustLP('${p}', ${dir})"]`);
            if (btn) {
                btn.classList.add('golden-pulse');
                setTimeout(() => btn.classList.remove('golden-pulse'), 500);
            }
        }
    }
}

function adjustSP(p, dir) { 
    state[p].sp = Math.max(0, state[p].sp + dir); 
    updateStats(); 
    if (isMultiplayer) sendAction('sp', { player: p, value: state[p].sp });
}

function resetSP(p) { 
    state[p].sp = 4; 
    updateStats(); 
    if (isMultiplayer) sendAction('sp', { player: p, value: state[p].sp });
}

function endTurn() {
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
        btn.classList.add('pulsing');
        setTimeout(() => btn.classList.remove('pulsing'), 3000);
    }

    // Explicitly reset ONLY the local player's SP
    resetSP('player');
    
    // Clear summonedThisTurn for player cards
    state.player.field.forEach(c => c.summonedThisTurn = false);

    if (isMultiplayer) {
        sendAction('button_pulse', { button: 'endturn' });
    }
}

function triggerPulse(selector) {
    const btn = document.querySelector(selector);
    if (btn) {
        btn.classList.add('golden-pulse');
        setTimeout(() => btn.classList.remove('golden-pulse'), 500);
    }
}

function setupLPListeners() {
    ['player', 'opponent'].forEach(p => {
        const el = document.getElementById(`${p}-lp`);
        if (el) {
            // Listen for 'input' to catch typing and arrow clicks immediately
            el.addEventListener('input', (e) => {
                const val = parseInt(e.target.value) || 0;
                state[p].lp = val;
                if (isMultiplayer) sendAction('lp', { player: p, value: val });
            });
        }
    });
}

// Helper to animate buttons
function triggerPulse(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.add('golden-pulse');
    setTimeout(() => btn.classList.remove('golden-pulse'), 500);
}

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
    if (!popup) return;

    // Added the 'kw-close' span here
    popup.innerHTML = `
        <span class="kw-close" onclick="document.getElementById('keyword-popup').classList.add('hidden')">×</span>
        <strong style="color:#3498db; font-size:1.1em;">${exactKey}</strong>
        <br><div style="margin-top:5px; border-top:1px solid #444; padding-top:5px;">${definition}</div>
    `;
    
    popup.classList.remove('hidden');
    
    popup.style.left = (event.pageX + 15) + 'px';
    popup.style.top = (event.pageY - 20) + 'px';

    if (window.kwTimer) clearTimeout(window.kwTimer);
    window.kwTimer = setTimeout(() => {
        popup.classList.add('hidden');
    }, 10000); // Increased to 10s so people have time to read
}

function refreshCard(card) {
    const old = document.getElementById(card.id);
    if(old) old.replaceWith(createCardEl(card));
}

function cloneCard(card) {
    idCounter++;
    const newId = `c-${idCounter}-${Date.now()}`;
    const newCard = { ...card, id: newId };
    
    let parentZoneId = null;

    // 1. If card is on the field, clone it to the same zone
    if (card.loc === 'field') {
        const el = document.getElementById(card.id);
        const parent = el ? el.parentElement : null;
        if (parent && parent.classList.contains('zone')) {
            parentZoneId = parent.id;
            state[card.owner].field.push(newCard);
            parent.appendChild(createCardEl(newCard));
        }
    } 
    // 2. FIX: If cloned from Hand, Deck, or Piles, ALWAYS add the clone to the Hand
    else {
        newCard.loc = 'hand'; // Force location to hand
        state[card.owner].hand.push(newCard);
        renderHand(card.owner);
    }

    if (isMultiplayer) {
        sendAction('clone_sync', { cardData: newCard, toZone: parentZoneId });
    }
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
	const onField = card.loc === 'field';
    const isMyCard = card.owner === 'player';
	
    // --- SECTION 1: ACTION OPTIONS ---
    if (onField && card.faceUp && card.type === 'Phantom') {
        // Battle options at top of field cards
        if (!battleState.attackerId) {
            if (!card.rotated) addMsg('Initiate Attack (B)', 'init-atk');
        } else if (!battleState.targetId) {
            if (card.id !== battleState.attackerId) {
                if (card.owner === 'opponent') addMsg('Target for Attack (B)', 'target-atk');
            } else {
                // Check if direct attack is possible
                const oppPhantoms = state.opponent.field.filter(c => c.type === 'Phantom');
                if (oppPhantoms.length === 0 && !card.summonedThisTurn) {
                    addMsg('Direct Attack (B)', 'direct-atk');
                }
            }
            addMsg('Cancel Attack (N)', 'cancel-atk');
        } else {
            addMsg('Execute Battle (B)', 'execute-battle');
            addMsg('Cancel Attack (N)', 'cancel-atk');
        }
    } else if ((!onField || ['deck', 'sideDeck', 'extraDeck', 'pile'].includes(card.loc)) && (isMyCard || !inHand)) {
        if (card.type === 'Phantom') {
            addMsg('Play in Attack (W)', 'play-atk');
            addMsg('Play in Defense', 'play-def');
            addSep();
            addMsg('Set in Attack', 'set-atk');
            addMsg('Set in Defense', 'set-def');
			addSep();
            addMsg('Special Summon', 'special-atk');
			
        } else if (card.type === 'Spirit' || card.type === 'Counter') {
            addMsg('Play', 'play-spirit');
            addMsg('Set', 'set-spirit');
        } else if (card.type === 'Environment') {
            addMsg('Play Environment', 'play-env');
            addMsg('Set Environment', 'set-env');
        }
    }
	
	   
	addSep();
    // Highlight
    addMsg(inHand && isMyCard ? 'Reveal & Highlight (E)' : 'Highlight (E)', 'highlight');
	addSep();
	
	if (onField) {
        if (card.type === 'Phantom') addMsg('Unsummon (U)', 'unsummon');
    }
	
	addSep();


    // 2. State Options
    if (!inHand) {
        addMsg('Flip (F)', 'flip');
        addMsg('Rotate (R)', 'rotate');
    }
	
	addSep();
    
    // 3. Clone (Hide for Opponent Hand)
    if (isMyCard || !inHand) {
        addMsg('Copy/Clone (C)', 'clone');
    }
	
	// 5. Counters
    if (card.loc === 'field') {
        addMsg('Add Counter', 'add-counter');
        if (card.counter > 0) addMsg('Remove Counter', 'remove-counter');
        addSep();
    }
	
    addSep();

    // 4. Movement
    if (!inHand) addMsg('To Hand (H)', 'hand');
    addMsg('To Deck Top', 'topdeck');
    addMsg('To Deck Bottom', 'bottomdeck');
    addMsg('To Deck Random (P)', 'randomdeck');
    addSep();

    
    // 6. Piles
    addMsg('To Afterlife (D)', 'afterlife');
    addMsg('To Shadow (S)', 'shadow');
    addMsg('To Oblivion (A)', 'oblivion');

    showMenu('ctx-card', e.pageX, e.pageY);
}

function cardAction(act) {
    hideCtx();
    if (!ctxTarget) return;
    const card = ctxTarget;
	
    // --- PLAY / SET OPTIONS ---
    if (act === 'init-atk') {
        battleState.attackerId = card.id;
        refreshCard(card);
        if (isMultiplayer) sendAction('battle_sync', { step: 'init', attackerId: card.id });
    }
    else if (act === 'target-atk') {
        battleState.targetId = card.id;
        refreshCard(card);
        if (isMultiplayer) sendAction('battle_sync', { step: 'target', targetId: card.id });
    }
    else if (act === 'direct-atk') {
        const dmg = card.health > 0 ? card.attack : 0;
        executeAction('adjust_lp', { target: 'opponent', amount: -dmg });
        battleState = { attackerId: null, targetId: null };
        refreshCard(card);
    }
    else if (act === 'cancel-atk') {
        const aId = battleState.attackerId;
        const tId = battleState.targetId;
        battleState = { attackerId: null, targetId: null };
        if (aId) { const c = findCard(aId); if(c) refreshCard(c); }
        if (tId) { const c = findCard(tId); if(c) refreshCard(c); }
        if (isMultiplayer) sendAction('battle_sync', { step: 'cancel' });
    }
    else if (act === 'execute-battle') {
        executeBattleLogic();
    }
    else if (act === 'play-atk') {
        playCardToField(card, card.type, true, false);
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: document.getElementById(card.id).parentElement.id, faceUp: true, rotated: false, fromZone: 'hand' });
    }
    else if (act === 'play-def') {
        playCardToField(card, card.type, true, true);
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: document.getElementById(card.id).parentElement.id, faceUp: true, rotated: true, fromZone: 'hand' });
    }
    else if (act === 'set-atk') {
        playCardToField(card, card.type, false, false);
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: document.getElementById(card.id).parentElement.id, faceUp: false, rotated: false, fromZone: 'hand' });
    }
    else if (act === 'set-def') {
        playCardToField(card, card.type, false, true);
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: document.getElementById(card.id).parentElement.id, faceUp: false, rotated: true, fromZone: 'hand' });
    }
    else if (act === 'play-spirit') {
        let type = (card.type === 'Spirit' || card.type === 'Counter') ? card.type : 'Spirit';
        playCardToField(card, type, true, false);
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: document.getElementById(card.id).parentElement.id, faceUp: true, rotated: false, fromZone: 'hand' });
    }
    else if (act === 'set-spirit') {
        let type = (card.type === 'Spirit' || card.type === 'Counter') ? card.type : 'Spirit';
        playCardToField(card, type, false, false);
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: document.getElementById(card.id).parentElement.id, faceUp: false, rotated: false, fromZone: 'hand' });
    }
    else if (act === 'play-env') {
        playCardToField(card, 'Environment', true, false);
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: 'player-env', faceUp: true, rotated: false, fromZone: 'hand' });
    }
    else if (act === 'set-env') {
        playCardToField(card, 'Environment', false, false);
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: 'player-env', faceUp: false, rotated: false, fromZone: 'hand' });
    }
	
    // State Actions
    else if (act === 'flip') {
        card.faceUp = !card.faceUp;
        refreshCard(card);
        if (isMultiplayer) sendAction('flip', { cardId: card.id, faceUp: card.faceUp });
    }
    else if (act === 'rotate') {
        card.rotated = !card.rotated;
        refreshCard(card);
        if (isMultiplayer) sendAction('rotate', { cardId: card.id, rotated: card.rotated });
    }
    else if (act === 'highlight') toggleHighlight(document.getElementById(card.id)); 
    else if (act === 'clone') {
        cloneCard(card);
    }
	
	else if (act.startsWith('play-') || act.startsWith('set-')) {
        const isSet = act.startsWith('set-');
        const isDef = act.endsWith('-def');
        
        playCardToField(card, card.type, !isSet, isDef);
        
        if (isMultiplayer) {
            const el = document.getElementById(card.id);
            if (el && el.parentElement) {
                sendAction('move', { 
                    cardId: card.id, 
                    toZone: el.parentElement.id, 
                    fromZone: 'hand',
                    faceUp: card.faceUp,    // ADD THIS
                    rotated: card.rotated   // ADD THIS
                }); 
            }
        }
    }
	
	// 1. Handle Unsummon (This fixes the menu button doing nothing)
    if (act === 'unsummon') {
        unsummonPhantom(card);
    }

    // 2. Handle standard Play/Set (Ensure cost check is here)
    else if (act === 'play-atk' || act === 'play-def' || act === 'set-atk' || act === 'set-def') {
        if (!handleSummonCost(card)) return; // Check SP
        const isSet = act.startsWith('set-');
        const isDef = act.endsWith('-def');
        playCardToField(card, card.type, !isSet, isDef);
        
        if (isMultiplayer) {
            const el = document.getElementById(card.id);
            if (el && el.parentElement) {
                sendAction('move', { cardId: card.id, toZone: el.parentElement.id, fromZone: card.loc, faceUp: !isSet, rotated: isDef });
            }
        }
    }

    // 3. Handle Special Summon (Bypasses cost check)
    else if (act === 'special-atk' || act === 'special-def') {
        const isDef = act.endsWith('-def');
        playCardToField(card, card.type, true, isDef); // Always face-up
        
        if (isMultiplayer) {
            const el = document.getElementById(card.id);
            if (el && el.parentElement) {
                sendAction('move', { cardId: card.id, toZone: el.parentElement.id, fromZone: card.loc, faceUp: true, rotated: isDef });
            }
        }
    }
    
    // --- MOVEMENT TO PILES ---
    else if (act === 'hand') {
        moveCardTo(card, 'hand');
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: 'player-hand' });
    }
    else if (act === 'afterlife') {
        moveCardTo(card, 'afterlife');
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: 'player-afterlife' });
    }
    else if (act === 'shadow') {
        moveCardTo(card, 'shadow');
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: 'player-shadow' });
    }
    else if (act === 'oblivion') {
        moveCardTo(card, 'oblivion');
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: 'player-oblivion' });
    }

    // --- MOVEMENT TO DECK ---
    else if (act === 'topdeck') {
        moveCardTo(card, 'topdeck');
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: 'player-deck' });
    }
    else if (act === 'bottomdeck') {
        moveCardTo(card, 'bottomdeck');
        if (isMultiplayer) sendAction('move', { cardId: card.id, toZone: 'player-deck', toBottom: true });
    }
    else if (act === 'randomdeck') {
        const targetZone = `${card.owner}-deck`; 
        moveCardTo(card, 'randomdeck');
        if (isMultiplayer) {
            sendAction('move', { 
                cardId: card.id, 
                toZone: targetZone, 
                random: true 
            });
        }
    }
    
    // Counter Actions
    else if (act === 'add-counter') {
        card.counter = (card.counter || 0) + 1;
        refreshCard(card);
        if (isMultiplayer) sendAction('edit_stat', { cardId: card.id, stat: 'counter', value: card.counter });
    }
    else if (act === 'remove-counter') {
        card.counter = Math.max(0, (card.counter || 0) - 1);
        refreshCard(card);
        if (isMultiplayer) sendAction('edit_stat', { cardId: card.id, stat: 'counter', value: card.counter });
    }
	
	// --- CLONE ---
    else if (act === 'clone') {
        cloneCard(card);
        // Clone internally handles its own sync in your current setup
    }
    
    // Reveal (Toggle)
    else if (act === 'toggle-reveal') { 
        // If your executeAction doesn't have 'reveal_card', use this local + sync logic
        card.revealed = !card.revealed; 
        refreshCard(card);
        if (isMultiplayer) sendAction('edit_stat', { cardId: card.id, stat: 'revealed', value: card.revealed });
    }
	
	else if (act === 'init-atk') {
        battleState.attackerId = card.id;
        refreshCard(card);
        if (isMultiplayer) sendAction('battle_sync', { step: 'init', attackerId: card.id });
    }
    else if (act === 'target-atk') {
        battleState.targetId = card.id;
        refreshCard(card);
        if (isMultiplayer) sendAction('battle_sync', { step: 'target', targetId: card.id });
    }
    else if (act === 'cancel-atk') {
        const aId = battleState.attackerId;
        const tId = battleState.targetId;
        battleState = { attackerId: null, targetId: null };
        if (aId) refreshCard(findCard(aId));
        if (tId) refreshCard(findCard(tId));
        if (isMultiplayer) sendAction('battle_sync', { step: 'cancel' });
    }
    else if (act === 'execute-battle') {
        executeBattleLogic(); // We define this below
    }
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

    // --- 1. SHUFFLE ---
    if (act === 'shuffle') {
        shuffle(list);
        updateCounts(owner);
        alert(`${type} Shuffled!`);
        if (isMultiplayer) sendAction('shuffle_deck_simple', { owner: owner, type: type });
    }

    // --- 2. MILL (Discard top card) ---
    else if (act === 'mill') {
        if (list.length > 0) {
            const c = list.pop();
            state[owner].afterlife.push(c);
            updateCounts(owner);
            if (isMultiplayer) sendAction('mill', { owner: owner, source: type, dest: 'afterlife' });
        }
    }

    // --- 3. DRAW TOP ---
    else if (act === 'draw') {
        draw(1, owner, type);
        // Draw logic inside the draw() function handles its own sync via 'mill'
    }

    // --- 4. DRAW BOTTOM ---
    else if (act === 'draw-bottom') {
        if (list.length > 0) {
            const c = list.shift(); // Pull from index 0
            state[owner].hand.push(c);
            renderHand(owner);
            updateCounts(owner);
            if (isMultiplayer && owner === 'player') {
                sendAction('mill', { owner: 'player', source: type, dest: 'hand', from: 'bottom' });
            }
        }
    }

    // --- 5. DRAW FIRST (Phantom / Spirit / Counter) ---
    else if (act.startsWith('draw-first-')) {
        const targetType = act.replace('draw-first-', ''); // e.g. 'Phantom'
        const idx = list.findIndex(c => c.type === targetType);
        if (idx > -1) {
            const c = list.splice(idx, 1)[0];
            state[owner].hand.push(c);
            renderHand(owner);
            updateCounts(owner);
            if (isMultiplayer && owner === 'player') {
                sendAction('draw_first', { owner: 'player', type: type, targetType: targetType });
            }
        }
    }

    // --- 6. VIEWERS (Local Only) ---
    else if (act === 'search') openViewer(owner, type, true);
    else if (act === 'view') openViewer(owner, type, false);
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
        el.classList.remove('face-down');
        el.draggable = false;

        // Clone the node to strip original listeners
        const newEl = el.cloneNode(true);
        
        // --- FIX 1: RE-ATTACH HOVER TRACKING (For Hotkeys) ---
        newEl.onmouseenter = () => { hoveredId = c.id; };
        newEl.onmouseleave = () => { hoveredId = null; };

        // --- FIX 2: RE-ATTACH RIGHT CLICK (For Context Menu) ---
        newEl.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            hoveredId = c.id; 
            openCardCtx(e, c);
        };

        // 1. Single Click: Show card info
        newEl.onclick = (e) => {
            e.stopPropagation();
            showCardInfo(c);
        };

        // 2. Double Click: Add to hand
        newEl.ondblclick = (e) => {
            e.stopPropagation(); 
            const originalList = state[viewerTarget.owner][viewerTarget.type];
            const idx = originalList.findIndex(card => card.id === c.id);
            if (idx > -1) {
                const movedCard = originalList.splice(idx, 1)[0];
                state[viewerTarget.owner].hand.push(movedCard);
                renderHand(viewerTarget.owner);
                updateCounts(viewerTarget.owner);
                
                if (isMultiplayer) {
                    sendAction('move', { 
                        cardId: movedCard.id, 
                        toZone: `${viewerTarget.owner}-hand`, 
                        fromZone: `${viewerTarget.owner}-${viewerTarget.type}`
                    });
                }
                closeAllModals();
                if (typeof closeCardInfo === 'function') closeCardInfo();
            }
        };

        grid.appendChild(newEl);
    });
}
function filterViewer() { renderViewer(); }
function closeViewer() { document.getElementById('deck-viewer').classList.add('hidden'); }
function showZoom(card) {
    // PREVENT CHEATING:
    // 1. If it's an opponent's card on the field/piles and is Face Down -> Block
    if (card.owner === 'opponent' && !card.faceUp && card.loc !== 'hand') return;
    
    // 2. If it's an opponent's card in Hand and Hand is NOT revealed -> Block
    if (card.owner === 'opponent' && card.loc === 'hand' && !state.opponent.handVisible) return;

    const img = document.getElementById('zoomed-card-img'); 
    img.innerHTML = '';
    const clone = createCardEl({ ...card, faceUp: true, rotated: false }); 
    clone.style.position = 'static';
    img.appendChild(clone); 
    document.getElementById('zoom-overlay').classList.remove('hidden');
}
function triggerPulse(el) {
    if (!el) return;
    el.classList.add('golden-pulse');
    setTimeout(() => el.classList.remove('golden-pulse'), 500);
}
function hideZoom() { 
    document.getElementById('zoom-overlay').classList.add('hidden');
    currentZoomId = null; // Reset tracking so we can zoom again
}
function toggleMenu() { document.getElementById('main-menu').classList.toggle('hidden'); }
function rollDie() { 
    const result = Math.floor(Math.random() * 6) + 1;
    const resEl = document.getElementById('die-result');
    resEl.innerText = result; 
    
    // Visuals
    triggerPulse(document.querySelector('button[onclick="rollDie()"]'));
    setTimeout(() => resEl.innerText = '', 10000); // Disappear after 10s

    if (isMultiplayer) sendAction('die', { value: result });
}
function flipCoin() { 
    const result = Math.random() > 0.5 ? "Heads" : "Tails";
    const resEl = document.getElementById('coin-result');
    resEl.innerText = result; 
    
    // Visuals
    triggerPulse(document.querySelector('button[onclick="flipCoin()"]'));
    setTimeout(() => resEl.innerText = '', 10000); // Disappear after 10s

    if (isMultiplayer) sendAction('coin', { value: result });
}
function toggleOpponentHand() {
    state.opponent.handVisible = !state.opponent.handVisible;
    renderHand('opponent');
    
    // Toggle Red Outline
    const btn = document.querySelector('button[onclick*="toggleOpponentHand"]');
    if (btn) {
        if (state.opponent.handVisible) btn.classList.add('active-red');
        else btn.classList.remove('active-red');
    }
}
function togglePlayerHand() {
    state.player.handVisible = !state.player.handVisible;
    renderHand('player');
    
    // Toggle Red Outline
    const btn = document.querySelector('button[onclick="togglePlayerHand()"]');
    if (btn) btn.classList.toggle('active-red', state.player.handVisible);
    
    if (isMultiplayer) {
        sendAction('hand_visible', { player: 'player', visible: state.player.handVisible });
    }
}

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
    if (card.description) {
        const charCount = card.description.length;
        let fontSize = 22; 
        if (charCount > 120) fontSize = 18;
        if (charCount > 300) fontSize = 15;
        
        const container = document.createElement('div');
        container.className = 'card-info-text-container';
        container.innerHTML = `
            <strong>Ability:</strong>
            <div class="info-divider" style="width: 60%; margin: 5px auto;"></div>
            <div style="font-size: ${fontSize}px; line-height: 1.4; text-align: left;">
                ${injectKeywords(card.description)}
            </div>
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
        if (isMultiplayer) sendAction('edit_stat', { cardId, stat, value: card[stat] });
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
				if (isMultiplayer) {
                    sendAction('load_deck', {
                        main: state.player.deck,
                        side: state.player.sideDeck,
                        extra: state.player.extraDeck
                    });
                }
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
    // We create a unique ID using a timestamp so both players agree on the ID
    const tokenId = `token-${idCounter}-${Date.now()}`;
    
    const token = {
        id: tokenId,
        owner: owner,
        name: 'Token',
        type: 'Phantom',
        level: 0,
        attack: 0,
        health: 0,
        description: 'Generated Token.',
        image: 'Images/Cards/Token Card.png', // Set the specific image here
        faceUp: true,
        rotated: true, // Defense Position
        loc: 'field',
        counter: 0,
        isToken: true
    };
    
    state[owner].field.push(token);
    const prefix = owner;

    // Your existing priority list logic
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

    if (!targetZone) targetZone = document.getElementById(`${prefix}-monster-2`);

    // 1. Update your screen
    targetZone.appendChild(createCardEl(token));

    // 2. Sync: Tell opponent to spawn this exact token in the mirrored zone
    if (isMultiplayer && owner === 'player') {
        sendAction('spawn_token', { 
            tokenData: token, 
            zoneId: targetZone.id 
        });
    }

    // 3. Visual Pulse (Added safely at the end)
    // This finds any button that has "spawnToken" in its click command
    if (owner === 'player') {
        // This targets the button that specifically calls spawnToken for the player
        const btn = document.querySelector("button[onclick*='spawnToken'][onclick*='player']");
        if (btn) {
             btn.classList.add('golden-pulse');
             setTimeout(() => btn.classList.remove('golden-pulse'), 500);
        }
    }
}



// === MULTIPLAYER SYSTEM ===
let socket = null;
let isMultiplayer = false;
let myRole = null; 
let roomCode = null;

const SERVER_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000' 
    : 'https://mytcg.teamdragonmaster.com';

// 1. Unified Connection Logic
function initSocket(callback) {
    if (socket && socket.connected) {
        if (callback) callback();
        return;
    }

    // Use the CDN version of socket.io defined in HTML
    socket = io(SERVER_URL);

    socket.on('connect', () => {
        console.log("Connected to server:", socket.id);
        setupSocketListeners();
        if (callback) callback();
    });

    socket.on('connect_error', (err) => {
        console.error("Connection error:", err);
        alert("Could not connect to multiplayer server.");
    });
}

function sendAction(type, payload) {
    console.log('sendAction called:', type, payload);
    if (!isMultiplayer || !socket) {
        console.log('Blocked - isMultiplayer:', isMultiplayer, 'socket:', !!socket);
        return;
    }
    console.log('Emitting action to server');
    socket.emit('action', { roomCode, type, payload });
}

function executeBattleLogic() {
    const atkCard = findCard(battleState.attackerId);
    const defCard = findCard(battleState.targetId);
    if (!atkCard || !defCard) return;
	
	// 1. Clear the IDs immediately so the hotkey "un-sticks"
    battleState = { attackerId: null, targetId: null };

    // Detect Keywords
    const atkHasBreaker = atkCard.description.includes("Breaker");
    const atkHasBounce = atkCard.description.includes("Bounce");
    const atkHasDestructive = atkCard.description.includes("Destructive");

    // 0 Health Rule: Phantoms with 0 Health deal no damage
    const atkPower = atkCard.health > 0 ? atkCard.attack : 0;
    const defPower = defCard.health > 0 ? defCard.attack : 0;

    // Apply Health Reductions
    defCard.health -= atkPower;
    atkCard.health -= defPower;

    // Battle Damage to LP (Only if target is in Attack Position)
    if (!defCard.rotated && defCard.health < 0) {
        const excess = Math.abs(defCard.health);
        state[defCard.owner].lp -= excess;
    }

    // Capture IDs for sync before cards potentially move
    const aId = atkCard.id;
    const tId = defCard.id;
	battleState = { attackerId: null, targetId: null };
	
	refreshCard(atkCard);
    refreshCard(defCard);
    updateStats();

    // --- KEYWORD & BREAK LOGIC ---

    // 1. Check for Break on Target (Triggered by 0 HP OR Breaker keyword)
    if (defCard.health <= 0 || atkHasBreaker) {
        applyBreak(defCard, atkCard);
    }

    // 2. Check for Bounce (If target is still on field after potential Break/Sturdy)
    if (atkHasBounce && defCard.loc === 'field') {
        moveCardTo(defCard, 'hand');
        if (isMultiplayer) sendAction('move', { cardId: defCard.id, toZone: `${defCard.owner}-hand` });
    }

    // 3. Check for Break on Attacker (Standard behavior if HP drops to 0)
    if (atkCard.health <= 0) {
        applyBreak(atkCard);
    }

    // Clean up Battle State
    battleState = { attackerId: null, targetId: null };
    
    // Final UI Refresh
    refreshCard(atkCard);
    refreshCard(defCard);
    updateStats();

    // Sync Stats for cards still on field
    if (isMultiplayer) {
        sendAction('battle_exec', { 
            atkId: aId, atkH: Math.max(0, atkCard.health), atkR: atkCard.rotated,
            defId: tId, defH: Math.max(0, defCard.health), defR: defCard.rotated,
            defLP: state[defCard.owner].lp
        });
    }
}

function applyBreak(targetCard, sourceCard = null) {
    if (!targetCard || targetCard.loc !== 'field') return;

    const hasSturdy = targetCard.description.includes("Sturdy");
    const sourceHasDestructive = sourceCard && sourceCard.description.includes("Destructive");

    if (hasSturdy) {
        // Sturdy Logic: Stay on field, force 0 HP, flip to defense
        targetCard.health = 0;
        targetCard.rotated = true;
        refreshCard(targetCard);
    } else {
        // Normal Break Logic: Determine destination
        const destination = sourceHasDestructive ? 'oblivion' : 'afterlife';
        const targetOwner = targetCard.owner;
        
        moveCardTo(targetCard, destination);
        
        // Sync the movement to the opponent
        if (isMultiplayer) {
            sendAction('move', { 
                cardId: targetCard.id, 
                toZone: `${targetOwner}-${destination}` 
            });
        }
    }
}

function toggleAutoSP() {
    autoSP = !autoSP;
    const btn = document.getElementById('auto-sp-toggle');
    if (btn) {
        btn.classList.toggle('active-blue', autoSP);
        btn.innerText = autoSP ? "SP: ON" : "SP: OFF";
    }
}

function handleSummonCost(card, isSpecial = false) {
    if (!autoSP || isSpecial || card.type !== 'Phantom') return true;
    
    const cost = parseInt(card.level) || 0;
    if (state.player.sp >= cost) {
        state.player.sp -= cost;
        updateStats();
        if (isMultiplayer) sendAction('sp', { player: 'player', value: state.player.sp });
        return true;
    } else {
        alert(`Not enough SP! (Need ${cost}, have ${state.player.sp})`);
        return false;
    }
}

function unsummonPhantom(card) {
    if (!card || card.loc !== 'field') return;
    
    // Add current level to SP
    const refund = parseInt(card.level) || 0;
    state.player.sp += refund;
    updateStats();
    
    if (isMultiplayer) sendAction('sp', { player: 'player', value: state.player.sp });
    
    // Move specifically to YOUR afterlife (since it was your card on your field)
    moveCardTo(card, 'afterlife');
    if (isMultiplayer) {
        sendAction('move', { 
            cardId: card.id, 
            fromZone: 'field', 
            toZone: 'player-afterlife', 
            owner: 'player' 
        });
    }
}


function applyRemoteAction(action) {
    console.log('applyRemoteAction called:', action);
    const { type, payload } = action;
    
    if (type === 'move') {
        const card = findCard(payload.cardId);
        if (!card) return;
		
		// FIX: Sync Repair Logic
        // If the sender says it came from Hand, but we see it in the Deck...
        // This happens because of shuffle desync. We must SWAP the "Real" card (in deck)
        // with the "Ghost" card (currently in hand).
        if (payload.fromZone && payload.fromZone.includes('hand') && ['deck', 'sideDeck', 'extraDeck'].includes(card.loc)) {
            const owner = card.owner;
            const handList = state[owner].hand;

            // 1. Take a "Ghost" card out of the hand (to maintain hand count)
            // We blindly pop because we don't know which card corresponds to this one in the opponent's view
            if (handList.length > 0) {
                const ghostCard = handList.pop();

                // 2. Put the Ghost card into the Deck (to maintain deck count)
                state[owner][card.loc].push(ghostCard);

                // 3. Now the Deck Count is +1, Hand Count is -1.
                // When we proceed to 'removeCard(card)' below, it will take the Real card out of the deck.
                // Final Result: Deck Count Net Change = 0. Hand Count Net Change = -1. Correct.
            }
        }

		// Use the specified source zone if provided
		if (payload.fromZone) {
			card.loc = payload.fromZone; // Set correct location before removing
		}
		

        // 1. Remove it from wherever it currently is (using our new smarter function)
        removeCard(card);
		
		if (payload.faceUp !== undefined) card.faceUp = payload.faceUp;
        if (payload.rotated !== undefined) card.rotated = payload.rotated;
		
		if (payload.faceUp !== undefined) card.faceUp = payload.faceUp;
        
        // 2. Flip the zone ID (player-afterlife -> opponent-afterlife)
        const targetId = flipZoneId(payload.toZone);
        const zone = document.getElementById(targetId);
        if (!zone) return;

        // 3. Determine the NEW owner relative to the local screen
        const newOwner = targetId.includes('player') ? 'player' : 'opponent';
        card.owner = newOwner; // Update the card's internal owner

        // 4. Place the card in the correct list
        if (zone.classList.contains('hand-area')) {
            card.loc = 'hand';
            state[newOwner].hand.push(card);
            renderHand(newOwner);
        } else if (zone.dataset.type) {
            // It's a pile (Deck, Afterlife, etc)
            const pileType = zone.dataset.type;
            const destList = state[newOwner][pileType];

            // FIX: Handle random insertion for the opponent
            if (payload.random) {
                const idx = Math.floor(Math.random() * (destList.length + 1));
                destList.splice(idx, 0, card);
            } else {
                destList.push(card);
            }
            
            updateCounts(newOwner);
        } else {
            // It's a field zone
            card.loc = 'field';
            state[newOwner].field.push(card);
            zone.appendChild(createCardEl(card));
        }
    }

    
    if (type === 'flip') {
        const card = findCard(payload.cardId);
        console.log('Flip - found card:', card, 'new faceUp:', payload.faceUp);
        if (card) {
            card.faceUp = payload.faceUp;
            refreshCard(card);
            console.log('Card flipped');
        }
    }
    
    if (type === 'rotate') {
        const card = findCard(payload.cardId);
        console.log('Rotate - found card:', card, 'new rotated:', payload.rotated);
        if (card) {
            card.rotated = payload.rotated;
            refreshCard(card);
            console.log('Card rotated');
        }
    }
	if (type === 'edit_stat') {
		const card = findCard(payload.cardId);
		if (card) {
			card[payload.stat] = payload.value;
			refreshCard(card);
		}
	}
	if (type === 'lp') {
        const target = flipZoneId(payload.player); 
        state[target].lp = payload.value;
        updateStats(); // Updates the visual input box
		triggerPulse(`button[onclick*="adjustLP('${target}', ${direction})"]`);
        return; // Exit after successful update
    }
	if (type === 'sp') {
        const target = flipZoneId(payload.player);
		const direction = payload.value > state[target].lp ? 1 : -1;
        state[target].sp = payload.value;
        updateStats(); // Updates the visual cyan numbers/pips
        return;
    }
	
	// --- HAND VISIBILITY ---
    if (type === 'hand_visible') {
        const target = flipZoneId(payload.player);
        state[target].handVisible = payload.visible;
        renderHand(target);
    }

    // --- HIGHLIGHT ---
    if (type === 'highlight') {
        const card = findCard(payload.cardId);
        if (card) {
            if (payload.highlighted) {
                card.isHighlighted = true;
                if (card.loc === 'hand' && card.owner === 'opponent') {
                    card.revealed = true;
                }
                refreshCard(card);

                // Setup the same auto-cleanup timer
                setTimeout(() => {
                    card.isHighlighted = false;
                    if (card.loc === 'hand' && card.owner === 'opponent') {
                        card.revealed = false;
                    }
                    refreshCard(card);
                }, 2000);
            } else {
                card.isHighlighted = false;
                if (card.loc === 'hand' && card.owner === 'opponent') {
                    card.revealed = false;
                }
                refreshCard(card);
            }
        }
    }

    // --- CLONE ---
    if (type === 'clone_sync') {
        const newCard = payload.cardData;
        newCard.owner = flipZoneId(newCard.owner);
        
        if (payload.toZone) {
            const zoneId = flipZoneId(payload.toZone);
            state[newCard.owner].field.push(newCard);
            document.getElementById(zoneId).appendChild(createCardEl(newCard));
        } else {
            state[newCard.owner].hand.push(newCard);
            renderHand(newCard.owner); // Hand sync for clones
        }
    }
	
	
	if (type === 'battle_sync') {
        if (payload.step === 'init') {
            battleState.attackerId = payload.attackerId; // Do NOT flip card IDs
            const card = findCard(battleState.attackerId);
            if (card) refreshCard(card);
        } else if (payload.step === 'target') {
            battleState.targetId = payload.targetId; // Do NOT flip card IDs
            const card = findCard(battleState.targetId);
            if (card) refreshCard(card);
        } else if (payload.step === 'cancel') {
            const aId = battleState.attackerId;
            const tId = battleState.targetId;
            battleState = { attackerId: null, targetId: null };
            if (aId) refreshCard(findCard(aId));
            if (tId) refreshCard(findCard(tId));
        }
    }

    if (type === 'battle_exec') {
        const atk = findCard(payload.atkId);
        const def = findCard(payload.defId);

        // 1. Clear the IDs FIRST so that the upcoming refreshCard calls 
        // will see battleState is null and remove the classes.
        const oldAtkId = battleState.attackerId;
        const oldTgtId = battleState.targetId;
        battleState = { attackerId: null, targetId: null };

        // 2. Update stats and refresh participants
        if (atk) { 
            atk.health = payload.atkH; 
            atk.rotated = payload.atkR; 
            refreshCard(atk); 
        }
        if (def) { 
            def.health = payload.defH; 
            def.rotated = payload.defR; 
            state[def.owner].lp = payload.defLP; 
            refreshCard(def); 
        }

        // 3. Cleanup safety: refresh original IDs if they differ from the ones provided
        if (oldAtkId && oldAtkId !== payload.atkId) { const c = findCard(oldAtkId); if(c) refreshCard(c); }
        if (oldTgtId && oldTgtId !== payload.defId) { const c = findCard(oldTgtId); if(c) refreshCard(c); }

        updateStats();
    }

    // --- BUTTON PULSE ---
    if (type === 'button_pulse') {
        let btn = null;
        if (payload.button === 'draw') btn = document.querySelector('.phase-btn');
        if (payload.button === 'endturn') btn = document.getElementById('end-turn-btn');
        
        if (btn) {
            const cls = (payload.button === 'draw') ? 'pulsing-purple' : 'pulsing';
            btn.classList.add(cls);
            setTimeout(() => btn.classList.remove(cls), (payload.button === 'draw' ? 1000 : 3000));
        }
    }
	
	
    if (type === 'spawn_token') {
        const token = payload.tokenData;
        const originalZoneId = payload.zoneId;

        // 1. Perspective Flip: Their 'player' is our 'opponent'
        token.owner = flipZoneId(token.owner);
        const targetZoneId = flipZoneId(originalZoneId);

        // 2. Update State memory
        state[token.owner].field.push(token);

        // 3. Update Visuals
        const zone = document.getElementById(targetZoneId);
        if (zone) {
            zone.appendChild(createCardEl(token));
        }
        
        // SIMPLE FIX: Trigger pulse directly on the opponent's button when receiving the spawn
        triggerPulse("button[onclick*='spawnToken'][onclick*='opponent']");
        
        console.log("Token spawned by opponent in zone:", targetZoneId);
    }
	
	if (type === 'die') {
        const el = document.getElementById('die-result');
        if (el) {
            el.innerText = payload.value;
            // Pulse the die button on the receiver's screen
            triggerPulse('button[onclick*="rollDie"]');
            // Clear result after 10s
            setTimeout(() => el.innerText = '', 10000);
        }
        return;
    }

    if (type === 'coin') {
        const el = document.getElementById('coin-result');
        if (el) {
            el.innerText = payload.value;
            // Pulse the coin button on the receiver's screen
            triggerPulse('button[onclick*="flipCoin"]');
            // Clear result after 10s
            setTimeout(() => el.innerText = '', 10000);
        }
        return;
    }
	
    if (type === 'draw_phase_global') {
        // Opponent triggered a global draw, so we update both sides here too
        draw(1, 'player');
        draw(1, 'opponent');
    }
	
	if (type === 'remove_card_absolute') {
		const card = findCard(payload.cardId);
		if (card) removeCard(card);
	}

	if (type === 'shuffle_deck_simple') {
		const target = flipZoneId(payload.owner);
		shuffle(state[target].deck);
		updateCounts(target);
		console.log("Opponent shuffled their deck");
	}
	if (type === 'mill') {
        const targetOwner = flipZoneId(payload.owner);
        const sourceList = state[targetOwner][payload.source];
	        
        // Pull the card from the source (Deck)
        let card = null;

		// Search for the exact card ID to prevent desyncs
		if (payload.cardId) {
			const idx = sourceList.findIndex(c => c.id === payload.cardId);
			if (idx > -1) {
				card = sourceList.splice(idx, 1)[0];
			}
		}

		// Fallback just in case
		if (!card) {
			card = (payload.from === 'bottom') ? sourceList.shift() : sourceList.pop();
		}
        
        if (card) {
            if (payload.dest === 'hand') {
                // IMPORTANT: Put the card in the Hand list in memory
                card.loc = 'hand';
                state[targetOwner].hand.push(card);
                renderHand(targetOwner); // Redraw the hand (as card backs)
            } else {
                // Move to Grave/Shadow/etc.
                state[targetOwner][payload.dest].push(card);
            }
            // Update the deck numbers
            updateCounts(targetOwner);
        }
        return;
    }
	if (type === 'load_deck') {
    state.opponent.deck = payload.main.map(c => ({...c, owner: 'opponent'}));
    state.opponent.sideDeck = payload.side.map(c => ({...c, owner: 'opponent'}));
    state.opponent.extraDeck = payload.extra.map(c => ({...c, owner: 'opponent'}));
    updateCounts('opponent');
    alert('Opponent loaded new deck');
	}
}

function setupSocketListeners() {
    // Only set these up once
    socket.off('room_created');
    socket.off('room_joined');
    socket.off('opponent_joined');
    socket.off('game_action');
    socket.off('error_msg');

    socket.on('room_created', (data) => {
        roomCode = data.roomCode;
        myRole = 'host';
        isMultiplayer = true;
        const statusEl = document.getElementById('room-status');
        if (statusEl) statusEl.innerText = `Room Code: ${roomCode}\nWaiting for opponent...`;
    });

    socket.on('room_joined', (data) => {
		roomCode = data.roomCode;
		myRole = 'guest';
		isMultiplayer = true;
		closeMultiplayerMenu();
		// DON'T start game yet - wait for deck IDs
	});

    socket.on('opponent_joined', () => {
        console.log("Opponent joined!");
        closeMultiplayerMenu();

        // Host sends deck IDs FIRST
        if (myRole === 'host') {
            const deckData = {
                player: { deck: state.player.deck, sideDeck: state.player.sideDeck, extraDeck: state.player.extraDeck },
                opponent: { deck: state.opponent.deck, sideDeck: state.opponent.sideDeck, extraDeck: state.opponent.extraDeck }
            };
            socket.emit('sync_deck_ids', deckData);

            // Host resets immediately (clears board), but DOES NOT DRAW yet.
            // We removed the setTimeout. We wait for the Guest to trigger the draw via 'game_start_sync'.
            startGame(false);
        }
    });

    socket.on('game_action', (data) => {
        console.log("Received remote action:", data.type);
        executeAction(data.type, data.payload, true);
    });

    socket.on('error_msg', (data) => {
        alert(data.message);
    });
	
	socket.on('receive_deck_ids', (deckData) => {
		state.player.deck = deckData.opponent.deck.map(c => ({...c, owner: 'player'}));
		state.player.sideDeck = deckData.opponent.sideDeck.map(c => ({...c, owner: 'player'}));
		state.player.extraDeck = deckData.opponent.extraDeck.map(c => ({...c, owner: 'player'}));
		state.opponent.deck = deckData.player.deck.map(c => ({...c, owner: 'opponent'}));
		state.opponent.sideDeck = deckData.player.sideDeck.map(c => ({...c, owner: 'opponent'}));
		state.opponent.extraDeck = deckData.player.extraDeck.map(c => ({...c, owner: 'opponent'}));
		updateCounts('player');
		updateCounts('opponent');
		startGame(); // NOW start
		console.log('Deck IDs synced');
	});
	socket.on('action_apply', (action) => {
        if (action.sender === socket.id) return;
        applyRemoteAction(action);
    });
}

// 2. Fixed Button Actions
function createRoom() {
    initSocket(() => {
        socket.emit('create_room');
    });
}

function joinRoom() {
    const codeInput = document.getElementById('room-code-input');
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return alert("Enter a Room Code!");
    
    initSocket(() => {
        socket.emit('join_room', code);
    });
}

function openMultiplayerMenu() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('multiplayer-menu').classList.remove('hidden');
}

function closeMultiplayerMenu() {
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
}

// Helper to swap IDs for remote actions
function flipZoneId(id) {
    if (!id) return id;
    if (id.includes('player')) return id.replace('player', 'opponent');
    if (id.includes('opponent')) return id.replace('opponent', 'player');
    return id;
}

/**
 * The Central Action Handler
 */
function executeAction(type, payload, isRemote = false) {
    // 1. If we performed the action locally, send it to the other player
    if (!isRemote && isMultiplayer && socket) {
        socket.emit('game_action', { roomCode: roomCode, type: type, payload: payload });
    }

    // 2. The Central Switch (One single switch for everything)
    switch (type) {

        case 'draw_phase':
            draw(1, 'player');
            draw(1, 'opponent');
            break;

        case 'adjust_lp':
            let lpTarget = payload.target;
            if (isRemote) lpTarget = flipZoneId(lpTarget); 
            state[lpTarget].lp += payload.amount;
            updateStats();
            break;

        case 'move_card':
            let targetId = payload.targetId;
            if (isRemote) targetId = flipZoneId(targetId);
            
            const mCard = findCard(payload.cardId);
            if (!mCard) break;

            removeCard(mCard);
            
            // --- STATE LOGIC ---
            const isPileTarget = ['deck', 'sideDeck', 'extraDeck', 'afterlife', 'shadow', 'oblivion'].some(t => targetId.includes(t));

            if (isPileTarget) {
                // Reset state when going into Decks or Discard Piles
                mCard.rotated = false;
                mCard.faceUp = true; 
            } else {
                // Moving between Hand and Field: 
                // Use payload values if they exist (from right-click menu), 
                // otherwise keep whatever the card currently has.
                if (payload.faceUp !== undefined) mCard.faceUp = payload.faceUp;
                if (payload.rotated !== undefined) mCard.rotated = payload.rotated;
            }
            
            let newOwner = targetId.includes('opponent') ? 'opponent' : 'player';
            mCard.owner = newOwner;

            if (targetId.includes('hand')) {
                mCard.loc = 'hand';
                state[newOwner].hand.push(mCard);
                renderHand(newOwner);
            } 
            else if (isPileTarget) {
                // Determine specific pile type
                let pileType = 'deck';
                if (targetId.includes('sideDeck')) pileType = 'sideDeck';
                if (targetId.includes('extraDeck')) pileType = 'extraDeck';
                if (targetId.includes('afterlife')) pileType = 'afterlife';
                if (targetId.includes('shadow')) pileType = 'shadow';
                if (targetId.includes('oblivion')) pileType = 'oblivion';

                const destList = state[newOwner][pileType];
                
                if (payload.toBottom) destList.unshift(mCard);
                else if (payload.random) {
                    const idx = Math.floor(Math.random() * (destList.length + 1));
                    destList.splice(idx, 0, mCard);
                } else {
                    destList.push(mCard); 
                }
                updateCounts(newOwner);
            } else {
                // Field Move
                if (mCard.loc !== 'field') mCard.summonedThisTurn = true;
                mCard.loc = 'field';
                state[newOwner].field.push(mCard);
                const zone = document.getElementById(targetId);
                if (zone) zone.appendChild(createCardEl(mCard));
            }
            break;

        case 'draw_single':
            let dsOwner = payload.owner;
            if (isRemote) dsOwner = flipZoneId(dsOwner);
            
            const list = state[dsOwner][payload.type];
            if (!list || list.length === 0) break;

            let drawnCard = null;
            if (payload.from === 'bottom') {
                drawnCard = list.shift(); // Pull from index 0
            } else if (payload.firstType) {
                const idx = list.findIndex(c => c.type === payload.firstType);
                if (idx > -1) drawnCard = list.splice(idx, 1)[0];
            } else {
                drawnCard = list.pop(); // Normal top draw
            }

            if (drawnCard) {
                state[dsOwner].hand.push(drawnCard);
                renderHand(dsOwner);
                updateCounts(dsOwner);
            }
            break;

        case 'flip_card':
            const fCard = findCard(payload.cardId);
            if (fCard) {
                fCard.faceUp = !fCard.faceUp;
                refreshCard(fCard);
            }
            break;
            
        case 'rotate_card':
            const rCard = findCard(payload.cardId);
            if (rCard) {
                rCard.rotated = !rCard.rotated;
                refreshCard(rCard);
            }
            break;
            
        case 'add_counter':
            const acCard = findCard(payload.cardId);
            if (acCard) {
                acCard.counter = (acCard.counter || 0) + 1;
                refreshCard(acCard);
            }
            break;
            
        case 'remove_counter':
            const rcCard = findCard(payload.cardId);
            if (rcCard && rcCard.counter > 0) {
                rcCard.counter--;
                refreshCard(rcCard);
            }
            break;
		
		case 'add_counter':
            if (card) { card.counter = (card.counter || 0) + 1; refreshCard(card); }
            break;

        case 'remove_counter':
            if (card && card.counter > 0) { card.counter--; refreshCard(card); }
            break;

        case 'clone_card':
            if (card) {
                const newId = payload.newId || `clone-${Date.now()}`;
                const newCard = { ...card, id: newId };
                state[card.owner].field.push(newCard);
                const parent = document.getElementById(card.id)?.parentElement;
                if (parent) parent.appendChild(createCardEl(newCard));
                // If local, send the specific ID we generated to the opponent
                if (!isRemote) sendAction('clone_card', { cardId: card.id, newId: newId });
            }
            break;
            
        case 'play_card':
            const pCard = findCard(payload.cardId);
            if (!pCard) break;
            
            removeCard(pCard);
            pCard.loc = 'field';
            pCard.faceUp = !payload.set;
            pCard.rotated = payload.defense || false;
            
            // Determine owner and prefix (Flipped if remote)
            let pOwner = pCard.owner;
            if (isRemote) pOwner = flipZoneId(pOwner);
            pCard.owner = pOwner;

            state[pOwner].field.push(pCard);
            
            const prefix = pOwner;
            let pTargetZone = null;
            let htmlType = (payload.zone === 'spell') ? 'spell' : 'monster';
            
            if (payload.zone === 'environment') {
                pTargetZone = document.getElementById(`${prefix}-env`);
            } else {
                // Try slots 2, then 1, then 3
                for (let i of [2, 1, 3]) {
                    const z = document.getElementById(`${prefix}-${htmlType}-${i}`);
                    if (z && z.children.length === 0) { pTargetZone = z; break; }
                }
                // Fallback to balance zones
                if (!pTargetZone) {
                    for (let b of [1, 2]) {
                        const z = document.getElementById(`${prefix}-balance-${b}`);
                        if (z && z.children.length === 0) { pTargetZone = z; break; }
                    }
                }
            }
            
            if (pTargetZone) pTargetZone.appendChild(createCardEl(pCard));
            break;

        case 'shuffle_deck':
            let shOwner = payload.owner;
            if (isRemote) shOwner = flipZoneId(shOwner);
            shuffle(state[shOwner][payload.type]);
            updateCounts(shOwner);
            // Optional: alert('Opponent Shuffled their ' + payload.type);
            break;
		
		case 'mill_top':
            let mOwner = payload.owner;
            if (isRemote) mOwner = flipZoneId(mOwner);
            const milled = state[mOwner][payload.type].pop();
            if (milled) {
                state[mOwner][payload.dest].push(milled);
                updateCounts(mOwner);
            }
            break;

        // --- These cases handle the UI syncs we discussed earlier ---
        case 'hand_visible':
            let hvOwner = payload.player;
            if (isRemote) hvOwner = flipZoneId(hvOwner);
            state[hvOwner].handVisible = payload.visible;
            renderHand(hvOwner);
            break;

        case 'button_pulse':
            let btnId = (payload.button === 'draw') ? '.phase-btn' : '#end-turn-btn';
            let btnEl = document.querySelector(btnId);
            if (btnEl) {
                let cls = (payload.button === 'draw') ? 'pulsing-purple' : 'pulsing';
                btnEl.classList.add(cls);
                setTimeout(() => btnEl.classList.remove(cls), 2000);
            }
            break;
		
    }
}