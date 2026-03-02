My TCG Vibe Coding Road Map:


Simulator Adjustments Wanted Easy:


Activate Ability Vibe Coding:

Keyword Automations:

Summon Binding should not show up as an Activatable Ability.

Attack/Health/Stat Increase Abilities without a number are being parsed and show up as an Ability to activate. But they currently a lot of the time don’t do anything. They should just by default have a pop up to enter a prompt to increase the Attack/Health/Stat by the input amount.

When a Phantom has the Equip Card keyword, it should function like this while in the hand.
If Activated it plays to Spirt/Counter cards (like a Spirit Card would be played). It should have its level/SP set to 0. It should have its stats also set to 0.

Stat Swap.



 
Simulator Adjustments Wanted (Middling Difficulty):




 
Simulator Adjustments Low Impact:
The two Show hand buttons syncing the visual glow in multiplayer.
The coin/dice/token buttons having visual glow syncing in multiplayer.
Activating your own set Counter/Spirit card should flip it up.

Add custom card-back-artwork to the cards.

Settings menu replaced with a Controls menu. (Which has a simple pop up that displays the hotkeys and controls).

 
Simulator Adjustments Wanted (Hard):

Make the Card Info box draggable or context dependent on where it will open, such as while a deck is open, or the position of the card being clicked on.
(We need to think through a concise Design Doc for this). 



Simulator Adjustments Unsure On Fixes:

 
Simulator Stage 3 Adjustments:


Further Keyword Automations:
[We will need a really well developed Design Doc for all of this. To structure how to get Keyword Abilities.]
Find / put together a list of more keywords that can easily be automated.


In game pop up boxes / menus:
We will importantly need Diegetic pop up boxes in game, rather than a browser pop up. For inputting information, informing information to the player, and to eventually have a yes/no mechanical pop up option. (Potentially also for utilizing Abilities).

 
Activating Abilities Function.
Figuring out how to have Ability Activation which takes into account Costs.
Such as “Discard this card and Gain 1 SP.”
“Do this to do this” logic being dynamically achieved somehow?
Like setting up the understanding for Discarding (or at least Discarding for cost) and the understanding for the positive (like draw a card or gain an SP) and just dynamically combine them.


Targeted Break a Spirit/Counter.
Abilities having a Counter cost and needing Counters to activate and automatically deducting them on resolution.
Copy working on activation (cloning the activating card with its current stats).

Ability Points / AP automatically being tracked with a visual display (that has a manual adjustment option).



 
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

