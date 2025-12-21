import express from "express";
import {GameDig, type QueryOptions} from "gamedig";
import {lookup, resolveSrv} from "node:dns/promises";

const app = express();
const PORT = process.env.PORT || 3000;

// Whitelisted gamedig options (besides type + host)
const numericKeys = new Set([
    "port",
    "maxRetries",
    "socketTimeout",
    "attemptTimeout",
    "ipFamily",
]);
// Whitelisted bool gamedig options
const booleanKeys = new Set([
    "givenPortOnly",
    "debug",
    "requestRules",
    "requestPlayers",
    "requestRulesRequired",
    "requestPlayersRequired",
    "stripColors",
    "portCache",
    "noBreadthOrder",
    "checkOldIDs",
]);

// SRV prefixes per gamedig type (add more if you want)
const srvByType: Record<string, string> = {
    minecraft: "_minecraft._tcp",
};

// Resolve host/port using SRV (if supported), otherwise A/AAAA.
// If the user provided a port (via ?port= or host:port), that overrides SRV.
async function resolveEndpoint(
    type: string,
    host: string,
    userPort?: number
): Promise<{host: string; port?: number; portFromSrv: boolean}> {
    const hasUserPort = Number.isFinite(userPort);

    const srvPrefix = srvByType[type];
    if (srvPrefix) {
        try {
            const srv = await resolveSrv(`${srvPrefix}.${host}`);
            if (srv.length > 0) {
                // Simple selection: first record. (Can be improved for priority/weight.)
                const target = srv[0].name;
                const port = srv[0].port;

                // Ensure SRV target resolves to A/AAAA
                await lookup(target);

                return {
                    host: target,
                    port: hasUserPort ? (userPort as number) : port,
                    portFromSrv: !hasUserPort,
                };
            }
        } catch {
            // No SRV record (or failed SRV resolution) -> fall back
        }
    }

    // Normal A/AAAA resolution
    await lookup(host);

    return {
        host,
        port: hasUserPort ? (userPort as number) : undefined,
        portFromSrv: false,
    };
}

function parseHostAndPort(input: string): { host: string; port?: number } {
    const s = input.trim();

    // IPv6 in brackets: [::1]:25565
    const m6 = s.match(/^\[([^\]]+)\]:(\d{1,5})$/);
    if (m6) {
        const port = Number(m6[2]);
        return Number.isFinite(port) ? { host: m6[1], port } : { host: m6[1] };
    }

    // host:port (only treat last ":" as port separator)
    const idx = s.lastIndexOf(":");
    if (idx > -1) {
        const maybePort = s.slice(idx + 1);
        // only if it's all digits -> consider it a port
        if (/^\d{1,5}$/.test(maybePort)) {
            const port = Number(maybePort);
            const host = s.slice(0, idx);
            return Number.isFinite(port) ? { host, port } : { host };
        }
    }

    return { host: s };
}



/**
 * Request a gamedig for a specific servertype with optional parameters
 */
app.get("/query/:type", async (req, res) => {
    const type = req.params.type;
    const hostRaw = req.query.host as string | undefined;
    const parsed = hostRaw ? parseHostAndPort(hostRaw) : undefined;
    const host = parsed?.host;

    if (!type || !host) {
        return res.status(400).json({error: "host_type_missing", message: "Missing type or host"});
    }

    // Resolve endpoint (SRV-aware where applicable)
    let endpoint: {host: string; port?: number; portFromSrv: boolean};
    try {

        const queryPortRaw = req.query.port;
        const queryPort =
            queryPortRaw != null
                ? Number(Array.isArray(queryPortRaw) ? queryPortRaw[0] : queryPortRaw)
                : undefined;

        const userPort =
            Number.isFinite(queryPort)
                ? queryPort
                : Number.isFinite(parsed?.port)
                    ? parsed!.port
                    : undefined;


        endpoint = await resolveEndpoint(type, host, userPort);
    } catch {
        return res.status(400).json({
            error: "host_unreachable",
            message: "Host not reachable or cannot be resolved. Please ensure the host is reachable.",
        });
    }


    const queryOptions: QueryOptions = {
        type,
        host: endpoint.host,
        ...(endpoint.port != null ? {port: endpoint.port} : {}),
    };

    // Map only allowed query params into Gamedig options
    for (const [key, rawValue] of Object.entries(req.query)) {
        if (key === "host" || key === "raw") continue;
        if (key === "port" && endpoint.portFromSrv) continue;



        const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

        if (numericKeys.has(key)) {
            const n = Number(value);
            if (!Number.isNaN(n)) {
                (queryOptions as any)[key] = n;
            }
        } else if (booleanKeys.has(key)) {
            const v = String(value).toLowerCase();
            if (v === "true" || v === "1") {
                (queryOptions as any)[key] = true;
            } else if (v === "false" || v === "0") {
                (queryOptions as any)[key] = false;
            }
        }
    }


    try {
        const result = await GameDig.query(queryOptions);

        // Handle ?raw=true logic
        const rawParam = String(req.query.raw || "").toLowerCase();
        const sendRaw = rawParam === "true" || rawParam === "1";

        if (!sendRaw && result && typeof result === "object") {
            delete (result as any).raw;
        }

        return res.json(result);
    } catch (err: any) {
        return res.status(502).json({
            error: "query_failed",
            message: "Query to game server failed",
            details: err?.message ?? String(err),
        });
    }

});

// 404 fallback
app.use((req, res) => {
    res.status(404).json({
        error: "not_found",
        path: req.path,
    });
});

app.listen(PORT, () => {
    console.log(`HypeServ Gamedig API running on port ${PORT}`);
});
