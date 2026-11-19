const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseArgs } = require("node:util");

const { values: args } = parseArgs({
    options: {
        profile: { type: "string" },
        exclude: { type: "string", default: "" },
    },
});

const SHARED_PROPERTY_ALLOWLIST = new Set([
    "allow-flight",
    "allow-nether",
    "difficulty",
    "enable-command-block",
    "enforce-secure-profile",
    "enforce-whitelist",
    "entity-broadcast-range-percentage",
    "force-gamemode",
    "gamemode",
    "generate-structures",
    "hardcore",
    "level-name",
    "level-seed",
    "level-type",
    "max-build-height",
    "max-players",
    "max-tick-time",
    "max-world-size",
    "motd",
    "network-compression-threshold",
    "online-mode",
    "op-permission-level",
    "player-idle-timeout",
    "pvp",
    "spawn-monsters",
    "spawn-npcs",
    "spawn-protection",
    "view-distance",
    "white-list",
]);
const SKIP_TOP_LEVEL_NAMES = new Set([
    "eula.txt",
    "server.properties",
    "banned-players.json",
    "banned-ips.json",
    "ops.json",
    "whitelist.json",
    "usercache.json",
    "session.lock",
    "run.bat",
]);
const SKIP_TOP_LEVEL_DIRS = new Set([
    "world",
    "world_nether",
    "world_the_end",
    "logs",
    "crash-reports",
    "cache",
    "libraries",
    "versions",
]);

const fail = (message) => { throw new Error(`error: ${message}`); };


function validateProfileName(name) {
    if (!name || typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        fail("invalid or missing --profile (use letters, numbers, underscores, or hyphens)");
    }
}


function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        fail(`cannot read ${file}: ${error.message}`);
    }
}


function unescapeJava(s) {
    return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c) => {
        if (c[0] === "u" && c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
        return { t: "\t", n: "\n", r: "\r", f: "\f" }[c] ?? c;
    });
}


function parseProperties(text) {
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trimStart();
        if (!line || line.startsWith("#") || line.startsWith("!")) continue;
        const i = line.indexOf("=");
        if (i < 1) continue;
        out[unescapeJava(line.slice(0, i).trim())] = unescapeJava(line.slice(i + 1));
    }
    return out;
}


function pickAllowlistedProperties(rawProps, allowlist) {
    const picked = {};
    for (const key of Array.from(allowlist).sort()) {
        if (Object.hasOwn(rawProps, key)) {
            picked[key] = String(rawProps[key]);
        }
    }
    return picked;
}


function normalizeServer(server) {
    if (!server || typeof server !== "object")
        fail('base file needs a "server" object');
    if (!server.type || !server.mc_version || !server.url)
        fail("server needs type, mc_version and url");
    if (!String(server.url).startsWith("https://"))
        fail("server.url must be https");

    const normalized = {
        type: String(server.type),
        mc_version: String(server.mc_version),
        url: String(server.url),
    };
    if (server.build !== undefined && server.build !== null && server.build !== "") {
        const build = Number(server.build);
        if (!Number.isInteger(build)) fail(`server.build must be an integer, got ${JSON.stringify(server.build)}`);
        normalized.build = build;
    }

    let sha256 = server.sha256 ? String(server.sha256).toLowerCase() : undefined;
    let sha1 = server.sha1 ? String(server.sha1).toLowerCase() : undefined;
    if (sha256 && /^[0-9a-f]{40}$/.test(sha256)) {
        sha1 = sha1 ?? sha256;
        sha256 = undefined;
    }
    if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) fail("server.sha256 is not 64 hex chars");
    if (sha1 && !/^[0-9a-f]{40}$/.test(sha1)) fail("server.sha1 is not 40 hex chars");
    if (!sha256 && !sha1) fail("server needs a sha256 or sha1");
    if (sha256) normalized.sha256 = sha256;
    if (sha1) normalized.sha1 = sha1;
    return normalized;
}


function isExcluded(relative, extraExcludes) {
    const parts = relative.split("/");
    if (parts.length === 1 && (SKIP_TOP_LEVEL_NAMES.has(parts[0]) || parts[0].endsWith(".jar")))
        return true;
    if (SKIP_TOP_LEVEL_DIRS.has(parts[0]) || parts[parts.length - 1] === "session.lock")
        return true;
    return extraExcludes.some((prefix) =>
        relative === prefix || relative.startsWith(prefix.replace(/\/?$/, "/")));
}


function isSafePath(value) {
    if (!value || value.length > 200 || value.startsWith("/") || value.includes("\\") || value.includes("\0"))
        return false;
    return !value.split("/").some((part) => part === "" || part === "." || part === "..");
}


async function walk(root, dir = root, files = [], extraExcludes = []) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        const relative = path.relative(root, absolute).split(path.sep).join("/");
        if (entry.isSymbolicLink()) {
            console.warn(`skip symlink: ${relative}`);
        } else if (entry.isDirectory()) {
            if (!isExcluded(relative, extraExcludes))
                await walk(root, absolute, files, extraExcludes);
        } else if (entry.isFile() && !isExcluded(relative, extraExcludes)) {
            if (!isSafePath(relative)) fail(`unsafe path, refusing: ${relative}`);
            files.push({ relative, absolute });
        }
    }
    return files;
}


async function sha256File(file) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        fs.createReadStream(file)
            .on("data", (chunk) => hash.update(chunk))
            .on("error", reject)
            .on("end", () => resolve(hash.digest("hex")));
    });
}


async function main() {
    validateProfileName(args.profile);

    const profileRoot = path.join(__dirname, "..", "profiles", args.profile);
    const serverDir = path.join(profileRoot, "server")
    const baseFile = path.join(profileRoot, "base.json");
    const outputFile = path.join(profileRoot, "manifest.json");
    const propertiesFile = path.join(serverDir, "server.properties");

    if (!fs.existsSync(serverDir) || !fs.statSync(serverDir).isDirectory())
        fail(`not a directory: ${serverDir}`);
    if (!fs.existsSync(propertiesFile))
        fail(`server.properties not found: ${propertiesFile}`);

    const base = readJson(baseFile);
    const server = normalizeServer(base.server);
    const extraExcludes = args.exclude.split(",").map((value) => value.trim()).filter(Boolean);

    const parsedProps = parseProperties(fs.readFileSync(propertiesFile, "utf8"));
    const properties = pickAllowlistedProperties(parsedProps, SHARED_PROPERTY_ALLOWLIST);

    console.log(`Scanning ${serverDir} ...`);
    const found = await walk(serverDir, serverDir, [], extraExcludes);
    const files = [];
    for (const file of found) {
        files.push({ path: file.relative, sha256: await sha256File(file.absolute) });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));

    const body = { server, properties, files };
    let previous = null;
    if (fs.existsSync(outputFile)) try { previous = readJson(outputFile); } catch { /* overwrite an invalid generated file */ }
    const same = previous
        && JSON.stringify({ server: previous.server, properties: previous.properties, files: previous.files }) === JSON.stringify(body);
    const manifest = { version: same ? previous.version : (previous?.version ?? 0) + 1, ...body };
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2) + "\n");

    console.log(`Wrote ${outputFile}`);
    console.log(`  version           : ${manifest.version}`);
    console.log(`  profile files     : ${files.length}`);
    console.log(`  properties        : ${Object.keys(properties).length}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});