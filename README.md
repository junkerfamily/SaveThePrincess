# Saving Sabrina

Princess Sabrina is locked at the top of Thornspire Tower. Climb six floors of push-the-crate puzzles to save her.

- Push crates, fill water with crates to make bridges, smash cracked rocks with the hammer, block gargoyle glares, hold gates open with pressure plates, and brew a key in the witch's cauldron (push the ingredients in, in the order on the menu).
- When the screen is wide enough, a cutaway of the tower sits beside the board and shows which floor you're on. Your little knight walks along with you and climbs the stairs when you clear a floor.
- Arrows / WASD to move, Space to swing the hammer, Z to undo, R to restart, M for all sound on/off, N for music on/off. On phones, use the on-screen pad or swipe.

## Files
- `index.html`: page and styles
- `logic.js`: game rules (no DOM, so it can run in Node)
- `levels.js`: the six floors, drawn as text maps (legend at the top of `logic.js`)
- `music.js`: a looping tune for each floor, written as notes (no sound files)
- `game.js`: drawing, sound effects, input and screens

## Jumping to a floor

Add `?floor=` and a floor number to the address to go straight to that floor, for testing or for skipping ahead:

- https://junkerfamily.github.io/SaveThePrincess/?floor=5 (the Witch's Kitchen)
- https://junkerfamily.github.io/SaveThePrincess/?floor=6 (Sabrina's Chamber)

It also unlocks every floor up to that one in the floor picker on that device.
