# Roo TCG Simulator Knowledge Base

This file serves as a consolidated technical reference for the TCG project, capturing current system logic, planned features, and architectural understanding.

## 1. Project Overview
- **Goal:** High-quality online TCG play-testing experience.
- **Theme:** Dark blue/black UI (#3498db accents).
- **Core Loop:** Manual -> Semi-Auto -> Full-Auto simulation.

## 2. Battle System Structure (Current)
- **State Management:** Tracked via `battleState` { attackerId, targetId }.
- **Input:** 
  - `B` Key: Toggles through (Set Attacker -> Set Target -> Execute).
  - `N` Key: Cancels current battle selection.
- **Logic Execution:** `executeBattleLogic()` calculates:
  - Phantom HP reduction.
  - Excess damage to LP (if target is in Attack position).
  - Break application (sent to Afterlife).
  - Keyword processing (Breaker, Bounce, Destructive).

## 3. Automation Requirements (Rulebook Alignment)
- **Direct Attacks:** 
  - Valid only if opponent has no Phantoms on field.
  - Restricted for Phantoms on the turn they were summoned.
  - Triggered by `B` key targeting when field is empty.
- **0-Health Rule:**
  - Phantoms with 0 Health deal 0 damage.
  - Phantoms surviving at 0 Health (via Sturdy) are forced to Defense (`rotated = true`).
- **Unsummon Restrictions:**
  - Phantoms cannot be Unsummoned if they have Battled this turn.
- **Cost Automation:**
  - Summoning Phantoms costs SP = Level.
  - Unsummoning refunds SP = Current Level.
  - `autoSP` toggle allows manual overrides.

## 4. Multi-Player Sync Architecture
- **Protocol:** Socket.io with room-based communication.
- **State Sync:** Most major actions (moves, flips, rotations, stat changes) emit `sendAction`.
- **Battle Sync:** `battle_sync` steps ('init', 'target', 'cancel') are mirrored to show the opponent what is being targeted in real-time.

## 5. Planned UI Improvements
- **Pop-ups:** Transition from browser `prompt()` and `alert()` to diegetic HTML/CSS modal windows.
- **Turn Tracking:** Implementation of an automated Turn/Round counter.
- **Keyword Tooltips:** Enhanced keyword injection for all card description text.
