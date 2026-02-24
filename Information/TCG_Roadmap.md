My TCG Vibe Coding Road Map:


Simulator Adjustments Wanted Easy:
Direct Attack is not syncing for the opponent. (The Attack sees the Life Points go down. But the player being Attacked / not doing the action does not see the Life Points change).
Also Direct Attacking does not turn off the Attack glow for the other player viewing the action.

Pressing B on a Phantom that has Initiated attack, while the player is able to direct attack, should initiate the direct attack, with a second press of B confirming it.
Pressing the B hotkey on the Phantom / Initiating a Direct Attack should Highlight the Attacking Phantom with the same highlight as a Phantom being Targeted for an Attack. To help visually denote the Direct Attack is coming.

If a card Breaks in Battle, it still shows its stats and level while in the Discard Piles (in the After Life).

Cards that are rotated or flipped when sent to the discard piles are not being synced properly for the opponent. The opponent sees them as still being rotated or flipped while in the Discard pile. (The player doing the action sees things correctly.)


For some reason you cannot properly view and see the cards in the opponent’s discard piles. You should be able to open any of the opponent’s Discard Piles and see all the cards in them.




 
Simulator Adjustments Wanted (Middling Difficulty):

- / + hotkeys working on hover over various items to add or subtract from them. Level/AP/Tokens/Markers/Counters gain one and lose one if hotkey is pressed on them. Phantom Attack and Health gain 100 and lose 100 if hotkey is pressed on them.

Make sure old decks load in updated versions of cards. 
Currently saving a deck (in the deck builder) saves it as a .json file with all the card’s current info.
So when they are loaded it is just loading cards based on the saved json.
How exactly would be the best way to go about changing/fixing this? So updated cards are what is loaded in?
(Though I do like being able to easily play with older card versions and letting people easily add custom cards to their deck. Though maybe the json file is too easy as a method for that and we just need a different way to play with customized cards).

Start new game should be syncing for both players.

When a card starts in a particular player’s deck, even if control shifts during the game to the other player, when that card leaves the field to basically anywhere, it should be going to the original player’s discard piles or deck.


Deck Builder:
Implement search working with A: Archetype Name being functional.
Along with Set: # working to search by set.
And Lvl: working for Level too.

Update Deck Builder how to use section to include Archetype searches info.
You can search by Archetype, Level, Attack, Health, and Set by typing any of those into the Search by with a : after.
A: also works for Archetypes.
Atk: – HP: – Lvl: – All also work.

