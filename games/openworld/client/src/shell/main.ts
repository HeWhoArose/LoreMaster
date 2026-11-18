// The shell's page boots: the game's definition (so its saves, looks and words are the world's own), its styles, and
// the application itself. The pixel game is not started here: every play action hands off to the game's page.

import '../register.ts'
import './styles.css'
import { mount } from './app.ts'

const root = document.getElementById('shell')
if (root) void mount(root)
