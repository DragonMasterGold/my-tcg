let allCards = [];
let cardImages = {};
let keywordRepo = {};
let battleState = { attackerId: null, targetId: null };
let abilityState = { sourceId: null, targetId: null, type: null, step: 'idle' };
let autoSP = true;
let autoDraw = true;
let hostGoesFirst = true;

function toggleAutoDraw() {
    autoDraw = !autoDraw;
    const btn = document.getElementById('auto-draw-toggle');
    if (btn) {
        btn.classList.toggle('active-blue', autoDraw);
        btn.innerText = autoDraw ? "Auto Draw" : "Auto Draw";
    }
}

function checkAutoDraw() {
    // Only the host triggers this to prevent double-firing events
    if (isMultiplayer && myRole !== 'host') return;
    
    // Trigger in the middle of the round (Transitioning from Odd -> Even)
    // globalTurn has just incremented. So if globalTurn is Even (2, 4, 6), we just finished an Odd turn.
    if (autoDraw && globalTurn % 2 === 0) {
        setTimeout(() => drawPhase(), 800);
    }
}

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
            const customUi = document.getElementById('custom-ui-modal');

            if (customUi && !customUi.classList.contains('hidden')) {
                if (typeof cancelAbility === 'function') cancelAbility();
            }
            else if (kwPopup && !kwPopup.classList.contains('hidden')) {
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
        
        // FIX: Add this specific check for the Ability Menu background
        if (e.target.id === 'custom-ui-modal') cancelAbility();
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
                        card.loc = type; // Reset loc back to deck/sideDeck so it doesn't think it's on the field!
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
	if (k === 'escape') {
        cancelAbility();
        return;
    }
	
	// 1. --- GLOBAL HOTKEYS ---
    if (k === 'n') {
        const aId = battleState.attackerId;
        const tId = battleState.targetId;
        battleState = { attackerId: null, targetId: null };
        if (aId) { const c = findCard(aId); if(c) refreshCard(c); }
        if (tId) { const c = findCard(tId); if(c) refreshCard(c); }
        if (isMultiplayer) sendAction('battle_sync', { step: 'cancel' });
        
        // Cancel Ability State with N ---
        cancelAbility();
        return;
    }
    if (k === 'i') { openViewer('player', 'deck', true); return; }	

    // STEP 3: Execute Battle (Global Check)
    // If both IDs are set, pressing B executes. If it targets itself, it's a Direct Attack.
    if (k === 'b' && battleState.attackerId && battleState.targetId) {
        if (battleState.attackerId === battleState.targetId) {
            executeDirectAttack(battleState.attackerId);
        } else {
            executeBattleLogic();
        }
        return;
    }

     // 2. --- DYNAMIC HOVER CHECK ---
    const hoveredEl = document.querySelector('.card:hover') || 
                      document.querySelector('.card *:hover')?.closest('.card');
    
    if (hoveredEl) {
        const card = findCard(hoveredEl.id);
        if (!card) return;

        // --- NEW: Hover Stat Adjustments (+ / -) ---
        if (k === '+' || k === '=' || k === '-' || k === '_') {
            const sign = (k === '+' || k === '=') ? 1 : -1;
            
            // Find the deepest element currently being hovered
            const hoveredNodes = document.querySelectorAll(':hover');
            const deepestHover = hoveredNodes[hoveredNodes.length - 1];

            if (deepestHover) {
                let statToChange = null;
                let amount = 1 * sign; // Default to 1

                if (deepestHover.classList.contains('atk')) { statToChange = 'attack'; amount = 100 * sign; }
                else if (deepestHover.classList.contains('hp')) { statToChange = 'health'; amount = 100 * sign; }
                else if (deepestHover.classList.contains('level-stat')) { statToChange = 'level'; }
                else if (deepestHover.classList.contains('ap-counter')) { statToChange = 'ap'; }
                else if (deepestHover.classList.contains('token-counter')) { statToChange = 'token'; }
                else if (deepestHover.classList.contains('marker-counter')) { statToChange = 'marker'; }
                else if (deepestHover.classList.contains('turncounter-counter')) { statToChange = 'turncounter'; }
                else if (deepestHover.classList.contains('counter-bubble')) { statToChange = 'counter'; }

                if (statToChange) {
                    // Apply math, preventing stats from dropping below zero
                    card[statToChange] = Math.max(0, (card[statToChange] || 0) + amount);
                    refreshCard(card);
                    
                    if (isMultiplayer) {
                        sendAction('edit_stat', { cardId: card.id, stat: statToChange, value: card[statToChange] });
                    }
                    
                    // If the Info Panel is currently open and viewing this card, update it live!
                    const infoPanel = document.getElementById('card-info-panel');
                    const infoName = document.getElementById('card-info-name');
                    if (!infoPanel.classList.contains('hidden') && infoName && infoName.innerText === card.name) {
                        showCardInfo(card);
                    }
                    return; // Action completed, stop processing other hotkeys
                }
            }
        }

        if (k === 'b') {
            if (card.type !== 'Phantom') return;

            if (!battleState.attackerId) {
                if (card.owner === 'player' && !card.rotated && card.faceUp) {
                    battleState.attackerId = card.id;
                    refreshCard(card);
                    if (isMultiplayer) sendAction('battle_sync', { step: 'init', attackerId: card.id });
                }
            } else if (!battleState.targetId) {
                // Step 2: Set Target (Opponent's card)
                if (card.owner === 'opponent' && card.id !== battleState.attackerId) {
                    // --- TAUNTER CHECK ---
                    const taunters = state.opponent.field.filter(c => c.type === 'Phantom' && c.faceUp && (c.description || "").includes('Taunter'));
                    if (taunters.length > 0 && !(card.description || "").includes('Taunter')) {
                        alert("You must target a Phantom with Taunter!");
                        return;
                    }
                    battleState.targetId = card.id;
                    refreshCard(card);
                    if (isMultiplayer) sendAction('battle_sync', { step: 'target', targetId: card.id });
                } 
                // Step 2 Alternative: Initiate Direct Attack
                else if (card.owner === 'player' && card.id === battleState.attackerId) {
                    // FIX: Strict check for Face-Up phantoms that are actually on the field
                    const oppPhantoms = state.opponent.field.filter(c => c.type === 'Phantom' && c.loc === 'field');
                    if (oppPhantoms.length > 0) {
                        alert("Cannot Direct Attack while opponent has Phantoms!");
                        return;
                    }
                    // --- RUSH CHECK ---
                    const hasRush = (card.description || "").includes('Rush');
                    if (card.summonedThisTurn && !hasRush) {
                        alert("Phantoms cannot Direct Attack the turn they are summoned unless they have Rush!");
                        return;
                    }
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
		
		// V - ABILITY HOTKEY
        if (k === 'v') {
            if (abilityState.step === 'idle' && card.owner === 'player') {
                // Step 1: Open Menu (Allow Field, Hand, and Piles)
                const validLocs =['field', 'hand', 'afterlife', 'shadow', 'oblivion'];
                if (validLocs.includes(card.loc)) {
                    openAbilityMenu(card);
                }
            } 
            else if (abilityState.step === 'targeting') {
                // Step 2: Set Target (Removed restriction so cards can target themselves)
                abilityState.targetId = card.id;
                abilityState.step = 'confirm';
                refreshCard(card);
                if (isMultiplayer) sendAction('ability_sync', abilityState);
            }
            else if (abilityState.step === 'confirm' && card.id === abilityState.targetId) {
                // Step 3: Execute Action (Pressing V on the target again confirms it)
                executeAbility();
            }
            return;
        }
		
		// D - Afterlife
        if (k === 'd') {
            const originalLoc = card.loc;
            moveCardTo(card, 'afterlife');
            if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-afterlife`, owner: card.owner });
        }
        // S - Shadow
        if (k === 's') {
            const originalLoc = card.loc;
            moveCardTo(card, 'shadow');
            if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-shadow`, owner: card.owner });
        }
        // A - Oblivion
        if (k === 'a') {
            const originalLoc = card.loc;
            moveCardTo(card, 'oblivion');
            if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-oblivion`, owner: card.owner });
        }
        // H - Hand
        if (k === 'h') {
            const originalLoc = card.loc;
            moveCardTo(card, 'hand');
            if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-hand`, owner: card.owner });
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

// Added 'isRemote' so we don't get stuck in an infinite loop
function startGame(isRemote = false) {
    document.querySelectorAll('.card').forEach(c => c.remove());
    
    ['player', 'opponent'].forEach(p => {
        // Gather literally every card on this player's side
        const allCards = [
            ...state[p].hand, ...state[p].field, ...state[p].afterlife, 
            ...state[p].shadow, ...state[p].oblivion, ...state[p].deck, 
            ...state[p].sideDeck, ...state[p].extraDeck
        ];
        
        // Clear all zones completely
        state[p].hand = [];
        state[p].deck = [];
        state[p].sideDeck = [];
        state[p].extraDeck = [];
        state[p].afterlife = [];
        state[p].shadow = [];
        state[p].oblivion = [];
        state[p].field = [];
        state[p].lp = 10000;
        state[p].sp = 4;
        if (p === 'opponent') state[p].handVisible = false;
        
        // Return cards to their specific original decks
        allCards.forEach(card => {
            card.faceUp = true;
            card.rotated = false;
            card.loc = card.originalZone || 'deck'; 
            card.owner = card.originalOwner || p;
            
            if (card.loc === 'sideDeck') state[p].sideDeck.push(card);
            else if (card.loc === 'extraDeck') state[p].extraDeck.push(card);
            else state[p].deck.push(card); 
        });
        
        // IMPORTANT: Only shuffle YOUR OWN deck to prevent RNG desyncs.
        if (p === 'player') {
            shuffle(state[p].deck);
        }
        updateCounts(p);
    });
    
	globalTurn = 1;
    currentRound = 1;
    
    // --- FIRST OR SECOND LOGIC ---
    if (!isRemote) {
        const userWantsFirst = confirm("Do you want to go First?\n(OK = First, Cancel = Second)");
        
        // If I am Host: userWantsFirst=true -> hostGoesFirst=true
        // If I am Guest: userWantsFirst=true -> hostGoesFirst=false (Guest goes first)
        hostGoesFirst = (myRole === 'guest') ? !userWantsFirst : userWantsFirst;

        if (isMultiplayer) sendAction('set_first', { hostGoesFirst });
    }

    updateTurnVisuals();
    updateStats();
    closeAllModals();

    // 1. Tell opponent to run this exact same clean reset
    if (!isRemote && isMultiplayer) sendAction('game_start_global', {});

    // 2. Draw 5 cards for YOURSELF. The draw() function automatically 
    // syncs these draws to the opponent so they can see your hand.
    draw(5, 'player');
    
    // 3. If playing offline/solo, simulate the opponent drawing too
    if (!isMultiplayer) {
        shuffle(state.opponent.deck);
        draw(5, 'opponent');
    }
}


function resetGame(isRemote = false) {
    document.querySelectorAll('.card').forEach(c => c.remove());
    ['player', 'opponent'].forEach(p => {
        state[p] = { lp: 10000, sp: 4, hand: [], deck: [], sideDeck: [], extraDeck: [], afterlife: [], shadow: [], oblivion: [], field: [] };
        if (p === 'opponent') state[p].handVisible = false;
        updateCounts(p);
    });
    updateStats();
    document.getElementById('end-turn-btn').classList.remove('pulsing');
    
    if (!isRemote && isMultiplayer) sendAction('game_reset_global', {});
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
		originalOwner: owner,
		originalZone: loc,
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
	if (data.id === abilityState.sourceId) el.classList.add('ability-source');
	if (data.id === abilityState.targetId) el.classList.add('ability-target');
    
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

    // === COUNTERS CONTAINER ===
    const counters = [];
    if (data.token > 0) counters.push({ type: 'token', value: data.token });
    if (data.marker > 0) counters.push({ type: 'marker', value: data.marker });
    if (data.turncounter > 0) counters.push({ type: 'turncounter', value: data.turncounter });

    if (counters.length > 0) {
        const countersContainer = document.createElement('div');
        countersContainer.className = 'counters-container';
        // Ensure container fills the card and centers its children
        countersContainer.style.position = 'absolute';
        countersContainer.style.top = '0';
        countersContainer.style.left = '0';
        countersContainer.style.width = '100%';
        countersContainer.style.height = '100%';
        countersContainer.style.pointerEvents = 'none';
        
        counters.forEach((counter, index) => {
            const el = document.createElement('div');
            el.className = `counter-base ${counter.type}-counter`;
            el.innerText = counter.value;
            el.style.position = 'absolute';
            
            // Positioning Logic (Your working math)
            if (counters.length === 1) {
                el.style.width = '4vh'; el.style.height = '4vh'; el.style.fontSize = '2.5vh';
                el.style.left = '50%'; el.style.top = '50%'; el.style.transform = 'translate(-50%, -50%)';
            } else if (counters.length === 2) {
                el.style.width = '3vh'; el.style.height = '3vh'; el.style.fontSize = '2vh';
                el.style.top = '50%'; el.style.transform = 'translate(-50%, -50%)';
                el.style.left = index === 0 ? '35%' : '65%';
            } else {
                el.style.width = '2.5vh'; el.style.height = '2.5vh'; el.style.fontSize = '1.5vh';
                if (index === 0) { el.style.left = '50%'; el.style.top = '30%'; el.style.transform = 'translateX(-50%)'; }
                else if (index === 1) { el.style.left = '30%'; el.style.top = '65%'; el.style.transform = 'translate(-50%, -50%)'; }
                else { el.style.left = '70%'; el.style.top = '65%'; el.style.transform = 'translate(-50%, -50%)'; }
            }
            
            el.onclick = (e) => {
                e.stopPropagation();
                const newValue = prompt(`Set ${counter.type} count:`, counter.value);
                if (newValue !== null && !isNaN(newValue)) cardAction(`set-${counter.type}-${parseInt(newValue)}`);
            };
            countersContainer.appendChild(el);
        });
        el.appendChild(countersContainer);
    }

    // AP counter separately (Top Right)
    if (data.ap > 0 && data.faceUp) {
        const apCounter = document.createElement('div');
        apCounter.className = 'counter-base ap-counter';
        apCounter.innerText = data.ap;
        apCounter.onclick = (e) => {
            e.stopPropagation();
            const newValue = prompt(`Set AP count:`, data.ap);
            if (newValue !== null && !isNaN(newValue)) cardAction(`set-ap-${parseInt(newValue)}`);
        };
        el.appendChild(apCounter);
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
	
	 // Safety: If originalOwner is missing (from older loaded decks), set it to the current owner
    if (!card.originalOwner) card.originalOwner = card.owner;

    // Restore original ownership when leaving the field
    if (['hand', 'topdeck', 'bottomdeck', 'randomdeck', 'afterlife', 'shadow', 'oblivion'].includes(destType)) {
        card.owner = card.originalOwner;
    }
    
    // Update location
    card.loc = destType;
    card.faceUp = true; 
    card.rotated = false;
    card.isHighlighted = false;
	
	 // --- NEW: Reset All Counters ---
    card.ap = 0;
    card.token = 0;
    card.turncounter = 0;
    card.counter = 0;

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
        card.loc = 'deck'; // FIX: Ensure the engine knows it's actually sitting in the deck!
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

    // 1. Draw 1 card for YOURSELF. (The draw function automatically syncs this to the opponent)
    draw(1, 'player');

    // 2. Handle the Opponent's side
    if (isMultiplayer) {
        // Tell the opponent to click their own internal draw button and draw 1 card for themselves
        sendAction('draw_phase_global', {});
        sendAction('button_pulse', { button: 'draw' });
    } else {
        // If playing offline/solo, just draw 1 for the opponent directly
        draw(1, 'opponent');
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

let currentRound = 1;
let globalTurn = 1; // 1 = P1, 2 = P2, 3 = P1, 4 = P2, etc.

function updateTurnVisuals() {
    const oppLight = document.getElementById('opp-turn-light');
    const p1Light = document.getElementById('player-turn-light');
    const rText = document.getElementById('round-display');
    const tText = document.getElementById('turn-display');
    
    if (rText) rText.innerText = `Round: ${currentRound}`;
    if (tText) tText.innerText = `Turn: ${globalTurn}`;

    // If host goes first, they are Odd turns. If they go second, they are Even turns!
    const isHostTurn = hostGoesFirst ? (globalTurn % 2 !== 0) : (globalTurn % 2 === 0);
    
    // Upgraded LED glowing effect
    const activeGlow = 'inset 0 0 5px rgba(255,255,255,0.5), 0 0 15px ';
    const inactiveGlow = 'inset 0 3px 5px rgba(0,0,0,0.6)';
    
    if (myRole === 'host' || !isMultiplayer) {
        p1Light.style.background = isHostTurn ? '#2ecc71' : '#333';
        p1Light.style.boxShadow = isHostTurn ? activeGlow + '#2ecc71' : inactiveGlow;
        oppLight.style.background = !isHostTurn ? '#e74c3c' : '#333';
        oppLight.style.boxShadow = !isHostTurn ? activeGlow + '#e74c3c' : inactiveGlow;
    } else {
        p1Light.style.background = !isHostTurn ? '#2ecc71' : '#333';
        p1Light.style.boxShadow = !isHostTurn ? activeGlow + '#2ecc71' : inactiveGlow;
        oppLight.style.background = isHostTurn ? '#e74c3c' : '#333';
        oppLight.style.boxShadow = isHostTurn ? activeGlow + '#e74c3c' : inactiveGlow;
    }
}

function endTurn() {
    const btn = document.getElementById('end-turn-btn');
    if (btn) {
        btn.classList.add('pulsing');
        setTimeout(() => btn.classList.remove('pulsing'), 1000);
    }

    // Advance the global turn tracker
    globalTurn++;
    
    // If it is now an odd turn, a full round (2 turns) has completed.
    if (globalTurn % 2 !== 0) {
        currentRound++;
    }

    updateTurnVisuals();

    // Reset YOUR SP
    resetSP('player');
    
    // Reset summoning sickness for YOUR cards
    state.player.field.forEach(c => c.summonedThisTurn = false);

    // --- AP RESET LOGIC ---
    ['player', 'opponent'].forEach(p => {
        state[p].field.forEach(c => {
            if (c.maxAP !== undefined) {
                const desc = (c.description || "").toLowerCase();
                const isSpiritOrCounter = c.type === 'Spirit' || c.type === 'Counter';
                const isPerRound = desc.includes('per round');
                const isPerSummon = desc.includes('per summon');

                let shouldReset = true;
                if (isSpiritOrCounter) shouldReset = false;
                
                // If globalTurn is Even right now, it means Player 1 just finished Turn 1. The Round is NOT over!
                if (isPerRound && (globalTurn % 2 === 0)) shouldReset = false; 
                
                if (isPerSummon) shouldReset = false;

                if (shouldReset) {
                    c.ap = c.maxAP; 
                    refreshCard(c);
                }
            }
        });
    });

    if (isMultiplayer) {
        sendAction('button_pulse', { button: 'endturn' });
        sendAction('end_turn_sync', { round: currentRound, turns: globalTurn });
    }

    // --- AUTO DRAW LOGIC ---
    checkAutoDraw();
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

// --- ABILITY & TARGETING SYSTEM ---

// 1. The Parser: Reads card text and generates actionable buttons
function analyzeCardAbilities(card) {
    const desc = card.description || "";
    let parsedAbilities =[];
    let abilityId = 0;

    const addAbility = (text, sequence, reqTarget, cost = null) => {
        parsedAbilities.push({ id: abilityId++, text, sequence, reqTarget, cost });
    };

    // --- STRICT CHUNKING ---
    const chunks =[];
    const rawChunks = desc.split(/(?=●)/); 
    rawChunks.forEach(rc => {
        if (rc.trim().startsWith('●')) {
            chunks.push(rc.trim()); // Keep AP bullet points intact
        } else {
            // Split everything else strictly by linebreaks OR periods!
            rc.split(/(?=<br>|\.\s)/).forEach(sub => {
                let cleaned = sub.replace(/<[^>]*>?/gm, ' ').replace(/^\.\s*/, '').trim();
                if (cleaned) chunks.push(cleaned);
            });
        }
    });
    
    let activeContext = 'field'; 

    chunks.forEach((chunk) => {
        let displayText = chunk;

        // 1. Detect Context Headers
        if (/Hand Ability:/i.test(displayText)) activeContext = 'hand';
        else if (/Hand & Field Ability:/i.test(displayText)) activeContext = 'hand_field';
        else if (/AL Ability:/i.test(displayText) || /Discard Impowering:/i.test(displayText) || /Break Impowering:/i.test(displayText)) activeContext = 'afterlife';
        else if (/Shadow Realm Ability:/i.test(displayText)) activeContext = 'shadow';
        else if (/Oblivion Ability:/i.test(displayText)) activeContext = 'oblivion';
        else if (/Field Ability:/i.test(displayText) || /Balance Ability:/i.test(displayText) || /On Summon:/i.test(displayText) || /Flip:/i.test(displayText) || /^\d+[- ]?AP/i.test(displayText)) activeContext = 'field';

        // 2. Identify inherent traits of this exact sentence
        const isCycle = /\bCycle\b/i.test(displayText);
        const isEquip = /Equip Card/i.test(displayText);

        // 3. Strict Visibility Matrix
        let isVisible = false;
        if (card.loc === 'hand') {
            if (activeContext === 'hand' || activeContext === 'hand_field' || isCycle || isEquip) isVisible = true;
        } else if (card.loc === 'field') {
            if (activeContext === 'field' || activeContext === 'hand_field') isVisible = true;
            if (isCycle || isEquip) isVisible = false; // Strictly override
        } else {
            if (activeContext === card.loc) isVisible = true;
        }

        if (!isVisible) return; 
        
        // 4. Immunity Blocker (If it's just describing an immunity, stop parsing it!)
        if (/Immune/i.test(displayText)) return;

        // 5. EXTRACT AP COST & SP COST
        let cost = null;
        const apCostMatch = chunk.match(/●\s*(\d+)[-\s]*AP/i);
        if (/●\s*AP/i.test(chunk)) {
            cost = { use_ap: true, val: apCostMatch ? parseInt(apCostMatch[1]) : 1 };
        }

        let effectText = displayText;
        if (/Cost:\s*Pay (\d+)[-\s]*SP/i.test(effectText)) { 
            cost = { ...cost, type: 'pay_sp', val: parseInt(effectText.match(/Pay (\d+)[-\s]*SP/i)[1]) }; 
            effectText = effectText.replace(/Cost:\s*Pay \d+[-\s]*SP(?: and|,| to)?\.?/i, ''); 
        }

        effectText = effectText.replace(/Cost:\s*/gi, '').replace(/●\s*(\d+[-\s]*)?AP:?/i, '').trim();

        if (!effectText) return;

        // --- HELPER TO PARSE INDIVIDUAL STEPS ---
        const parseStep = (str) => {
            let t = null; let rTarget = false; let v = null; let e = null; let kw = null;
            str = str.replace(/<br\s*\/?>/gi, ' ').trim();

            // Player SP vs Card Level (Genie & Shifter fix)
            if (/(?:Gain|Add|Get)\s*(\d+)[-\s]*SP(?!\s*Copy)/i.test(str)) { t = 'sp_change'; v = parseInt(str.match(/(?:Gain|Add|Get)\s*(\d+)[-\s]*SP/i)[1]); }
            else if (/(?:Lose|Subtract|Pay)\s*(\d+)[-\s]*SP(?!\s*Copy)/i.test(str) && !/this card/i.test(str)) { t = 'sp_change'; v = -parseInt(str.match(/(?:Lose|Subtract|Pay)\s*(\d+)[-\s]*SP/i)[1]); }
            
            else if (/(?:Lose|Decrease|Reduce|Subtract)\s*(?:this card's\s*)?(?:SP(?: value)?|Levels?)(?:\s*by)?\s*(\d+)/i.test(str)) { t = 'level_change'; v = -parseInt(str.match(/(?:Lose|Decrease|Reduce|Subtract)\s*(?:this card's\s*)?(?:SP(?: value)?|Levels?)(?:\s*by)?\s*(\d+)/i)[1]); }
            else if (/(?:Gain|Add|Increase)\s*(?:this card's\s*)?(?:SP(?: value)?|Levels?)(?:\s*by)?\s*(\d+)/i.test(str)) { t = 'level_change'; v = parseInt(str.match(/(?:Gain|Add|Increase)\s*(?:this card's\s*)?(?:SP(?: value)?|Levels?)(?:\s*by)?\s*(\d+)/i)[1]); }
            else if (/Set this(?: card's)?(?: SP| Level) to (\d+)/i.test(str)) { t = 'set_self_level'; v = parseInt(str.match(/to\s*(\d+)/i)[1]); }

            // Unsummon (Forgiving Regex)
            else if (/\bUnsummon\b/i.test(str)) { t = 'unsummon_target'; rTarget = true; }

            // Standard Actions
            else if (/Targeted Break a (?:face down|facedown)/i.test(str)) { t = 'break_facedown'; rTarget = true; }
            else if (/Targeted Break a (?:face down|facedown)/i.test(str)) { t = 'break_facedown'; rTarget = true; }
            else if (/Targeted Break a (Spirit\/Counter|Spirit or Counter|Spirit|Counter)/i.test(str)) { 
                t = 'break_backrow'; rTarget = true; 
                const match = str.match(/Targeted Break a (Spirit\/Counter|Spirit or Counter|Spirit|Counter)/i)[1].toLowerCase();
                e = (match.includes('spirit') && match.includes('counter')) ? 'both' : match; 
            }
            else if (/(?:Targeted Break|Break a(?:nother)? (?:card|Phantom))/i.test(str)) { t = 'break'; rTarget = true; }
            else if (/(?:Targeted Discard|Discard a(?:nother)? (?:card|Phantom))/i.test(str)) { t = 'discard'; rTarget = true; }
            else if (/Targeted Banish/i.test(str)) { t = 'banish'; rTarget = true; }
            else if (/Targeted Destroy/i.test(str)) { t = 'destroy'; rTarget = true; }
            else if (/Targeted Bounce/i.test(str)) { t = 'bounce'; rTarget = true; }
            else if (/Targeted Deal (\d+)/i.test(str)) { t = 'damage'; rTarget = true; v = parseInt(str.match(/Targeted Deal (\d+)/i)[1]); }
            else if (/Targeted Deal/i.test(str)) { t = 'damage_dynamic'; rTarget = true; }
            
            else if (/(?:Give|Gain|Restore|Recover|Increase|Decrease|Lose|Reduce).*?(Health|HP|Attack|ATK|Stats?)/i.test(str)) {
                let amt = null; let statStr = "";
                const matchNum = str.match(/(?:Give|Gain|Restore|Recover|Increase|Decrease|Lose|Reduce).*?(\d+)[^\w]*(Health|HP|Attack|ATK|Stats?)/i);
                const matchStat = str.match(/(?:Give|Gain|Restore|Recover|Increase|Decrease|Lose|Reduce).*?(Health|HP|Attack|ATK|Stats?)[^\d]*(\d+)/i);
                const matchNoNum = str.match(/(?:Give|Gain|Restore|Recover|Increase|Decrease|Lose|Reduce).*?(Health|HP|Attack|ATK|Stats?)/i);

                if (matchNum) { amt = parseInt(matchNum[1]); statStr = matchNum[2].toLowerCase(); } 
                else if (matchStat) { statStr = matchStat[1].toLowerCase(); amt = parseInt(matchStat[2]); } 
                else if (matchNoNum) { statStr = matchNoNum[1].toLowerCase(); }

                const isDec = /Decrease|Lose|Reduce/i.test(str);
                if (amt !== null && statStr) {
                    const finalAmt = isDec ? -amt : amt;
                    if (statStr.includes('health') || statStr.includes('hp')) { t = 'heal'; rTarget = true; v = finalAmt; }
                    else if (statStr.includes('attack') || statStr.includes('atk')) { t = 'buff_attack'; rTarget = true; v = finalAmt; }
                    else if (statStr.includes('stat')) { t = 'buff_stats'; rTarget = true; v = finalAmt; }
                } else if (statStr) {
                    if (statStr.includes('health') || statStr.includes('hp')) { t = 'heal_dynamic'; rTarget = true; v = isDec ? -1 : 1; }
                    else if (statStr.includes('attack') || statStr.includes('atk')) { t = 'buff_attack_dynamic'; rTarget = true; v = isDec ? -1 : 1; }
                    else if (statStr.includes('stat')) { t = 'buff_stats_dynamic'; rTarget = true; v = isDec ? -1 : 1; }
                }
            }
            
            else if (/(?:Deal|Take) (\d+) damage/i.test(str)) {
                t = 'lp_damage'; v = parseInt(str.match(/(\d+)/)[1]);
                e = /both/i.test(str) ? 'both' : (/yourself|take/i.test(str) ? 'self' : 'opponent');
            }
            else if (/(?:Gain|Restore|Recover) (\d+) LP/i.test(str)) {
                t = 'lp_heal'; v = parseInt(str.match(/(\d+)/)[1]);
                e = /both/i.test(str) ? 'both' : 'self';
            }
            else if (/\bMill\b/i.test(str)) {
                t = 'mill_action';
                const match = str.match(/Mill (\d+)/i);
                v = match ? parseInt(match[1]) : 1;
                e = /both/i.test(str) ? 'both' : 'self';
            }
            else if (/(?:Apply|Give Target|Give|Gain|gains).*?(Summon Binding|Sturdy|Shielded|Taunter)/i.test(str)) {
                t = 'apply_keyword'; rTarget = true;
                e = str.match(/(?:Apply|Give Target|Give|Gain|gains).*?(Summon Binding|Sturdy|Shielded|Taunter)/i)[1];
            }
            // Fallback: If it mentions Summon Binding but has MORE words than just the keyword itself
            else if (/Summon Binding/i.test(str) && !/^\s*Summon Binding\.?\s*$/i.test(str)) {
                t = 'apply_keyword'; rTarget = true;
                e = 'Summon Binding';
            }
            else if (/Discard this card/i.test(str)) { t = 'discard_self'; }
            else if (/Pay (\d+) LP/i.test(str)) { t = 'pay_lp'; v = parseInt(str.match(/Pay (\d+) LP/i)[1]); }
            else if (/Remove (\d+) Counters?/i.test(str)) { t = 'remove_counter'; v = parseInt(str.match(/Remove (\d+) Counters?/i)[1]); }
            else if (/After Life Seal a(?:nother)? card/i.test(str)) { t = 'seal_al'; rTarget = true; }
            else if (/Stat Swap/i.test(str) || /Swap.*?Attack and Health/i.test(str)) { t = 'stat_swap'; rTarget = true; }
            else if (/Create a.*?(\d+)[-\s]*SP.*?Copy/i.test(str)) { 
                t = 'clone'; 
                const match = str.match(/Create a.*?(\d+)[-\s]*SP.*?Copy/i);
                if (match && match[1]) v = parseInt(match[1]); 
            }
            else if (/Create a.*?Copy/i.test(str)) { 
                t = 'clone'; 
            }
            else if (/Excavate (\d+)/i.test(str)) { t = 'excavate'; v = parseInt(str.match(/Excavate (\d+)/i)[1]); }
            else if (/(?:Both players draw|Draw .*? both players)/i.test(str)) { t = 'draw_both'; const match = str.match(/(\d+)/); v = match ? parseInt(match[1]) : 1; }
            else if (/\bDraw\b/i.test(str) && !/Withdraw/i.test(str)) { t = 'draw'; const match = str.match(/Draw (\d+)/i); v = match ? parseInt(match[1]) : 1; }
            else if (/\bSearch\b/i.test(str)) { t = 'search'; }
            else if (/Flip a (?:card )?face down/i.test(str)) { t = 'flip_down'; rTarget = true; }
            else if (/\bCycle\b/i.test(str)) { t = 'cycle'; }
            else if (/Equip Card/i.test(str)) { t = 'equip_card'; }
            else if (/Create\s+(?:a|two|three|four|\d+)/i.test(str)) { 
                t = 'spawn'; 
                let keywordToApply = null;
                
                // Clip off "with Rush" or "with Summon Binding"
                const kwMatch = str.match(/with\s+([\w\s]+?)(?:\s*$|\.|\,)/i);
                if (kwMatch) keywordToApply = kwMatch[1].trim();

                const match = str.match(/Create\s+(?:a|two|three|four|\d+)\s+(?:level[-\s]*\d+\s+|\d+[-\s]*SP\s+)?(?:[\d]+\/[\d]+\s+)?([\w\s'-]+?)(?:\s+Phantoms?|\s+Tokens?|\s+with\s+[\w\s]+|\s*$|\.|\,)/i);
                
                if (match) { 
                    e = match[1].trim(); 
                    // Clean the "0-SP" or "Level 1" out of the card name so the database finds it!
                    e = e.replace(/^(?:\d+[-\s]*SP|Level[-\s]*\d+)\s+/i, '');
                    if (e.toLowerCase().includes("copy")) t = null; 
                }
                
                if (/two/i.test(str)) t = 'spawn_2';
                else if (/three/i.test(str)) t = 'spawn_3';
                else if (/four/i.test(str)) t = 'spawn_4';
                
                const spMatch = str.match(/(\d+)[-\s]*SP|Level[-\s]*(\d+)/i);
                if (spMatch) v = parseInt(spMatch[1] !== undefined ? spMatch[1] : spMatch[2]);
                
                // Return the extra 'keyword' property so the executor can apply it!
                return t ? { type: t, reqTarget: rTarget, value: v, extra: e, keyword: keywordToApply } : null;
            }

            return t ? { type: t, reqTarget: rTarget, value: v, extra: e } : null;
        };

        // --- BRANCHING & SEQUENCING ---
        let preppedText = effectText.replace(/\b\s+and\s+(Gain|Lose|Draw|Deal|Destroy|Break|Discard|Banish|Mill|Search|Unsummon|Create|Set|Reduce|Decrease|Increase)\b/gi, ' and then $1');
		const orBranches = preppedText.split(/\b\s+or\s+\b/i);

        orBranches.forEach((branchStr, branchIdx) => {
            // FIX: Added <br> tags so multi-line bullet points perfectly separate into distinct sequence steps!
            const sequenceSteps = branchStr.split(/\b\s+(?:and then|to)\s+\b|\.\s+|<br\s*\/?>\s*/i);
            
            let sequence =[];
            let overallReqTarget = false;

            sequenceSteps.forEach(stepStr => {
                if (!stepStr.trim()) return;
                const parsed = parseStep(stepStr);
                if (parsed) {
                    sequence.push(parsed);
                    if (parsed.reqTarget) overallReqTarget = true;
                }
            });

            if (sequence.length > 0) {
                let btnText = orBranches.length > 1 ? `Option ${branchIdx + 1}: ${displayText}` : displayText;
                addAbility(btnText, sequence, overallReqTarget, cost);
            }
        });
    });

    if (parsedAbilities.length === 0) {
        addAbility("Manual Activation (Highlight Target)",[{type: 'generic_target', reqTarget: true}], true);
    }

    return parsedAbilities;
}

// 2. The Menu: Populates the UI with parsed abilities
let currentParsedAbilities =[];

function openAbilityMenu(card) {
    if (!card) return;
    const desc = (card.description || "").toLowerCase();
    
    const inHand = card.loc === 'hand';
    const inPile = ['afterlife', 'shadow', 'oblivion'].includes(card.loc);
    
    // Hand check: Allow Hand Abilities, Cycle, and Equip Card
    if (inHand) {
        const hasHandAbility = desc.includes('hand ability') || desc.includes('hand & field ability') || /\bcycle\b/.test(desc) || desc.includes('equip card');
        if (!hasHandAbility) return;
    }
    // Pile check
    if (inPile) {
        const hasPileAbility = (card.loc === 'afterlife' && desc.includes('al ability')) || 
                               (card.loc === 'shadow' && desc.includes('shadow realm ability')) || 
                               (card.loc === 'oblivion' && desc.includes('oblivion ability'));
        if (!hasPileAbility) return;
    }
    
    // If activating from hand, automatically flip it face-up to reveal it to the opponent!
    if (inHand && isMultiplayer && !card.faceUp) {
        card.faceUp = true;
        refreshCard(card);
        sendAction('flip', { cardId: card.id, faceUp: true }); 
    }
    
    try {
        currentParsedAbilities = analyzeCardAbilities(card);
    } catch (err) {
        console.error("Ability Parser Error:", err);
        currentParsedAbilities =[];
    }

    abilityState = { sourceId: card.id, targetId: null, type: null, step: 'menu', activeAbility: null };
    
    // SMART BYPASS: If no automatable abilities exist, skip menu and jump straight to generic targeting
    if (currentParsedAbilities.length === 0 || (currentParsedAbilities.length === 1 && currentParsedAbilities[0].sequence && currentParsedAbilities[0].sequence[0].type === 'generic_target')) {
        abilityState.type = 'generic_target';
        abilityState.step = 'targeting';
        abilityState.activeAbility = currentParsedAbilities[0] || { id: 999, sequence:[{type: 'generic_target', reqTarget: true}], reqTarget: true };
        refreshCard(card);
        if (isMultiplayer) sendAction('ability_sync', abilityState);
        return;
    }
    
    const modal = document.getElementById('custom-ui-modal');
    const content = document.getElementById('custom-ui-content');
    const imageContainer = document.getElementById('custom-ui-image');
    const titleEl = document.getElementById('custom-ui-title');
    
    if (titleEl) titleEl.innerText = `${card.name}`;
    
    if (imageContainer) {
        imageContainer.innerHTML = '';
        imageContainer.style.display = 'block'; // Ensure image shows
        const visualClone = createCardEl({...card, id: card.id + '-ui-clone', loc: 'hand'}); 
        visualClone.style.position = 'static';
        visualClone.style.width = '100%'; 
        visualClone.style.height = '100%';
        visualClone.style.pointerEvents = 'none'; 
        imageContainer.appendChild(visualClone);
    }
    
    content.innerHTML = '';
    currentParsedAbilities.forEach(ability => {
        const tag = ability.reqTarget ? `<span class="btn-tag">Requires Target</span>` : '';
        content.innerHTML += `
            <button class="custom-ui-btn" onclick="selectAbility(${ability.id})">
                <span>${ability.text}</span>
                ${tag}
            </button>
        `;
    });
    
    content.innerHTML += `<button class="custom-ui-btn custom-ui-cancel" onclick="cancelAbility()">Cancel</button>`;
    modal.style.zIndex = '99999'; // FIX: Force it above the deck viewer
    modal.classList.remove('hidden');
}

function selectAbility(abilityId) {
    const ability = currentParsedAbilities.find(a => a.id === abilityId);
    if (!ability) return;

    const modal = document.getElementById('custom-ui-modal');
    modal.classList.add('hidden');
    
    abilityState.activeAbility = ability;
    abilityState.type = ability.type;
    abilityState.currentStepIndex = 0; // NEW: Start at the first step
    abilityState.targetId = null;
	abilityState.apPaid = false;

    // Start the engine! It will pause automatically if the first step needs a target.
    executeAbility();
}

function cancelAbility() {
    const modal = document.getElementById('custom-ui-modal');
    if (modal) modal.classList.add('hidden');
    
    const sId = abilityState.sourceId;
    const tId = abilityState.targetId;
    abilityState = { sourceId: null, targetId: null, type: null, step: 'idle', activeAbility: null };
    currentParsedAbilities =[];
    
    if (sId) refreshCard(findCard(sId));
    if (tId) refreshCard(findCard(tId));
    
    if (isMultiplayer) sendAction('ability_sync', abilityState);
}

// 3. The Executor: Runs the logic sequence step-by-step
function executeAbility() {
    const sourceCard = findCard(abilityState.sourceId);
    const ability = abilityState.activeAbility;
    if (!ability) return;

    const performMove = (tCard, dest) => {
        const originalLoc = tCard.loc;
        moveCardTo(tCard, dest);
        if (isMultiplayer) sendAction('move', { cardId: tCard.id, fromZone: originalLoc, toZone: `${tCard.owner}-${dest}` });
    };

    if (!ability.sequence) { cancelAbility(); return; }

    // --- STATE MACHINE EXECUTION ---
    while (abilityState.currentStepIndex < ability.sequence.length) {
        const step = ability.sequence[abilityState.currentStepIndex];

        // 1. PAUSE FOR TARGET
        if (step.reqTarget && !abilityState.targetId) {
            abilityState.step = 'targeting';
            refreshCard(sourceCard);
            if (isMultiplayer) sendAction('ability_sync', abilityState);
            return; 
        }

        // 2. PROCESS AP & SP COST (Only runs once per sequence, right after targeting is resolved!)
        if (abilityState.currentStepIndex === 0 && !abilityState.apPaid) {
            if (ability.cost && ability.cost.use_ap) {
                const costVal = ability.cost.val || 1;
                if (!sourceCard.ap || sourceCard.ap < costVal) {
                    alert(`Need ${costVal} AP!`);
                    cancelAbility(); return;
                }
                sourceCard.ap -= costVal; 
                refreshCard(sourceCard);
                if (isMultiplayer) sendAction('edit_stat', { cardId: sourceCard.id, stat: 'ap', value: sourceCard.ap });
            }
            
            // --- NEW: PAY SP COST ---
            if (ability.cost && ability.cost.type === 'pay_sp') {
                if (state[sourceCard.owner].sp < ability.cost.val) {
                    alert("Not enough SP to pay the cost!");
                    cancelAbility(); return;
                }
                state[sourceCard.owner].sp -= ability.cost.val;
                updateStats();
                if (isMultiplayer) sendAction('sp', { player: sourceCard.owner, value: state[sourceCard.owner].sp });
            }
            
            abilityState.apPaid = true;
        }

        
        

        if (step.type === 'sp_change') {
            state[sourceCard.owner].sp = Math.max(0, state[sourceCard.owner].sp + step.value);
            updateStats();
            if (isMultiplayer) sendAction('sp', { player: sourceCard.owner, value: state[sourceCard.owner].sp });
        }

        const targetCard = abilityState.targetId ? findCard(abilityState.targetId) : null;
        if (step.type === 'sp_change') {
            state[sourceCard.owner].sp = Math.max(0, state[sourceCard.owner].sp + step.value);
            updateStats();
            if (isMultiplayer) sendAction('sp', { player: sourceCard.owner, value: state[sourceCard.owner].sp });
        }
        else if (step.type === 'damage' && targetCard) {
            if (targetCard.shieldActive) targetCard.shieldActive = false;
            else { targetCard.health -= step.value; if (targetCard.health <= 0) applyBreak(targetCard); }
            refreshCard(targetCard);
            if (isMultiplayer) sendAction('edit_stat', { cardId: targetCard.id, stat: 'health', value: targetCard.health });
        }
        else if (step.type === 'damage_dynamic' && targetCard) {
            const dmg = prompt("Enter Damage Amount:", "500");
            if (dmg !== null) {
                if (targetCard.shieldActive) targetCard.shieldActive = false;
                else { targetCard.health -= (parseInt(dmg) || 0); if (targetCard.health <= 0) applyBreak(targetCard); }
                refreshCard(targetCard);
                if (isMultiplayer) sendAction('edit_stat', { cardId: targetCard.id, stat: 'health', value: targetCard.health });
            }
        }
        else if (step.type === 'heal' && targetCard) {
            targetCard.health = (targetCard.health || 0) + step.value;
            refreshCard(targetCard);
            if (isMultiplayer) sendAction('edit_stat', { cardId: targetCard.id, stat: 'health', value: targetCard.health });
        }
        else if (step.type === 'heal_dynamic' && targetCard) {
            const val = prompt("Enter Health Amount:", "500");
            if (val !== null) {
                targetCard.health = Math.max(0, (targetCard.health || 0) + ((parseInt(val) || 0) * step.value));
                refreshCard(targetCard);
                if (isMultiplayer) sendAction('edit_stat', { cardId: targetCard.id, stat: 'health', value: targetCard.health });
            }
        }
        else if (step.type === 'buff_attack' && targetCard) {
            targetCard.attack = Math.max(0, (targetCard.attack || 0) + step.value);
            refreshCard(targetCard);
            if (isMultiplayer) sendAction('edit_stat', { cardId: targetCard.id, stat: 'attack', value: targetCard.attack });
        }
        else if (step.type === 'buff_attack_dynamic' && targetCard) {
            const val = prompt("Enter Attack Amount:", "500");
            if (val !== null) {
                targetCard.attack = Math.max(0, (targetCard.attack || 0) + ((parseInt(val) || 0) * step.value));
                refreshCard(targetCard);
                if (isMultiplayer) sendAction('edit_stat', { cardId: targetCard.id, stat: 'attack', value: targetCard.attack });
            }
        }
        else if (step.type === 'buff_stats' && targetCard) {
            targetCard.attack = Math.max(0, (targetCard.attack || 0) + step.value);
            targetCard.health = Math.max(0, (targetCard.health || 0) + step.value);
            refreshCard(targetCard);
            if (isMultiplayer) {
                sendAction('edit_stat', { cardId: targetCard.id, stat: 'attack', value: targetCard.attack });
                sendAction('edit_stat', { cardId: targetCard.id, stat: 'health', value: targetCard.health });
            }
        }
        else if (step.type === 'buff_stats_dynamic' && targetCard) {
            const val = prompt("Enter Stat Amount:", "500");
            if (val !== null) {
                const amt = (parseInt(val) || 0) * step.value;
                targetCard.attack = Math.max(0, (targetCard.attack || 0) + amt);
                targetCard.health = Math.max(0, (targetCard.health || 0) + amt);
                refreshCard(targetCard);
                if (isMultiplayer) {
                    sendAction('edit_stat', { cardId: targetCard.id, stat: 'attack', value: targetCard.attack });
                    sendAction('edit_stat', { cardId: targetCard.id, stat: 'health', value: targetCard.health });
                }
            }
        }
        else if (step.type === 'discard_self') {
            performMove(sourceCard, 'afterlife');
        }
		
		else if (step.type === 'unsummon_target' && targetCard) {
            const refund = parseInt(targetCard.level) || 0;
            state[sourceCard.owner].sp += refund;
            updateStats();
            if (isMultiplayer) sendAction('sp', { player: sourceCard.owner, value: state[sourceCard.owner].sp });
            performMove(targetCard, 'afterlife');
        }
        else if (step.type === 'seal_al' && targetCard) {
            const txt = `<br><b>[Applied: After Life Sealed]</b>`;
            targetCard.description = (targetCard.description || "") + txt;
            refreshCard(targetCard);
            alert(`After Life Sealed applied to ${targetCard.name}`);
            // SYNC THE DESCRIPTION UPDATE
            if (isMultiplayer) sendAction('edit_stat', { cardId: targetCard.id, stat: 'description', value: targetCard.description });
        }
        else if (step.type === 'apply_keyword' && targetCard) {
            targetCard.description = (targetCard.description || "") + `<br><b>[Applied: ${step.extra}]</b>`;
            if (step.extra.toLowerCase() === 'summon binding') targetCard.summonBinding = true;
            if (step.extra.toLowerCase() === 'shielded') targetCard.shieldActive = true;
            alert(`${step.extra} applied to ${targetCard.name}!`);
            refreshCard(targetCard);
            
            // SYNC KEYWORDS
            if (isMultiplayer) {
                sendAction('edit_stat', { cardId: targetCard.id, stat: 'description', value: targetCard.description });
                if (targetCard.summonBinding) sendAction('edit_stat', { cardId: targetCard.id, stat: 'summonBinding', value: true });
                if (targetCard.shieldActive) sendAction('edit_stat', { cardId: targetCard.id, stat: 'shieldActive', value: true });
            }
        }
		
        else if (step.type === 'pay_lp') {
            if (state[sourceCard.owner].lp <= step.value) { alert("Not enough LP!"); break; }
            state[sourceCard.owner].lp -= step.value;
            updateStats();
            if (isMultiplayer) sendAction('lp', { player: sourceCard.owner, value: state[sourceCard.owner].lp });
        }
        else if (step.type === 'remove_counter') {
            if ((sourceCard.counter || 0) < step.value) { alert(`Not enough counters!`); break; }
            sourceCard.counter -= step.value;
            refreshCard(sourceCard);
            if (isMultiplayer) sendAction('edit_stat', { cardId: sourceCard.id, stat: 'counter', value: sourceCard.counter });
        }
        else if (step.type === 'seal_al' && targetCard) {
            targetCard.description = (targetCard.description || "") + `<br><b>[Applied: After Life Sealed]</b>`;
            refreshCard(targetCard);
            alert(`After Life Sealed applied to ${targetCard.name}`);
        }
        else if (step.type === 'level_change') {
            sourceCard.level = Math.max(0, (sourceCard.level || 0) + step.value);
            refreshCard(sourceCard);
            if (isMultiplayer) sendAction('edit_stat', { cardId: sourceCard.id, stat: 'level', value: sourceCard.level });
        }
        else if (step.type === 'set_self_level') {
            sourceCard.level = step.value;
            refreshCard(sourceCard);
            if (isMultiplayer) sendAction('edit_stat', { cardId: sourceCard.id, stat: 'level', value: sourceCard.level });
        }
        else if (step.type === 'ap_change') {
            sourceCard.ap = (sourceCard.ap || 0) + step.value;
            refreshCard(sourceCard);
            if (isMultiplayer) sendAction('edit_stat', { cardId: sourceCard.id, stat: 'ap', value: sourceCard.ap });
        }
        else if (step.type === 'break' && targetCard) {
            if (!(targetCard.description || "").includes("Immune to Targeted Break")) applyBreak(targetCard, sourceCard);
        }
        else if (step.type === 'break_facedown' && targetCard) {
            if (!targetCard.faceUp) applyBreak(targetCard, sourceCard);
        }
        else if (step.type === 'break_backrow' && targetCard) {
            const isSpirit = targetCard.type === 'Spirit';
            const isCounter = targetCard.type === 'Counter';
            const extraLower = (step.extra || "").toLowerCase();
            let valid = false;
            
            if (extraLower === 'both') valid = isSpirit || isCounter;
            else if (extraLower === 'spirit') valid = isSpirit;
            else if (extraLower === 'counter') valid = isCounter;
            
            if (valid) {
                applyBreak(targetCard, sourceCard);
            } else {
                alert(`Target must be a ${step.extra}!`);
            }
        }
        else if (step.type === 'discard' && targetCard) performMove(targetCard, 'afterlife');
        else if (step.type === 'banish' && targetCard) performMove(targetCard, 'shadow');
        else if (step.type === 'destroy' && targetCard) performMove(targetCard, 'oblivion');
        else if (step.type === 'bounce' && targetCard) performMove(targetCard, 'hand');
        else if (step.type === 'flip_down' && targetCard) {
            targetCard.faceUp = false; refreshCard(targetCard);
            if (isMultiplayer) sendAction('flip', { cardId: targetCard.id, faceUp: false });
        }
        else if (step.type === 'equip_card') {
            sourceCard.level = 0; sourceCard.attack = 0; sourceCard.health = 0;
            playCardToField(sourceCard, 'Spirit', true, false);
            refreshCard(sourceCard);
            if (isMultiplayer) {
                sendAction('edit_stat', { cardId: sourceCard.id, stat: 'level', value: 0 });
                sendAction('edit_stat', { cardId: sourceCard.id, stat: 'attack', value: 0 });
                sendAction('edit_stat', { cardId: sourceCard.id, stat: 'health', value: 0 });
                const el = document.getElementById(sourceCard.id);
                if (el && el.parentElement) sendAction('move', { cardId: sourceCard.id, toZone: el.parentElement.id, fromZone: 'hand', faceUp: true, rotated: false });
            }
        }
        else if (step.type === 'cycle') {
            if (state[sourceCard.owner].sp < 1) { alert("Not enough SP!"); break; }
            state[sourceCard.owner].sp -= 1; updateStats();
            if (isMultiplayer) sendAction('sp', { player: sourceCard.owner, value: state[sourceCard.owner].sp });
            performMove(sourceCard, 'randomdeck');
            draw(1, sourceCard.owner);
        }
        else if (step.type === 'lp_damage') {
            const targets = step.extra === 'both' ?['player', 'opponent'] : [step.extra === 'self' ? 'player' : 'opponent'];
            targets.forEach(t => { state[t].lp -= step.value; if (isMultiplayer) sendAction('lp', { player: t, value: state[t].lp }); });
            updateStats();
        }
        else if (step.type === 'lp_heal') {
            const targets = step.extra === 'both' ?['player', 'opponent'] : ['player'];
            targets.forEach(t => { state[t].lp += step.value; if (isMultiplayer) sendAction('lp', { player: t, value: state[t].lp }); });
            updateStats();
        }
        else if (step.type === 'mill_action') {
            const targets = step.extra === 'both' ? ['player', 'opponent'] :['player'];
            targets.forEach(t => {
                for(let i=0; i<step.value; i++) {
                    if(state[t].deck.length > 0) {
                        const c = state[t].deck.pop(); state[t].afterlife.push(c); updateCounts(t);
                        if (isMultiplayer) sendAction('mill', { owner: t, source: 'deck', dest: 'afterlife', cardId: c.id });
                    }
                }
            });
        }
        else if (step.type === 'stat_swap' && targetCard) {
            const temp = targetCard.attack || 0;
            targetCard.attack = targetCard.health || 0; targetCard.health = temp;
            refreshCard(targetCard);
            if (isMultiplayer) {
                sendAction('edit_stat', { cardId: targetCard.id, stat: 'attack', value: targetCard.attack });
                sendAction('edit_stat', { cardId: targetCard.id, stat: 'health', value: targetCard.health });
            }
        }
        else if (step.type === 'clone') cloneCard(sourceCard, step.value);
        else if (step.type === 'excavate') startExcavate(sourceCard.owner, step.value);
        else if (step.type === 'draw_both') {
            const amt = step.value || 1; draw(amt, 'player');
            if (!isMultiplayer) draw(amt, 'opponent');
            else sendAction('draw_phase_global', { amount: amt });
        }
        else if (step.type === 'draw') draw(step.value || 1, sourceCard.owner);
        else if (step.type === 'search') openViewer(sourceCard.owner, 'deck', true);
        else if (step.type === 'spawn' || step.type === 'spawn_2' || step.type === 'spawn_3') {
            let count = 1;
            if (step.type === 'spawn_2') count = 2;
            if (step.type === 'spawn_3') count = 3;

            let nameToSpawn = step.extra;
            if (!nameToSpawn) {
                const promptResult = prompt("Enter Card Name to Spawn:", "");
                if (promptResult !== null) nameToSpawn = promptResult.trim();
            }

            if (nameToSpawn) {
                for (let k = 0; k < count; k++) {
                    if (nameToSpawn === "" || nameToSpawn.toLowerCase() === "token") {
                        spawnToken(sourceCard.owner);
                    } else {
                        const dbCard = allCards.find(c => (c.name || "").toLowerCase() === nameToSpawn.toLowerCase());
                        if (dbCard) {
                            const newCard = {
                                ...dbCard, 
                                id: `c-${++idCounter}-${Date.now()}-${k}`, 
                                owner: sourceCard.owner, originalOwner: sourceCard.owner, 
                                originalZone: 'deck', loc: 'field', faceUp: true, rotated: false
                            };

                            // --- APPLY OVERRIDES ---
                            if (step.value !== null && step.value !== undefined) {
                                newCard.level = step.value;
                            } else if (nameToSpawn.toLowerCase() === "token") {
                                newCard.level = 0;
                            }

                            const statMatch = (ability.text || "").match(/(\d+)\/(\d+)/);
                            if (statMatch) { 
                                newCard.attack = parseInt(statMatch[1]); 
                                newCard.health = parseInt(statMatch[2]); 
                            } else if (nameToSpawn.toLowerCase() === "token") {
                                newCard.attack = 0; newCard.health = 0;
                            }

                            if (step.keyword) {
                                newCard.description = (newCard.description || "") + `<br><b>[Applied: ${step.keyword}]</b>`;
                                if (step.keyword.toLowerCase().includes('summon binding')) newCard.summonBinding = true;
                                if (step.keyword.toLowerCase().includes('shielded')) newCard.shieldActive = true;
                            }

                            const pfx = sourceCard.owner; 
                            let targetZone = null;
                            const priorityIds =[`${pfx}-monster-2`, `${pfx}-monster-1`, `${pfx}-monster-3`, `${pfx}-balance-1`, `${pfx}-balance-2`];
                            for (let id of priorityIds) { 
                                const z = document.getElementById(id); 
                                if (z && z.children.length === 0) { targetZone = z; break; } 
                            }
                            
                            if (targetZone) {
                                state[sourceCard.owner].field.push(newCard); 
                                targetZone.appendChild(createCardEl(newCard));
                                if (isMultiplayer) {
                                    sendAction('spawn_token', { tokenData: newCard, zoneId: targetZone.id });
                                    if (newCard.level !== dbCard.level) sendAction('edit_stat', { cardId: newCard.id, stat: 'level', value: newCard.level });
                                    if (newCard.attack !== dbCard.attack) sendAction('edit_stat', { cardId: newCard.id, stat: 'attack', value: newCard.attack });
                                    if (newCard.health !== dbCard.health) sendAction('edit_stat', { cardId: newCard.id, stat: 'health', value: newCard.health });
                                    if (step.keyword) sendAction('edit_stat', { cardId: newCard.id, stat: 'description', value: newCard.description });
                                }
                            } else {
                                alert("No space on the field to spawn!"); break;
                            }
                        } else {
                            alert(`Could not find "${nameToSpawn}" in database.`); break;
                        }
                    }
                } 
            }
        }
        else if (step.type === 'generic_target' && targetCard) {
            const tEl = document.getElementById(targetCard.id);
            if (tEl) { tEl.classList.add('golden-pulse'); setTimeout(() => tEl.classList.remove('golden-pulse'), 500); }
        }

        // --- STEP CLEANUP ---
        // We finished the step. Clear the target so the NEXT step can ask for one if needed.
        if (abilityState.targetId && targetCard) {
            abilityState.targetId = null;
            refreshCard(targetCard); // Removes the orange target glow
        }
        
        abilityState.currentStepIndex++;
    }

    cancelAbility(); // Entire sequence is complete
}

function refreshCard(card) {
    const old = document.getElementById(card.id);
    if (old) {
        // Preserve pile visualization (hide stats) if it's currently sitting on a pile zone
        const parent = old.parentElement;
        const isPileZone = parent && parent.classList.contains('zone') && ['afterlife', 'shadow', 'oblivion'].includes(parent.dataset.type);
        
        const renderData = isPileZone ? { ...card, loc: 'pile' } : card;
        old.replaceWith(createCardEl(renderData));
    }
}

function cloneCard(card, overrideLevel = null) {
    idCounter++;
    const newId = `c-${idCounter}-${Date.now()}`;
    const newCard = { ...card, id: newId, originalOwner: card.originalOwner || card.owner };
    
    // --- NEW: DYNAMIC LEVEL OVERRIDE ---
    if (overrideLevel !== null && overrideLevel !== undefined) {
        newCard.level = overrideLevel;
    }

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
    // 2. If cloned from Hand, Deck, or Piles, ALWAYS add the clone to the Hand
    else {
        newCard.loc = 'hand'; // Force location to hand
        state[card.owner].hand.push(newCard);
        renderHand(card.owner);
    }

    if (isMultiplayer) {
        sendAction('clone_sync', { cardData: newCard, toZone: parentZoneId });
        if (overrideLevel !== null) sendAction('edit_stat', { cardId: newCard.id, stat: 'level', value: newCard.level });
    }
}

function openCardCtx(e, card) {
    ctxTarget = card;
    const menu = document.getElementById('ctx-card');
    menu.innerHTML = ''; 

    const addMsg = (text, action) => {
        const div = document.createElement('div');
        div.className = 'ctx-menu-item';
        div.innerText = text;
        div.onclick = (event) => { event.stopPropagation(); cardAction(action); };
        menu.appendChild(div);
    };

    const addSep = () => {
        const div = document.createElement('div');
        div.className = 'sep';
        menu.appendChild(div);
    };

    const addNestedMenu = (text, items) => {
        const container = document.createElement('div');
        container.className = 'submenu-container';
        const titleDiv = document.createElement('div');
        titleDiv.className = 'ctx-menu-item has-submenu';
        titleDiv.innerText = text;
        container.appendChild(titleDiv);
        const submenu = document.createElement('div');
        submenu.className = 'submenu';
        items.forEach(item => {
            if (!item) return;
            if (item.isSeparator) {
                const s = document.createElement('div'); s.className = 'sep'; submenu.appendChild(s);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'submenu-item';
                menuItem.innerText = item.text;
                menuItem.onclick = (event) => { event.stopPropagation(); cardAction(item.action); };
                submenu.appendChild(menuItem);
            }
        });
        container.appendChild(submenu);
        menu.appendChild(container);
        
        container.addEventListener('mouseenter', () => {
            const parentRect = container.getBoundingClientRect();
            const menuRect = submenu.getBoundingClientRect();
            submenu.style.left = (parentRect.right + menuRect.width > window.innerWidth) ? "-100%" : "100%";
            submenu.style.top = (parentRect.top + menuRect.height > window.innerHeight) ? "auto" : "-2px";
            if (parentRect.top + menuRect.height > window.innerHeight) submenu.style.bottom = "0";
        });
    };

    const inHand = card.loc === 'hand';
    const onField = card.loc === 'field';
    const isMyCard = card.owner === 'player';
	
    // --- SECTION 1: PRIMARY ACTIONS ---
    if (onField && card.faceUp && card.type === 'Phantom') {
        if (!battleState.attackerId) {
            if (!card.rotated) addMsg('Initiate Attack (B)', 'init-atk');
        } else if (!battleState.targetId) {
            if (card.owner === 'opponent') {
                addMsg('Target for Attack (B)', 'target-atk');
            } else if (card.id === battleState.attackerId) {
                const oppPhantoms = state.opponent.field.filter(c => c.type === 'Phantom');
                if (oppPhantoms.length === 0 && !card.summonedThisTurn) {
                    addMsg('Initiate Direct Attack (B)', 'init-direct-atk');
                }
            }
            addMsg('Cancel Attack (N)', 'cancel-atk');
        } else {
            if (battleState.attackerId === battleState.targetId && card.id === battleState.attackerId) {
                addMsg('Execute Direct Attack (B)', 'execute-direct-atk');
            } else {
                addMsg('Execute Battle (B)', 'execute-battle');
            }
            addMsg('Cancel Attack (N)', 'cancel-atk');
        }
        addSep();
		if (isMyCard) addMsg('Activate Ability (V)', 'activate-ability');
    } else if (!onField && (isMyCard || !inHand)) {
        if (card.type === 'Phantom') {
            const playOpts =[
                { text: 'Summon (Attack) (W)', action: 'play-atk' }, { text: 'Summon (Defense)', action: 'play-def' },
                { isSeparator: true },
                { text: 'Set (Attack)', action: 'set-atk' }, { text: 'Set (Defense)', action: 'set-def' }
            ];
            const specialOpts =[
                { text: 'Special Attack', action: 'special-play-atk' }, { text: 'Special Defense', action: 'special-play-def' },
                { isSeparator: true },
                { text: 'Sp. Set Attack', action: 'special-set-atk' }, { text: 'Sp. Set Defense', action: 'special-set-def' }
            ];
            addNestedMenu('Summon/Set', playOpts);
            addSep();
            addNestedMenu('Special Summon', specialOpts);
            addSep();
        } else {
            const isCounter = card.type === 'Counter';
            addMsg(isCounter ? 'Play' : 'Play (W)', 'play-spirit');
            addMsg(isCounter ? 'Set (W)' : 'Set', 'set-spirit');
            addSep();
        }
    }

    addMsg(inHand && isMyCard ? 'Reveal & Highlight (E)' : 'Highlight (E)', 'highlight');
    addSep();
    
    // Allow activating Hand Abilities directly from the context menu
    if (inHand && isMyCard) {
        addMsg('Activate Ability (V)', 'activate-ability');
		const inPile =['afterlife', 'shadow', 'oblivion'].includes(card.loc);
        addSep();
    }
	
	

	if (onField && card.type === 'Phantom') {
        addMsg('Unsummon (U)', 'unsummon');
        addSep();
    }

    addMsg('Flip (F)', 'flip');
    addMsg('Rotate (R)', 'rotate');
    addSep();
    
    if (isMyCard || !inHand) { addMsg('Copy/Clone (C)', 'clone'); addSep(); }
	
    const inPile =['afterlife', 'shadow', 'oblivion'].includes(card.loc);
    if (onField || inPile) {
        addNestedMenu('Add To Card:',[
            { text: 'Add an AP', action: 'add-ap' },
            card.ap > 0 ? { text: 'Remove an AP', action: 'remove-ap' } : null,
            { isSeparator: true },
            { text: 'Add a Counter', action: 'add-token' },
            card.token > 0 ? { text: 'Remove a Counter', action: 'remove-token' } : null,
            { isSeparator: true },
            { text: 'Add a Marker', action: 'add-marker' },
            card.marker > 0 ? { text: 'Remove a Marker', action: 'remove-marker' } : null,
            { isSeparator: true },
            { text: 'Add a Turn Counter', action: 'add-turncounter' },
            card.turncounter > 0 ? { text: 'Remove a Turn Counter', action: 'remove-turncounter' } : null,
        ].filter(Boolean));
        addSep();
    }
	
    // Movement (Filtered to prevent leading separator)
    const moveItems = [
        !inHand ? { text: 'To Hand (H)', action: 'hand' } : null,
        !inHand ? { isSeparator: true } : null,
        { text: 'To Deck (Random) (P)', action: 'randomdeck' },
        { text: 'To Deck Top', action: 'topdeck' },
        { text: 'To Deck Bottom', action: 'bottomdeck' },
        { isSeparator: true },
        { text: 'To After Life (D)', action: 'afterlife' },
        { text: 'To Shadow Realm (S)', action: 'shadow' },
        { text: 'To Oblivion (A)', action: 'oblivion' }
    ].filter(Boolean);
    // Remove leading separator if "To Hand" was removed
    if (moveItems[0] && moveItems[0].isSeparator) moveItems.shift();
    
    addNestedMenu('Move To:', moveItems);

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
    else if (act === 'init-direct-atk') {
        battleState.targetId = card.id; // Self-target to get the glow
        refreshCard(card);
        if (isMultiplayer) sendAction('battle_sync', { step: 'target', targetId: card.id });
    }
    else if (act === 'execute-direct-atk' || act === 'direct-atk') {
        executeDirectAttack(battleState.attackerId || card.id);
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
	else if (act === 'activate-ability') {
        openAbilityMenu(card);
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
    // Handle Counters
    else if (act.startsWith('add-') || act.startsWith('remove-')) {
        const isAdd = act.startsWith('add-');
        const counterType = act.split('-')[1]; // ap, token, etc.
        
        if (!card[counterType]) {
            card[counterType] = 0;
        }

        if (isAdd) {
            card[counterType]++;
        } else {
            card[counterType]--;
        }

        refreshCard(card);
        // FIX: Changed from 'update_counter' to 'edit_stat' so the receiver understands it
        if (isMultiplayer) sendAction('edit_stat', { cardId: card.id, stat: counterType, value: card[counterType] });
    }
    // Handle Set Counter actions from direct click
    else if (act.startsWith('set-')) {
        const parts = act.split('-');
        const counterType = parts[1]; // ap, token, etc.
        const newValue = parseInt(parts[2], 10); // value is passed via the action payload

        if (newValue === 0) {
            delete card[counterType];
        } else {
            card[counterType] = newValue;
        }

        refreshCard(card);
        // FIX: Changed from 'update_counter' to 'edit_stat'
        if (isMultiplayer) sendAction('edit_stat', { cardId: card.id, stat: counterType, value: card[counterType] });
    }
    else if (act === 'highlight') toggleHighlight(document.getElementById(card.id)); 

	
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
                    faceUp: card.faceUp,   
                    rotated: card.rotated   
                }); 
            }
        }
    }
	
	// 1. Handle Unsummon
    if (act === 'unsummon') {
        // Passive check: Only locks if "Summon Binding" is its own isolated sentence/line, OR if manually applied
        const isPassiveBinding = card.description && /(?:^|<br>|\.\s*)\s*Summon Binding\.?\s*(?=$|<br>|\.\s*)/i.test(card.description);
        
        if (card.summonBinding || isPassiveBinding) {
            alert(`${card.name} is Bound and cannot be Unsummoned!`);
            return;
        }
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
    else if (act.startsWith('special-')) {
        const isDef = act.endsWith('-def');
        const isSet = act.includes('-set-');
        playCardToField(card, card.type, !isSet, isDef);
        
        if (isMultiplayer) {
            const el = document.getElementById(card.id);
            if (el && el.parentElement) {
                sendAction('move', { cardId: card.id, toZone: el.parentElement.id, fromZone: card.loc, faceUp: !isSet, rotated: isDef });
            }
        }
    }
    
    // --- MOVEMENT TO PILES ---
    else if (act === 'hand') {
        const originalLoc = card.loc;
        moveCardTo(card, 'hand');
        if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-hand` });
    }
    else if (act === 'afterlife') {
        const originalLoc = card.loc;
        moveCardTo(card, 'afterlife');
        if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-afterlife` });
    }
    else if (act === 'shadow') {
        const originalLoc = card.loc;
        moveCardTo(card, 'shadow');
        if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-shadow` });
    }
    else if (act === 'oblivion') {
        const originalLoc = card.loc;
        moveCardTo(card, 'oblivion');
        if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-oblivion` });
    }

    // --- MOVEMENT TO DECK ---
    else if (act === 'topdeck') {
        const originalLoc = card.loc;
        moveCardTo(card, 'topdeck');
        if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-deck` });
    }
    else if (act === 'bottomdeck') {
        const originalLoc = card.loc;
        moveCardTo(card, 'bottomdeck');
        if (isMultiplayer) sendAction('move', { cardId: card.id, fromZone: originalLoc, toZone: `${card.owner}-deck`, toBottom: true });
    }
    else if (act === 'randomdeck') {
        const originalLoc = card.loc;
        moveCardTo(card, 'randomdeck');
        if (isMultiplayer) {
            sendAction('move', { 
                cardId: card.id, 
                fromZone: originalLoc,
                toZone: `${card.owner}-deck`, 
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
    card.shieldActive = (card.description || "").includes("Shielded"); 
    
    // --- INITIALIZE AP VISUALS ---
    const apMatch = (card.description || "").match(/(\d+)\s*-\s*AP/i) || (card.description || "").match(/(\d+)\s*AP/i);
    if (apMatch) {
        card.maxAP = parseInt(apMatch[1]);
        card.ap = card.maxAP;
    }

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
	hideCtx();
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
        y = y - menuHeight - 20; 
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
                const timestamp = Date.now(); 

                // 1. WIPE LOCAL PLAYER'S STATE COMPLETELY
                document.querySelectorAll('.card').forEach(el => {
                    const card = findCard(el.id);
                    if (card && card.owner === 'player') el.remove();
                });

                state.player = { lp: 10000, sp: 4, hand: [], deck: [], sideDeck: [], extraDeck: [], afterlife: [], shadow: [], oblivion: [], field: [] };
                updateStats();

                // 2. Helper to check for updated official cards, or fallback to custom
                const processCard = (c, loc) => {
                    const officialCard = allCards.find(dbCard => (dbCard.name || "").toLowerCase() === (c.name || "").toLowerCase());
                    const cardDataToUse = officialCard ? officialCard : c;

                    return {
                        ...cardDataToUse,
                        id: `c-${++idCounter}-${timestamp}`,
                        owner: 'player',
                        originalOwner: 'player',
                        originalZone: loc, // Tracker for Start New Game sorting
                        loc: loc,
                        faceUp: true,
                        rotated: false
                    };
                };

                // 3. Load the new cards in
                state.player.deck = (deckData.main || []).map(c => processCard(c, 'deck'));
                state.player.sideDeck = (deckData.side || []).map(c => processCard(c, 'sideDeck'));
                state.player.extraDeck = (deckData.extra || []).map(c => processCard(c, 'extraDeck'));
                
                shuffle(state.player.deck);
                updateCounts('player');
                
                // 4. Send the new deck to the opponent
                if (isMultiplayer) {
                    sendAction('load_deck', {
                        main: state.player.deck,
                        side: state.player.sideDeck,
                        extra: state.player.extraDeck
                    });
                }
                
                alert('Deck loaded! Click "Start New Game" to draw your hand.');
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
		originalOwner: owner,
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
    // KILL SWITCH: If a socket already exists, disconnect it to prevent "Ghost" listeners
    if (socket) {
        console.log("Disconnecting old socket to prevent duplicates...");
        socket.disconnect(); 
        socket = null;
    }

    // Create fresh connection
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

function executeDirectAttack(cardId) {
    const atkCard = findCard(cardId);
    if (!atkCard) return;

    // Apply damage locally
    const dmg = atkCard.health > 0 ? atkCard.attack : 0;
    executeAction('adjust_lp', { target: 'opponent', amount: -dmg });
    
    // Sync the exact LP to opponent & cancel the battle visual state
    if (isMultiplayer) {
        sendAction('lp', { player: 'opponent', value: state.opponent.lp });
        sendAction('battle_sync', { step: 'cancel' });
    }

    // Cleanup local state
    battleState = { attackerId: null, targetId: null };
    refreshCard(atkCard);
}

function executeBattleLogic() {
    const atkCard = findCard(battleState.attackerId);
    const defCard = findCard(battleState.targetId);
    if (!atkCard || !defCard) return;
	
	// 1. Clear the IDs immediately so the hotkey "un-sticks"
    battleState = { attackerId: null, targetId: null };

    // Detect Keywords
    const atkDesc = atkCard.description || "";
    const defDesc = defCard.description || "";
    const atkHasBreaker = atkDesc.includes("Breaker");
    const atkHasBouncer = atkDesc.includes("Bouncer");
    const atkHasDestructive = atkDesc.includes("Destructive");
    const atkHasPiercing = atkDesc.includes("Piercing");
    const atkHasFragile = atkDesc.includes("Fragile");
    const defHasFragile = defDesc.includes("Fragile");

    // 0 Health Rule: Phantoms with 0 Health deal no damage
    let atkPower = atkCard.health > 0 ? atkCard.attack : 0;
    let defPower = defCard.health > 0 ? defCard.attack : 0;

    // --- SHIELDED LOGIC ---
    if (defCard.shieldActive) { defCard.shieldActive = false; atkPower = 0; }
    if (atkCard.shieldActive) { atkCard.shieldActive = false; defPower = 0; }

    // Apply Health Reductions
    defCard.health -= atkPower;
    atkCard.health -= defPower;

    // --- BATTLE DAMAGE TO LP ---
    if (defCard.health < 0) {
        // Normal: Target in Attack Position
        if (!defCard.rotated) {
            state[defCard.owner].lp -= Math.abs(defCard.health);
        }
        // Piercing: Target in Defense Position
        else if (defCard.rotated && atkHasPiercing) {
            state[defCard.owner].lp -= Math.abs(defCard.health);
        }
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

    // --- FRAGILE CHECK ---
    if (atkHasFragile && atkCard.loc === 'field') applyBreak(atkCard);
    if (defHasFragile && defCard.loc === 'field') applyBreak(defCard);

    // 2. Check for Bouncer (If target is still on field after potential Break/Sturdy)
    if (atkHasBouncer && defCard.loc === 'field') {
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

    const hasSturdy = (targetCard.description || "").includes("Sturdy");
    const sourceHasDestructive = sourceCard && (sourceCard.description || "").includes("Destructive");

    // FIX: Check if Sturdy was already consumed!
    if (hasSturdy && !targetCard.sturdyUsed) {
        targetCard.sturdyUsed = true;
        targetCard.health = 0;
        targetCard.rotated = true;
        refreshCard(targetCard);
        if (isMultiplayer) sendAction('edit_stat', { cardId: targetCard.id, stat: 'sturdyUsed', value: true });
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
	
	// --- GLOBAL RESET CATCHERS ---
    // These must be at the very top so they fire instantly and exit.
    if (type === 'game_start_global') {
        startGame(true); 
        return;
    }
    if (type === 'game_reset_global') {
        resetGame(true); 
        return;
    }
	
	if (type === 'set_first') {
        hostGoesFirst = payload.hostGoesFirst;
        updateTurnVisuals();
        return;
    }
    
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
		
		if (type === 'game_start_global') {
				startGame(true); 
				return;
			}
			if (type === 'game_reset_global') {
				resetGame(true); 
				return;
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

        // --- NEW: Reset state entirely if moving to Piles or Hand ---
        const isPileTarget = ['deck', 'sideDeck', 'extraDeck', 'afterlife', 'shadow', 'oblivion'].some(t => targetId.includes(t));
        if (isPileTarget || targetId.includes('hand')) {
            card.faceUp = true;
            card.rotated = false;
            card.isHighlighted = false;
            card.ap = 0; card.token = 0; card.turncounter = 0; card.counter = 0; card.marker = 0;
            
            // Reset base stats for Phantoms back to default
            if (card.type === 'Phantom') {
                const base = allCards.find(c => (c.name || "").toLowerCase() === (card.name || "").toLowerCase());
                if (base) {
                    card.level = base.level ?? 1;
                    card.attack = base.attack ?? 0;
                    card.health = base.health ?? 0;
                }
            }
        }

        // 4. Place the card in the correct list
        if (zone.classList.contains('hand-area')) {
            card.loc = 'hand';
            state[newOwner].hand.push(card);
            renderHand(newOwner);
        } else if (zone.dataset.type) {
            // It's a pile (Deck, Afterlife, etc)
            const pileType = zone.dataset.type;
            const destList = state[newOwner][pileType];
            
            card.loc = pileType; // FIX: Ensure opponent's memory updates the location!

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
            card.shieldActive = (card.description || "").includes("Shielded");
            const apMatch = (card.description || "").match(/(\d+)\s*-\s*AP/i) || (card.description || "").match(/(\d+)\s*AP/i);
            if (apMatch) {
                card.maxAP = parseInt(apMatch[1]);
                card.ap = card.maxAP;
            }
            state[newOwner].field.push(card);
            zone.appendChild(createCardEl(card));
        }
    }
	
	
	if (type === 'ability_sync') {
        const oldState = { ...abilityState };
        abilityState = payload;
        
        // Refresh involved cards to add/remove glows
        if (oldState.sourceId && oldState.sourceId !== abilityState.sourceId) refreshCard(findCard(oldState.sourceId));
        if (oldState.targetId && oldState.targetId !== abilityState.targetId) refreshCard(findCard(oldState.targetId));
        
        if (abilityState.sourceId) refreshCard(findCard(abilityState.sourceId));
        if (abilityState.targetId) refreshCard(findCard(abilityState.targetId));
        return;
    }
	
	if (type === 'end_turn_sync') {
        currentRound = payload.round;
        globalTurn = payload.turns;
        updateTurnVisuals();
        
        ['player', 'opponent'].forEach(p => { 
            state[p].field.forEach(c => {
                if (c.maxAP !== undefined) { c.ap = c.maxAP; refreshCard(c); }
            }); 
        });
        
        // Host checks for auto-draw here, since they just received the Guest's end turn
        checkAutoDraw();
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
		if (newCard.originalOwner) newCard.originalOwner = flipZoneId(newCard.originalOwner);
        
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
        if (token.originalOwner) token.originalOwner = flipZoneId(token.originalOwner); // FIX
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
        const amt = (payload && payload.amount) ? payload.amount : 1;
        draw(amt, 'player');
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
            card.faceUp = true;      // FIX: Ensure milled cards become visible
            card.rotated = false;
            card.loc = payload.dest; // FIX: Update location instantly
            
            if (payload.dest === 'hand') {
                // IMPORTANT: Put the card in the Hand list in memory
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
        // Wipe all traces of the opponent's previous cards from the screen
        document.querySelectorAll('.card').forEach(el => {
            const card = findCard(el.id);
            if (card && card.owner === 'opponent') el.remove();
        });

        // Reset the opponent's state memory completely
        state.opponent = { lp: 10000, sp: 4, hand: [], deck: [], sideDeck: [], extraDeck: [], afterlife: [], shadow: [], oblivion: [], field: [], handVisible: state.opponent.handVisible };
        updateStats();

        // Load the new cards into the fresh memory
        state.opponent.deck = payload.main.map(c => ({...c, owner: 'opponent', originalOwner: 'opponent', originalZone: 'deck'}));
        state.opponent.sideDeck = payload.side.map(c => ({...c, owner: 'opponent', originalOwner: 'opponent', originalZone: 'sideDeck'}));
        state.opponent.extraDeck = payload.extra.map(c => ({...c, owner: 'opponent', originalOwner: 'opponent', originalZone: 'extraDeck'}));
        updateCounts('opponent');
        alert('Opponent loaded a new deck! Their board and LP were reset.');
	}
}

function setupSocketListeners() {
    // Only set these up once
    socket.off('room_created');
    socket.off('room_joined');
    socket.off('opponent_joined');
    socket.off('game_action');
	socket.off('action_apply'); // <--- This was missing!
    socket.off('receive_deck_ids'); // <--- This was missing!
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
            
            // Just notify the Host, do NOT start the game yet!
            alert("Opponent joined! Click 'Start Game' when you are ready.");
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
		state.player.deck = deckData.opponent.deck.map(c => ({...c, owner: 'player', originalOwner: 'player'}));
		state.player.sideDeck = deckData.opponent.sideDeck.map(c => ({...c, owner: 'player', originalOwner: 'player'}));
		state.player.extraDeck = deckData.opponent.extraDeck.map(c => ({...c, owner: 'player', originalOwner: 'player'}));
		state.opponent.deck = deckData.player.deck.map(c => ({...c, owner: 'opponent', originalOwner: 'opponent'}));
		state.opponent.sideDeck = deckData.player.sideDeck.map(c => ({...c, owner: 'opponent', originalOwner: 'opponent'}));
		state.opponent.extraDeck = deckData.player.extraDeck.map(c => ({...c, owner: 'opponent', originalOwner: 'opponent'}));
		updateCounts('player');
		updateCounts('opponent');
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
			const isHandTarget = targetId.includes('hand');

            // 1. PILES: Always force card back to Original Owner (You can't put your card in opponent's deck/grave)
            if (isPileTarget) {
                if (!mCard.originalOwner) mCard.originalOwner = mCard.owner;
                mCard.owner = mCard.originalOwner;
                
                const pileName = targetId.includes('-') ? targetId.split('-')[1] : targetId;
                targetId = `${mCard.owner}-${pileName}`;

                mCard.rotated = false;
                mCard.faceUp = true; 
                mCard.ap = 0; mCard.token = 0; mCard.marker = 0; mCard.turncounter = 0; mCard.counter = 0;
            } 
            // 2. HANDS: Reset stats, but respect the drop target (Allows stealing cards)
            else if (isHandTarget) {
                mCard.rotated = false;
                mCard.faceUp = true; 
                mCard.ap = 0; mCard.token = 0; mCard.marker = 0; mCard.turncounter = 0; mCard.counter = 0;
            } 
            // 3. FIELD: Keep current stats unless overwritten
            else {
                if (payload.faceUp !== undefined) mCard.faceUp = payload.faceUp;
                if (payload.rotated !== undefined) mCard.rotated = payload.rotated;
            }
            
            let newOwner = targetId.includes('opponent') ? 'opponent' : 'player';
            mCard.owner = newOwner;

            if (targetId.includes('hand')) {
                mCard.loc = 'hand';
                state[newOwner].hand.push(mCard);
                renderHand(newOwner);
                // FIX: If we moved it OUT of a hand, re-render the source hand too!
                if (payload.fromZone && payload.fromZone.includes('hand')) {
                    const sourceOwner = payload.fromZone.includes('opponent') ? 'opponent' : 'player';
                    renderHand(sourceOwner);
                }
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
                if (mCard.loc !== 'field') {
                    mCard.summonedThisTurn = true;
                    // FIX: Initialize AP if this is a fresh summon/drag
                    const apMatch = (mCard.description || "").match(/(\d+)\s*-\s*AP/i) || (mCard.description || "").match(/(\d+)\s*AP/i);
                    if (apMatch) {
                        mCard.maxAP = parseInt(apMatch[1]);
                        mCard.ap = mCard.maxAP;
                    }
                }
                
                mCard.loc = 'field';
                mCard.shieldActive = (mCard.description || "").includes("Shielded");
                
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

// --- EXCAVATE SYSTEM ---
let excavatedCards = [];

function startExcavate(owner, amount) {
    const deck = state[owner].deck;
    excavatedCards =[];
    
    // Physically pull them from the deck memory
    for(let i=0; i<amount; i++) {
        if (deck.length > 0) excavatedCards.push(deck.pop());
    }
    
    if (excavatedCards.length === 0) return;
    updateCounts(owner);

    const modal = document.getElementById('custom-ui-modal');
    const content = document.getElementById('custom-ui-content');
    const imageContainer = document.getElementById('custom-ui-image');
    
    document.getElementById('custom-ui-title').innerText = `Excavate ${amount} - Choose 1 to Draw`;
    
    // Hide the left-side art panel to make room for the horizontal card spread
    if (imageContainer) imageContainer.style.display = 'none'; 

    let html = `<div style="display: flex; gap: 15px; justify-content: center; margin-bottom: 20px; padding: 10px;">`;
    
    excavatedCards.forEach((c, index) => {
        // Fallback image logic
        const typeKey = (c.type || "Phantom").toLowerCase();
        let bg = defaultImages[typeKey] || defaultImages['phantom'];
        if (c.image && c.image.trim() !== "") bg = c.image;
        
        // Inline styles create a mini-card button
        html += `
            <div style="cursor:pointer; width: 14vh; height: 20vh; border: 2px solid #9b59b6; border-radius: 6px; 
                 background-size: cover; background-position: center; background-image: url('${bg}'); 
                 position: relative; box-shadow: 0 4px 8px rgba(0,0,0,0.5); transition: transform 0.1s;" 
                 onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'"
                 onclick="resolveExcavate(${index}, '${owner}')">
                <div style="position:absolute; bottom:0; background:rgba(0,0,0,0.8); width:100%; text-align:center; font-size:12px; padding:4px; font-weight:bold;">${c.name}</div>
            </div>
        `;
    });
    html += `</div><button class="custom-ui-btn custom-ui-cancel" onclick="cancelExcavate('${owner}')" style="margin-top: 10px;">Cancel (Send All to Bottom)</button>`;
    
    content.innerHTML = html;
    modal.classList.remove('hidden');
}

function resolveExcavate(selectedIndex, owner) {
    // Take the chosen card out of the temporary array
    const chosenCard = excavatedCards.splice(selectedIndex, 1)[0];
    
    // 1. Send chosen to Hand
    chosenCard.loc = 'hand';
    state[owner].hand.push(chosenCard);
    renderHand(owner);
    if (isMultiplayer) sendAction('mill', { owner, source: 'deck', dest: 'hand', cardId: chosenCard.id });

    // 2. Send the rest to Bottom of Deck
    excavatedCards.forEach(c => {
        state[owner].deck.unshift(c); 
        // We sync a move command so the opponent's count stays perfectly accurate
        if (isMultiplayer) sendAction('move', { cardId: c.id, fromZone: 'field', toZone: `${owner}-deck`, toBottom: true });
    });

    cleanupExcavate();
}

function cancelExcavate(owner) {
    excavatedCards.forEach(c => {
        state[owner].deck.unshift(c);
        if (isMultiplayer) sendAction('move', { cardId: c.id, fromZone: 'field', toZone: `${owner}-deck`, toBottom: true });
    });
    cleanupExcavate();
}

function cleanupExcavate(owner) { excavatedCards =[]; document.getElementById('custom-ui-modal').classList.add('hidden'); document.getElementById('custom-ui-image').style.display = 'block'; }