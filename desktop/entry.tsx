import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../app/page';
import '../app/globals.css';
import '../app/crm-v5.css';
createRoot(document.getElementById('root')!).render(<App/>);
