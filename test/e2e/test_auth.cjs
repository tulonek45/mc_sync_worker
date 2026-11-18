const { checkEndpoint, getBearerToken, getEndpoint, getHeaders } = require("./helpers.cjs");

async function main() {
    const endpoint = getEndpoint("/test");
    await checkEndpoint(endpoint);
    const token = getBearerToken();

    const response = await fetch(endpoint, {
        headers: getHeaders(token),
        signal: AbortSignal.timeout(10000)
    });
    const body = await response.text();
    
    console.log(`HTTP ${response.status}`);
    if (body) {
        console.log(body);
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});