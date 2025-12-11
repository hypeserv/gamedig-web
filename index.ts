import express from "express";
import {GameDig, type QueryOptions} from "gamedig";
import {lookup} from "node:dns/promises";

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

/**
 * Request a gamedig for a specific servertype with optional parameters
 */
app.get("/query/:type", async (req, res) => {
    const type = req.params.type;
    const host = req.query.host as string | undefined;

    if (!type || !host) {
        return res.status(400).json({error: "host_type_missing", message: "Missing type or host"});
    }

    // Ensure host resolves (domain or IP)
    try {
        await lookup(host);
    } catch {
        return res.status(400).json({
            error: "host_unreachable",
            message: "Host not reachable or cannot be resolved. Please ensure the host is reachable.",
        });
    }

    const queryOptions: QueryOptions = {
        type,
        host,
    };

    // Map only allowed query params into Gamedig options
    for (const [key, rawValue] of Object.entries(req.query)) {
        if (key === "host") continue;

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
