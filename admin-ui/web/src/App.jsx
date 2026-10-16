// admin-ui/web/src/App.jsx
import { useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { api } from './api.js';
import './styles.css';

export default function App() {
    const [loggedIn, setLoggedIn] = useState(null); // null = checking

    useEffect(() => {
        api.listClients()
            .then(() => setLoggedIn(true))
            .catch(() => setLoggedIn(false));
    }, []);

    if (loggedIn === null) {
        return <div className='flex min-h-dvh items-center justify-center bg-ink font-mono text-sm text-ash/40'>loading…</div>;
    }
    if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;
    return <Dashboard />;
}
