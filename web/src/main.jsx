import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// React.StrictMode intentionally double-invokes effects in development
// to help detect side effects and potential issues. This causes duplicate
// API requests in dev mode, but won't happen in production builds.
// The stores have guards to prevent concurrent fetches of the same resource.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
