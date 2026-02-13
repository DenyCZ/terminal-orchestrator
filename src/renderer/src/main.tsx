import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '../styles/index.css'

// Initialize electron API
window.electronAPI?.init()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
