# LoreMaster shell artwork — slots, sources and licensing (Phase 1)

## Slots

The shell's pictures are data, not markup: `games/openworld/client/src/shell/artwork.ts` defines
the four kinds and how each is framed.

| Kind            | Used by                          | Wide frame | Stacked frame | Overlay edge |
| --------------- | -------------------------------- | ---------- | ------------- | ------------ |
| `world-cover`   | Discover, Home's Discover card   | 4:3        | 16:9          | inline-end   |
| `story-cover`   | Home's featured story card       | 16:10      | 16:9          | bottom       |
| `library-thumb` | Library rows                     | 1:1        | 16:9          | bottom       |
| `act-cover`     | A save's act (when authored)     | 16:9       | 16:9          | bottom       |

`contracts.ts` records the act slot as `ACT_COVER` (16:9, `cover`, safe margin 6%). **No act
illustrations are authored yet**: `ActInfo.art` is the field that will carry them, and until it is
set a save in that act falls back to the story cover, then to the shell's own fallback treatment.

## Fallback

`artMarkup()` always renders the frame. With no file, or when the image fails to load, the frame keeps
the `.missing` state and shows the shell's glyph treatment. No card depends on a picture existing.

## Assets in this repository

| File                                        | Slot          | Source                                                       | Licensing                                     |
| ------------------------------------------- | ------------- | ------------------------------------------------------------ | --------------------------------------------- |
| `games/openworld/public/assets/shell/world-openworld.jpg` | `world-cover` | Generated for this project with Freebuff's image generator, from the world's own motifs (river ford, fog, lanterns, seals) | Original project asset, no external rights holder |
| `games/openworld/public/assets/shell/story-five-seals.jpg` | `story-cover`, `library-thumb` | Generated for this project with Freebuff's image generator, from the story's own premise (the first seal breaking) | Original project asset, no external rights holder |

No franchise or third-party artwork was imported or referenced. The shell's illustrations are
cinematic paintings; the game's pixel art under `assets/lsw/` is untouched and remains the game's own.