Have the current number of cards being displayed in the Deck Builder displayed somewhere.
Looking like:
Cards: (#)




 
Simulator Adjustments Low Impact:

The two Show hand buttons syncing the glow in multiplayer.
The coin/dice/token buttons glow syncing in multiplayer.
Activating your own set Counter/Spirit card should flip it up.
Add custom card-back-artwork to the cards.

Settings menu replaced with a Controls menu. (Which has a simple pop up that displays the hotkeys and controls).

 
Simulator Adjustments Wanted (Hard):

Make the Card Info box draggable or context dependent on where it will open, such as while a deck is open, or the position of the card being clicked on.
(We need to think through a concise Design Doc for this). 



Simulator Adjustments Unsure On Fixes:
Hands are going out of sync in multiplayer still. (Needs play-testing to figure out the cause).
Sometimes a card just doesn’t get synced quite right? (Needs play-testing to figure out the cause).

 
Simulator Stage 2 Adjustments:


Further Keyword Automations:
[We will need a really well developed Design Doc for all of this. To structure how to get Keyword Abilities, Targeting, Ability Menus, and Specific Card Abilities / Code functioning in the best way possible and have the foundations built correctly from the beginning. Making it clear in the Design Doc what the whole eventual game play structure will look like and function, with specified long term goals. While explaining we are just building out the basic foundation for now.]
Find / put together a list of more keywords that can easily be automated.
(Context lots of cards and their card text, alongside some keywords need to be standardized. And that during these early Alpha stages all sorts of cards or keywords are going to continue to be adjusted.)
Figure out further logic for automating Keywords.


In game pop up boxes / menus:
We will importantly need Diegetic pop up boxes in game, rather than a browser pop up. For inputting information, informing information to the player, and to eventually have a yes/no mechanical pop up option. (Potentially also for utilizing Abilities).

 
Activating Abilities Function.
So that certain Keywords and eventually full cards can be activated and have their Ability go off.
Such as Stat Swap. Or Cycle. And so on.
Have the Ability function have options to choose from when applicable.
With a pop up similar to Master duel, where there are either tabs or a list of Abilities that can be clicked. With the list always including a Cancel option.
Would it then be possible to set up something like targeted Damage? Using a similar system as how Attack and Battle functions?
So it would go:
Activate Ability. Target a Card. Initiate Ability.
Targeted Deal ### Damage.
The same thing could also work for Abilities that Targeted increase a Cards Attack or Health or Stats (both). Or decrease them.
It would also be fantastic to set up Targeted Break through this as well.
And Targeted Discard, Banish, and Destroy.
And Targeted Break a face down card.
And Targeted Break a Spirit/Counter.
Abilities having a Counter cost and needing Counters to activate and automatically deducting them on resolution.
Create and Clone automatically working on activation (either cloning the card or spawning the correct card at the correct stats).
Ability Points / AP automatically being tracked with a visual display (that has a manual adjustment option). Visual display could be mirrored on the other side of the level when applicable.

Could we also set up smart logic through this as well? Such as “Discard this card and Gain 1 SP.”
“Do this to do this” logic being dynamically achieved somehow?
Like setting up the understanding for Discarding (or at least Discarding for cost) and the understanding for the positive (like draw a card or gain an SP) and just dynamically combine them.

Activate button added to menus. E hotkey moved to Activate. Activate does the highlight.
(Highlight stays as an option. Or maybe we change it to be Target or something instead? Nah, we still need a way to quickly communicate about cards, that aren’t related to a specific mechanic.)
We need to work out how to most intuitively and seamlessly handle activating an ability, then targeting a card for it to be applied to.


 
Simulator High Impact Adjustments:

Drafting Package: 
(All of these should be bundled together to only have to put together one set of code. Which can handle determinations for each one. Like the code for pulling cards would work for each one. The code for deciding card pool should work for each one. And saving your pulls. The code for Arena and Drafting should work for each other mostly, in terms of selecting which card you want from a selection. We should build it in a way that further drafting and pack features can be added later.).

Card Packs and Drafts should have options to customize what cards are in them. With these customizations being saved.

Card Pack Simulator: Open packs of randomly generated cards.

Arena Draft: Get 3 cards to choose from to be added to your deck. Draft a full deck.

Drafting: Choose from a selection of cards. The draft of the remaining cards would then be presented to the other players in the Draft. There would be multiple sets of cards cycling around.  Each player would pick a card from each set, until the first one cycled back to them. They would continue until all cards have been picked.

Cube Drafting: This functions the same as Drafting. These would probably just be the same feature basically. But there should be an option to upload your own curated collection of cards that would then be drafted from.





 
Official Launch Adjustments Needed:
Official card borders and templates developed. (Art needed from me and my artists).
MSE template(s) made. (Help editing templates for my needs/wants).
Archetype images. (Art needed from me and my artists).
Rank 2 Cards developed and added. (Cards designed by me).


Simulator Adjustments Uncategorized:
How can we most easily and intuitively implement a way to reveal cards from the deck? Like revealing the top 3 cards and then drawing a chosen one (or not drawing). Then them being placed back in the same order.

Mulligan system properly added. (Added in a way that the number of cards can easily be adjusted later, if the gameplay changes or for alternate formats). 

Turn Tracking:
The game should keep track of the turn and round. Every two turns is a round (Player 1 goes first. Then Draw Phase. Then Player 2 takes their turn. When player 2 ends their turn Round 1 ends). 
There should be a turn and round counter somewhere. Let’s place it on the right side of the middle bar for now. They should look simple and clean and automatically adjust when the turn(s)/round(s) change.
In the center of the middle divider, between the End Turn and Draw Buttons, there can be two little lights on top of each other that turn on and off based on which player’s turn it is.
When the end turn button is pressed the current turn should end and the next turn should start.

Turn Counter: An option added to a card menu while on field. It counts up from zero once added. Every Turn End it goes up by one.

Game should have a choice of going first or second.

Game should have an option for playing Rock-Paper-Scissors.



 
Simulator Adjustments For Later:
(These concepts can be implemented earlier or when they make sense to be worked on. I just have them placed in this section for now).


Settings menu (and settings). (This might be less than good since information isn’t being saved currently anyways).


Alternate Game Mode Formats:
(These current ideas are all easily done through manually doing them currently so low priority).
The ability to make game rule adjustments when starting a game.
Summoning Points start at 1 on turn one. Then tick up by +1 every turn, until each player has 10 Summoning Points per turn.
Summoning Points start at 2 on turn one. Then go back to the normal 4 per turn after that.
Starting hand size.

Semi-Automatic Mode:
Includes / rolls in the SP calculations button.
Has prompting for actions and Abilities which can be interacted with.
Visual indications for activatable cards.


 
Visual Gameplay Notes:
Eventually the field needs a re-work. To be more like other Yugioh dueling sims/master duel. (And will need a well-developed Design Document to properly guide the production.)


Sounds:
Eventually made and implemented.
 
Release Development:
These notes are mostly brain storming and more long term road map ideas on how to go about an official Early Access Release.

Add login in and server information saving to the game.
I could sell the ability to play. 
(You need like a unique ID key or something that becomes attached to your account. Then you need to login to that account to play. Not locked in to be figured out more later).

I could sell sets of cards.
Where an account could only deck build and (somehow figure out) load a deck with cards they own on that account.

I could have a monthly sub place where players get access to the latest updates and card sets.
(Perhaps coded/set up and integrated in a way that they only maintain access to everything while subbed?)

I could set up art commissions as a reward tier, or a purchasable item. Where for a certain $ amount a user can commission art to be made for a card.
This could either/or be used to help fund the art of the game.
And/or be used for people to commission Alternate artwork for the cards to be added into the game.


Release Development:
These notes are mostly brain storming and more long term road map ideas on how to go about an official Early Access Release.

Add login in and server information saving to the game.
I could sell the ability to play. 
(You need like a unique ID key or something that becomes attached to your account. Then you need to login to that account to play. Not locked in to be figured out more later).

I could sell sets of cards.
Where an account could only deck build and (somehow figure out) load a deck with cards they own on that account.

I could have a monthly sub place where players get access to the latest updates and card sets.
(Perhaps coded/set up and integrated in a way that they only maintain access to everything while subbed?)

I could set up art commissions as a reward tier, or a purchasable item. Where for a certain $ amount a user can commission art to be made for a card.
This could either/or be used to help fund the art of the game.
And/or be used for people to commission Alternate artwork for the cards to be added into the game.

KS Rewards Idea:
Perhaps some rewards could be in game cosmetics?
Like card sleeves.
Alt Art on cards.
More icon art.

