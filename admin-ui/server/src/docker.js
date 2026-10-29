// admin-ui/server/src/docker.js
function imageNameFromEnv() {
    return process.env.OPENFLUX_IMAGE || 'openflux-exit:local';
}

function createDockerClient(dockerode) {
    async function containerStatus(containerName) {
        try {
            const data = await dockerode.getContainer(containerName).inspect();
            return data.State.Status;
        } catch (err) {
            if (err.statusCode === 404) return 'missing';
            throw err;
        }
    }

    async function removeContainer(containerName) {
        try {
            await dockerode.getContainer(containerName).remove({ force: true });
        } catch (err) {
            if (err.statusCode !== 404) throw err;
        }
    }

    async function stopContainer(containerName) {
        try {
            await dockerode.getContainer(containerName).stop();
        } catch (err) {
            // 304 = already stopped, 404 = already gone -- both are the caller's
            // desired end state, not failures.
            if (err.statusCode !== 304 && err.statusCode !== 404) throw err;
        }
    }

    async function startContainer(containerName) {
        try {
            await dockerode.getContainer(containerName).start();
        } catch (err) {
            // 304 = already running.
            if (err.statusCode !== 304) throw err;
        }
    }

    async function runContainer({ containerName, transport, url, key, mode = 'l3' }) {
        const Env = [`ROLE=exit-node`, `TRANSPORT=${transport}`, `URL=${url}`];
        if (key) Env.push(`ENCRYPTION_KEY=${key}`);
        // l3 (default) needs the raw-socket capabilities; l4 (gVisor proxy) is
        // unprivileged and takes none, mirroring cli/openflux-ctl's run_container.
        const HostConfig = { RestartPolicy: { Name: 'unless-stopped' } };
        if (mode === 'l4') {
            Env.push(`MODE=${mode}`);
        } else {
            HostConfig.CapAdd = ['NET_RAW', 'NET_ADMIN'];
        }
        const container = await dockerode.createContainer({
            name: containerName,
            Image: imageNameFromEnv(),
            Env,
            HostConfig,
        });
        await container.start();
    }

    // bootstrapCupsonlineUrl mirrors cli/openflux-ctl's bootstrap_cupsonline_url:
    // start a throwaway exit-node container with no URL so the binary creates
    // fresh Cups.online rooms itself and prints the base64 room-list between its
    // "=== COPY THIS TO CLIENT ===" marker lines, capture that line, then remove
    // the container. The caller treats the result exactly like a user-supplied url.
    async function bootstrapCupsonlineUrl(containerName) {
        // 8 rooms (default since 0.13.0, was 4) created one at a time with a
        // real HTTP round trip to cups.online each -- 20s was tuned for 4
        // rooms and was cutting it close even then; 60s gives headroom for
        // retries/rate limits.
        const timeoutMs = Number(process.env.OPENFLUX_CUPSONLINE_BOOTSTRAP_TIMEOUT || 60) * 1000;
        const container = await dockerode.createContainer({
            name: containerName,
            Image: imageNameFromEnv(),
            Env: ['ROLE=exit-node', 'TRANSPORT=cupsonline'],
        });
        await container.start();

        const marker = '=== COPY THIS TO CLIENT ===';
        let buffered = '';
        let url = '';
        try {
            const stream = await container.logs({ follow: true, stdout: true, stderr: true });
            const sink = {
                write: (chunk) => {
                    buffered += chunk.toString('utf8');
                    if (!url) {
                        const idx = buffered.indexOf(marker);
                        if (idx !== -1) {
                            const after = buffered
                                .slice(idx + marker.length)
                                .split('\n')
                                .map((l) => l.trim())
                                .filter(Boolean);
                            if (after.length) url = after[0];
                        }
                    }
                },
            };
            dockerode.modem.demuxStream(stream, sink, sink);

            const deadline = Date.now() + timeoutMs;
            while (!url && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            stream.destroy();
        } finally {
            await container.remove({ force: true }).catch(() => {});
        }

        if (!url) {
            throw new Error('cupsonline room bootstrap timed out waiting for the room list');
        }
        return url;
    }

    async function streamLogs(containerName, onLine, onError) {
        const container = dockerode.getContainer(containerName);
        const stream = await container.logs({
            follow: true,
            stdout: true,
            stderr: true,
            tail: 200,
        });
        const sink = { write: (chunk) => onLine(chunk.toString('utf8')) };
        dockerode.modem.demuxStream(stream, sink, sink);
        stream.on('error', onError);
        return { destroy: () => stream.destroy() };
    }

    return {
        imageName: imageNameFromEnv,
        containerStatus,
        removeContainer,
        stopContainer,
        startContainer,
        runContainer,
        bootstrapCupsonlineUrl,
        streamLogs,
    };
}

module.exports = { createDockerClient };
