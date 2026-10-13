import { useEffect, useRef } from 'react';
import { useClientLogs } from '../hooks/useClientLogs.js';

export default function LogViewer({ name }) {
    const { lines, error } = useClientLogs(name);
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView();
    }, [lines.length]);

    return (
        <div className='log-viewer rounded-lg border border-line bg-panel'>
            <div className='flex items-center gap-2 border-b border-line px-4 py-2'>
                <span className='h-1.5 w-1.5 rounded-full bg-signal animate-pulseline' aria-hidden='true' />
                <span className='font-mono text-[11px] uppercase tracking-wide text-ash/40'>live log</span>
            </div>
            {error && <p className='error px-4 py-2 font-mono text-xs text-fault'>log stream error: {error}</p>}
            <pre className='h-80 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all px-4 py-3 font-mono text-[12px] leading-relaxed text-ash/75'>
                {lines.join('\n')}
                <div ref={bottomRef} />
            </pre>
        </div>
    );
}
