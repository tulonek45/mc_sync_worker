const { checkEndpoint, getBearerToken, getEndpoint, getHeaders, fetchJson } = require("./helpers.cjs");

async function main() {
    const endpoint = getEndpoint("/me");
    await checkEndpoint(endpoint);
    const token = getBearerToken();

    const response = await fetchJson(endpoint, token);
    console.log(response)
    
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});