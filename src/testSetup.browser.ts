// Browser-project setup. The app is laid out entirely with absolutely
// positioned overlays over a 100vw/100vh SVG; without the stylesheet they fall
// back into the flow and tests would probe a layout that exists nowhere in
// production — and Vitest locators check actionability against it.
import './styles.css'
