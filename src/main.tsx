import { createRoot } from 'react-dom/client'
import App from './App'
// Mono typography for wall Dimensions, Room areas and Placement dimensions —
// latin subsets only, precached by the service worker for offline use
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
