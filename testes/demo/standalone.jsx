import React from 'react';
import ReactDOM from 'react-dom/client';
import DemoStudio from './DemoStudio';
import { ThemeProvider } from '../../frontend/src/components/ThemeProvider';
import '../../frontend/src/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider><DemoStudio standalone /></ThemeProvider>
  </React.StrictMode>,
);
