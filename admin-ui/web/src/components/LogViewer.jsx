import { useEffect, useRef } from 'react';
import { useClientLogs } from '../hooks/useClientLogs.js';

export default function LogViewer({ name }) {
    const { lines, error } = useClientLogs(name);
    const preRef = useRef(null);

    useEffect(() => {
        // Scroll only this <pre>'s own scrollTop, never scrollIntoView(): that
        // call walks every scrollable ancestor (including the page's <main>)
        // and drags the whole detail panel down on every new log line, which
        // scrolls the name/action-buttons header right off the top of the screen.
        const el = preRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [lines.length]);

    return (
        <div className='log-viewer rounded-lg border border-line bg-panel'>
            <div className='flex items-center gap-2 border-b border-line px-4 py-2'>
                <span className='h-1.5 w-1.5 rounded-full bg-signal animate-pulseline' aria-hidden='true' />
                <span className='font-mono text-[11px] uppercase tracking-wide text-ash/40'>live log</span>
            </div>
            {error && <p className='error px-4 py-2 font-mono text-xs text-fault'>log stream error: {error}</p>}
            <pre
                ref={preRef}
                className='h-80 overflow-y-auto overflow-x-hidden overscroll-contain whitespace-pre-wrap break-all px-4 py-3 font-mono text-[12px] leading-relaxed text-ash/75'
            >
                {lines.join('\n')}
            </pre>
        </div>
    );
}
