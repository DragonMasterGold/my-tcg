My TCG Vibe Coding Road Map:

Bigger Macro Overview Things To Figure Out:
Is this current development method the best way to be going about this? Is JavaScript and such the best language and thing to be using here?
Are there things that will need to be re-worked eventually? Code re-written? Things re-built? If so? What? When? Where? How?
What is the best things to do now for establishing the best possible foundation for this game development in the long term?


Simulator Adjustments Wanted Easy:
If a card Breaks in Battle (loses its health and has a Break function applied to it), it still shows its stats and level while in the Discard Piles.


 
Simulator Adjustments Wanted (Middling Difficulty):
Deck Builder:
Simulator Adjustments Wanted (Middling Difficulty):
Deck Builder:
Make Deck Builder view have 5 card columns displayed, so it is displaying 5 cards.
Make Current Deck View have 6 card columns displayed, so it is displaying 6 cards.
Make sure the deck part of the deck builder doesn't have cards going off the screen and causing a scroll bar to appear.

Also make the current selection of options: All, Phantoms, Spirits, Counters. Remain as they are, but make add a dropdown arrow button that extends the search/filter section down lower.
Make Environments button the same size as the other buttons.

 
Simulator Adjustments Low Impact:
The two Show hand buttons syncing the glow in multiplayer.
The coin/dice/token buttons glow syncing in multiplayer.
Activating your own set Counter/Spirit card should flip it up. (Only applied to your own set face down Counter/Spirit cards.)

Add custom card-back-artwork to the cards.

 
Simulator Adjustments Wanted (Hard):

Make the Card Info box draggable or context dependent on where it will open, such as while a deck is open, or the position of the card being clicked on.
(We need to think through a concise Design Doc for this). 



Simulator Adjustments Unsure On Fixes:
Hands are going out of sync in multiplayer still.
Sometimes a card just doesn’t get synced quite right?

 
Simulator Stage 2 Adjustments:
Right Click Menu Re-Work:
Have the right click menus have the function to click a menu option to open a net of options to the side.

Such as:

Move To:
(Clicking on it to open another set of menu options to the side. Which would have all the move options:)

To Hand
<Break>
To Deck (Random)
To Deck Top
To Deck Bottom
<Break>
To After Life
To Shadow Realm
To Oblivion

Phantoms can have sub menus for Play options.
Attack.
Defense.
<Break>
Set Attack
Set Defense

Special Summon would fetch the same set of options.

Spirits/Counters/Environments wouldn't need this nesting since they only get 2 choices.


And I think a menu option for Add To Card:

Add an AP
(Hidden unless applicable) an AP.
<Break>
Add a Token
(Hidden unless applicable) Remove a Token
<Break>
Add a Marker.
(Hidden unless applicable) Remove a Marker
<Break>
Add a Turn Counter
(Hidden unless applicable) Remove a Turn Counter

(I would also like it if each of these things that their visual can be added can be clicked on to type a new number to change the number on them directly. And when 0 is typed it would disappear again).
These re-works should maintain the hotkey labels.
These re-works should not break any of the functionality of the menus.



 
Further Keyword Automations:
[We will need a really well developed Design Doc for all of this. To structure how to get Keyword Abilities, Targeting, Ability Menus, and Specific Card Abilities / Code functioning in the best way possible and have the foundations built correctly from the beginning. Making it clear in the Design Doc what the whole eventual game play structure will look like and function, with specified long term goals. While explaining we are just building out the basic foundation for now.]
Find / put together a list of more keywords that can easily be automated.
(Context lots of cards and their card text, alongside some keywords need to be standardized. And that during these early Alpha stages all sorts of cards or keywords are going to continue to be adjusted.)
Figure out further logic for automating Keywords.


In game pop up boxes:
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
