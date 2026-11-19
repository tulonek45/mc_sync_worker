const { checkEndpoint, getBearerToken, getEndpoint, getHeaders, fetchJson } = require("./helpers.cjs");

async function main() {
    await checkEndpoint();
    const endpoint = getEndpoint("/me");
    const token = getBearerToken();

    const response = await fetchJson(endpoint, token);
    console.log(response)
    
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});