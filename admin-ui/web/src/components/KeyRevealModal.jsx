export default function KeyRevealModal({ keyValue, onClose }) {
    if (!keyValue) return null;
    return (
        <div
            className='modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
            role='dialog'
            aria-modal='true'
            aria-labelledby='key-modal-title'
        >
            <div className='modal max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-key/30 bg-panel p-6 shadow-2xl'>
                <h2 id='key-modal-title' className='mb-2 font-display text-lg font-semibold text-key'>
                    Encryption key
                </h2>
                <p className='mb-4 text-sm text-ash/60'>
                    Give this to the client. It is also saved on the server; it will not be shown again.
                </p>
                <code className='mb-5 block break-all rounded-md border border-line bg-ink px-3 py-2.5 font-mono text-xs text-ash'>
                    {keyValue}
                </code>
                <div className='flex gap-2'>
                    <button
                        type='button'
                        onClick={() => navigator.clipboard.writeText(keyValue)}
                        className='flex-1 rounded-md bg-key px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 active:scale-[0.98] active:brightness-95'
                    >
                        Copy
                    </button>
                    <button
                        type='button'
                        onClick={onClose}
                        className='flex-1 rounded-md border border-line px-4 py-2 text-sm font-medium text-ash/80 transition hover:border-ash/40 active:border-ash/40 active:scale-[0.98]'
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
