// The stylesheet is load-bearing: without it the absolute overlays fall back
// into the flow, and Vitest locators check actionability against that layout.
import { afterEach } from 'vitest'
import { blur } from './editor/testKit'
import './styles.css'

// The held-key tracker is a singleton outliving the tree: a mid-hold test leaks
// Alt into the next.
afterEach(() => blur(window))
