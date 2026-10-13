// admin-ui/web/src/api.js
const BASE = '/api';

async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `request failed: ${res.status}`);
    }
    return data;
}

export const api = {
    login: (user, password) =>
        request('/login', {
            method: 'POST',
            body: JSON.stringify({ user, password }),
        }),
    logout: () => request('/logout', { method: 'POST' }),
    listClients: () => request('/clients'),
    getClientUrl: (name) => request(`/clients/${name}/url`),
    createClient: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
    editClient: (name, data) => request(`/clients/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
    removeClient: (name) => request(`/clients/${name}`, { method: 'DELETE' }),
    rekeyClient: (name) => request(`/clients/${name}/rekey`, { method: 'POST' }),
    stopClient: (name) => request(`/clients/${name}/stop`, { method: 'POST' }),
    startClient: (name) => request(`/clients/${name}/start`, { method: 'POST' }),
};
