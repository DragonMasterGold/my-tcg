# TCG Client - Menu & Deck Builder Setup

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
- This is your main hub

### 2. Build a Deck
- Click "Deck Builder" button
- **Left side** = Card info
- **Middle** = All available cards
- **Right side** = Your current deck(s)
- **Search bar** = Filter cards by name
- **Save Deck** = Downloads as .json file
- **Load Deck** = Upload previously saved .json file

### 3. Deck Rules
- **Main Deck:** 30-50 cards (required)
- **Extra Deck:** 0-5 cards (optional)
- **Side Deck:** 0-15 cards (optional)

### 4. Play the Game
- From menu, click "Play Game"
- Opens the game
