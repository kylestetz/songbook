import { createRoot } from 'react-dom/client';
import '../core/styles/theme.css';
import '../core/styles/content.css';
import '../core/styles/widgets.css';
import './styles/app.css';
import './styles/editor.css';
import { App } from './App';
import { loadAppearance } from './appearance';
import { applyTheme } from '../core/themes';

// Apply the saved theme before the first render so there is no flash of the default.
const appearance = loadAppearance();
applyTheme(appearance.theme, appearance.scheme);

createRoot(document.getElementById('root')!).render(<App />);
