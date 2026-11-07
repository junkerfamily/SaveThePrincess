# Saving Sabrina

Princess Sabrina is locked at the top of Thornspire Tower. Climb six floors of push-the-crate puzzles to save her.

- Push crates, fill water with crates to make bridges, smash cracked rocks with the hammer, block gargoyle glares, hold gates open with pressure plates, and brew a key in the witch's cauldron (push the ingredients in, in the order on the menu).
- There's a secret: one crate on floor 1 is hiding a trapdoor (listen for it snoring). Push it aside to climb down to the hidden basement, where a sleeping dragon breathes fire across the room on every third move. Smoke from its nose warns you one move ahead, and crates block the flames. Grab its hoard and take the stairs back up to floor 1, which waits just as you left it. Clever pushers can jam a crate into the dragon's mouth on all three rows: it chokes on its own smoke, falls asleep for good, and coughs up a magic key that opens the gem-covered chest next to Sabrina on the top floor. Inside is a treasure map (to be continued…). The basement doesn't count toward the six floors. Once you've found it, it gets a 🐉 button in the floor picker and shows up under the tower.
- When the screen is wide enough, a cutaway of the tower sits beside the board and shows which floor you're on. Your little knight walks along with you and climbs the stairs when you clear a floor.
- Arrows / WASD to move, Space to swing the hammer, Z to undo, R to restart, M for all sound on/off, N for music on/off. On phones, use the on-screen pad or swipe.

## Files
- `index.html`: page and styles
- `logic.js`: game rules (no DOM, so it can run in Node)
- `levels.js`: the six floors plus the hidden basement, drawn as text maps (legend at the top of `logic.js`)
- `music.js`: a looping tune for each floor (and the basement), written as notes (no sound files)
- `game.js`: drawing, sound effects, input and screens

## Jumping to a floor

Add `?floor=` and a floor number to the address to go straight to that floor, for testing or for skipping ahead:

- https://junkerfamily.github.io/SaveThePrincess/?floor=5 (the Witch's Kitchen)
- https://junkerfamily.github.io/SaveThePrincess/?floor=6 (Sabrina's Chamber)
- https://junkerfamily.github.io/SaveThePrincess/?floor=b (the hidden basement)

It also unlocks every floor up to that one in the floor picker on that device.
