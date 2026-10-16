// admin-ui/web/src/pages/Login.jsx
import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLoggedIn }) {
    const [user, setUser] = useState('admin');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        try {
            await api.login(user, password);
            onLoggedIn();
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <div className='flex min-h-dvh items-center justify-center bg-ink px-4 py-[max(1rem,env(safe-area-inset-top))]'>
            <form
                onSubmit={handleSubmit}
                className='login-form w-full max-w-sm rounded-xl border border-line bg-panel p-8 shadow-2xl shadow-black/40'
            >
                <div className='mb-7 flex items-center gap-2.5'>
                    <span className='h-2 w-2 shrink-0 rounded-full bg-signal animate-pulseline' aria-hidden='true' />
                    <h1 className='font-display text-xl font-semibold tracking-tight text-ash'>OpenFlux Admin</h1>
                </div>
                <label className='mb-4 block text-sm font-medium text-ash/60'>
                    User
                    <input
                        value={user}
                        onChange={(e) => setUser(e.target.value)}
                        autoFocus
                        className='mt-1.5 w-full rounded-md border border-line bg-ink/60 px-3 py-2 font-sans text-sm text-ash outline-none transition focus:border-signal focus:ring-1 focus:ring-signal/40'
                    />
                </label>
                <label className='mb-6 block text-sm font-medium text-ash/60'>
                    Password
                    <input
                        type='password'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className='mt-1.5 w-full rounded-md border border-line bg-ink/60 px-3 py-2 font-sans text-sm text-ash outline-none transition focus:border-signal focus:ring-1 focus:ring-signal/40'
                    />
                </label>
                {error && <p className='error mb-5 rounded-md border border-fault/30 bg-fault/10 px-3 py-2 text-sm text-fault'>{error}</p>}
                <button
                    type='submit'
                    className='w-full rounded-md bg-signal px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-signal/40 active:scale-[0.98] active:brightness-95'
                >
                    Log in
                </button>
            </form>
        </div>
    );
}
