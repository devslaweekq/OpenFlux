// admin-ui/web/src/components/ClientList.jsx
import { useState } from 'react';
import { api } from '../api.js';
import { maskUrl } from './clientListUtils.js';

const STATUS_DOT = {
    running: 'bg-signal animate-pulseline',
    exited: 'bg-fault',
    missing: 'bg-fault',
};

export default function ClientList({ clients, onSelect }) {
    const [revealed, setRevealed] = useState({});

    async function reveal(name) {
        // The share link carries the encryption key, so it's the one thing
        // worth pasting into the app -- fall back to the bare document url
        // only for clients created before this existed, or if capturing the
        // link failed at create time.
        const { link } = await api.getClientLink(name);
        const value = link || (await api.getClientUrl(name)).url;
        setRevealed((prev) => ({ ...prev, [name]: value }));
        return value;
    }

    async function copy(name) {
        const value = revealed[name] || (await reveal(name));
        await navigator.clipboard.writeText(value);
    }

    if (clients.length === 0) {
        return <p className='px-4 py-6 font-mono text-xs text-ash/40'>no clients yet</p>;
    }

    return (
        <ul className='client-list divide-y divide-line overflow-y-auto overscroll-contain'>
            {clients.map((c) => (
                <li key={c.name}>
                    <button
                        className='client-row flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink/50 active:bg-ink/50'
                        onClick={() => onSelect(c.name)}
                    >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[c.status] || 'bg-ash/30'}`} title={c.status} />
                        <span className='name flex-1 truncate text-sm font-medium text-ash'>{c.name}</span>
                        <span className='transport shrink-0 rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] text-ash/50'>
                            {c.transport}
                        </span>
                    </button>
                    <div className='url flex items-center gap-2 px-4 pb-2.5 pl-[2rem] font-mono text-[11px] text-ash/40'>
                        <span className='truncate'>{maskUrl(revealed[c.name])}</span>
                        {!revealed[c.name] && (
                            <button
                                type='button'
                                className='reveal shrink-0 -m-1.5 p-1.5 text-signal/70 transition hover:text-signal active:text-signal'
                                onClick={(e) => {
                                    e.stopPropagation();
                                    reveal(c.name);
                                }}
                            >
                                show
                            </button>
                        )}
                        <button
                            type='button'
                            className='copy shrink-0 -m-1.5 p-1.5 text-signal/70 transition hover:text-signal active:text-signal'
                            onClick={(e) => {
                                e.stopPropagation();
                                copy(c.name);
                            }}
                        >
                            copy
                        </button>
                        <span className='created ml-auto shrink-0 text-ash/25' title={c.created}>
                            {c.created.slice(0, 10)}
                        </span>
                    </div>
                </li>
            ))}
        </ul>
    );
}
