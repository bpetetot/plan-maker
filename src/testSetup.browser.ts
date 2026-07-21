// Browser-project setup. The app is laid out entirely with absolutely
// positioned overlays over a 100vw/100vh SVG; without the stylesheet they fall
// back into the flow and tests would probe a layout that exists nowhere in
// production — and Vitest locators check actionability against it.
import { afterEach } from 'vitest'
import { blur } from './editor/testKit'
import './styles.css'

// Held keys live in a singleton tracker that outlives the component tree, so a
// test ending mid-hold would leak Alt into the next one. Blur is the tracker's
// own release path rather than a reach into its internals — and it is what a
// real session does between two windows.
afterEach(() => blur(window))
