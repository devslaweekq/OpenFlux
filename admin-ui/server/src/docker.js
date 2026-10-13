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

    async function runContainer({ containerName, transport, url, key }) {
        const Env = [`ROLE=exit-node`, `TRANSPORT=${transport}`, `URL=${url}`];
        if (key) Env.push(`ENCRYPTION_KEY=${key}`);
        const container = await dockerode.createContainer({
            name: containerName,
            Image: imageNameFromEnv(),
            Env,
            HostConfig: {
                RestartPolicy: { Name: 'unless-stopped' },
                CapAdd: ['NET_RAW', 'NET_ADMIN'],
            },
        });
        await container.start();
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
        streamLogs,
    };
}

module.exports = { createDockerClient };
