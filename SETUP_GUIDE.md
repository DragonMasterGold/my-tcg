# TCG Client - Menu & Deck Builder Setup

## New Files Added

1. **menu.html** - Main menu/home screen
2. **deckbuilder.html** - Deck builder interface
3. **deckbuilder.css** - Deck builder styling
4. **deckbuilder.js** - Deck builder logic
5. **cards.json** - Card database (50 sample cards)

## File Structure

```
tcg-game/
  ├── menu.html          (START HERE - main menu)
  ├── index.html         (the game itself)
  ├── deckbuilder.html   (deck builder)
  ├── deckbuilder.css
  ├── deckbuilder.js
  ├── cards.json         (card database)
  ├── style.css          (game styles)
  └── game.js            (game logic)
```

## How to Use

### 1. Start at Menu
- Open **menu.html** in your browser
- This is your main hub

### 2. Build a Deck
- Click "Deck Builder" button
- **Left side** = All available cards
- **Right side** = Your current deck
- **Search bar** = Filter cards by name
- **Type filters** = Show only Monster/Spell/Trap/etc
- **Click cards** on left to add them to deck
- **Click cards** on right to remove them
- **Tabs** = Switch between Main/Extra/Side deck views
- **Save Deck** = Downloads as .json file
- **Load Deck** = Upload previously saved .json file

### 3. Deck Rules
- **Main Deck:** 30-50 cards (required)
- **Extra Deck:** 0-5 cards (optional)
- **Side Deck:** 0-15 cards (optional)
- Stats turn green when valid, red when invalid

### 4. Play the Game
- From menu, click "Play Game"
- Opens the game (index.html)
- Currently uses random test decks
- **TODO:** Game needs to be updated to load custom decks

## Customizing Cards

### To add your real cards:

1. **Edit cards.json**
   - Replace sample cards with your actual cards
   - Keep the same format:
   ```json
   {
     "id": "unique_id",
     "name": "Card Name",
     "type": "Monster/Spell/Trap/Field/Balance",
     "description": "What the card does"
   }
   ```

2. **Add card images** (future)
   - You can extend the card object to include image paths
   - Example: `"image": "card_images/dragon_knight.png"`

## Next Steps

### Connecting Deck Builder to Game:

The deck builder saves decks as JSON files. To use them in the game, you'll need to:

1. Add a "Load Deck" option to the game's start screen
2. Read the saved deck JSON file
3. Replace the test deck generation with loaded cards

Would you like me to add this functionality next?

## Tips

- **Save decks often** - No auto-save yet
- **Keep backups** - Save multiple versions
- **Test in-game** - Make sure deck size is valid before saving
- **Export/Import** - Share decks with friends as JSON files

## Current Limitations

- No deck validation rules beyond count (e.g., card limits, ban list)
- No card images yet (just colored blocks with names)
- Deck builder doesn't know what cards are in your Obsidian database yet
- Game doesn't load custom decks yet (needs integration)

## Coming Soon

Phase 3 features to add:
- Import cards from your Obsidian files
- Add card images
- Link deck builder to game
- Advanced deck stats (type distribution, SP curve, etc.)
- Deck testing/simulation

Let me know what you want to tackle next!
