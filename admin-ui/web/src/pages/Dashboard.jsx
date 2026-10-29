// admin-ui/web/src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ClientList from '../components/ClientList.jsx';
import ClientForm from '../components/ClientForm.jsx';
import LogViewer from '../components/LogViewer.jsx';
import KeyRevealModal from '../components/KeyRevealModal.jsx';

export default function Dashboard() {
    const [clients, setClients] = useState([]);
    const [selected, setSelected] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [revealedKey, setRevealedKey] = useState(null);
    const [actionError, setActionError] = useState(null);

    async function refresh() {
        setClients(await api.listClients());
    }

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    }, []);

    async function handleCreate(values) {
        const result = await api.createClient(values);
        setShowCreate(false);
        setRevealedKey(result.key);
        await refresh();
    }

    async function handleEdit(values) {
        const result = await api.editClient(selected, {
            transport: values.transport,
            url: values.url,
            mode: values.mode,
        });
        if (result.key) setRevealedKey(result.key);
        await refresh();
    }

    async function handleRemove(name) {
        setActionError(null);
        try {
            await api.removeClient(name);
            if (selected === name) setSelected(null);
            await refresh();
        } catch (err) {
            setActionError(err.message);
        }
    }

    async function handleRekey(name) {
        setActionError(null);
        try {
            const result = await api.rekeyClient(name);
            setRevealedKey(result.key);
        } catch (err) {
            setActionError(err.message);
        }
    }

    async function handleStop(name) {
        setActionError(null);
        try {
            await api.stopClient(name);
            await refresh();
        } catch (err) {
            setActionError(err.message);
        }
    }

    async function handleStart(name) {
        setActionError(null);
        try {
            await api.startClient(name);
            await refresh();
        } catch (err) {
            setActionError(err.message);
        }
    }

    const selectedClient = clients.find((c) => c.name === selected);
    const mobileDetailOpen = Boolean(selectedClient) || showCreate;

    return (
        <div className='dashboard flex h-dvh bg-ink text-ash'>
            <aside
                className={`${mobileDetailOpen ? 'hidden' : 'flex'} w-full shrink-0 flex-col border-r border-line bg-panel sm:flex sm:w-64 lg:w-80`}
            >
                <div className='flex items-center justify-between border-b border-line px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]'>
                    <h1 className='font-display text-base font-semibold tracking-tight text-ash'>Exit nodes</h1>
                    <button
                        onClick={() => {
                            setShowCreate(true);
                            setSelected(null);
                            setActionError(null);
                        }}
                        className='rounded-md bg-signal/10 px-3 py-1.5 text-sm font-medium text-signal transition hover:bg-signal/20 active:bg-signal/30'
                    >
                        + New
                    </button>
                </div>
                <ClientList
                    clients={clients}
                    onSelect={(name) => {
                        setSelected(name);
                        setShowCreate(false);
                        setActionError(null);
                    }}
                />
            </aside>

            <main
                className={`${mobileDetailOpen ? 'block' : 'hidden'} flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:block sm:p-6`}
            >
                {mobileDetailOpen && (
                    <button
                        onClick={() => {
                            setSelected(null);
                            setShowCreate(false);
                        }}
                        className='mb-4 flex items-center gap-1 text-sm font-medium text-ash/60 transition hover:text-ash active:text-ash sm:hidden'
                    >
                        ← Back
                    </button>
                )}

                {showCreate && (
                    <div className='mx-auto max-w-md'>
                        <h2 className='mb-4 font-display text-lg font-semibold text-ash'>New client</h2>
                        <ClientForm isEdit={false} onSubmit={handleCreate} />
                    </div>
                )}

                {selectedClient && !showCreate && (
                    <div className='client-detail mx-auto flex max-w-3xl flex-col gap-6'>
                        {actionError && (
                            <p className='rounded-md border border-fault/30 bg-fault/10 px-3 py-2 text-sm text-fault'>{actionError}</p>
                        )}
                        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                            <h2 className='font-mono text-lg font-semibold text-ash'>{selectedClient.name}</h2>
                            <div className='flex flex-wrap gap-2'>
                                {selectedClient.status === 'running' ? (
                                    <button
                                        onClick={() => handleStop(selectedClient.name)}
                                        className='rounded-md border border-line px-3 py-1.5 text-sm text-ash/70 transition hover:border-fault hover:text-fault active:border-fault active:text-fault'
                                    >
                                        Stop
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleStart(selectedClient.name)}
                                        className='rounded-md border border-line px-3 py-1.5 text-sm text-ash/70 transition hover:border-signal hover:text-signal active:border-signal active:text-signal'
                                    >
                                        Start
                                    </button>
                                )}
                                <button
                                    onClick={() => handleRekey(selectedClient.name)}
                                    className='rounded-md border border-line px-3 py-1.5 text-sm text-ash/70 transition hover:border-key hover:text-key active:border-key active:text-key'
                                >
                                    Rekey
                                </button>
                                <button
                                    onClick={() => handleRemove(selectedClient.name)}
                                    className='rounded-md border border-line px-3 py-1.5 text-sm text-ash/70 transition hover:border-fault hover:text-fault active:border-fault active:text-fault'
                                >
                                    Remove
                                </button>
                            </div>
                        </div>

                        <ClientForm
                            key={selectedClient.name}
                            isEdit
                            initialValues={{
                                name: selectedClient.name,
                                transport: selectedClient.transport,
                                url: '',
                                mode: selectedClient.mode || 'l3',
                            }}
                            onSubmit={handleEdit}
                        />

                        <LogViewer name={selectedClient.name} />
                    </div>
                )}

                {!selectedClient && !showCreate && (
                    <div className='flex h-full items-center justify-center'>
                        <p className='font-mono text-sm text-ash/30'>select a client to view details</p>
                    </div>
                )}
            </main>

            <KeyRevealModal keyValue={revealedKey} onClose={() => setRevealedKey(null)} />
        </div>
    );
}
