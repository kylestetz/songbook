import { createRoot } from 'react-dom/client';
import '../core/styles/theme.css';
import '../core/styles/content.css';
import '../core/styles/widgets.css';
import './styles/app.css';
import './styles/editor.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
