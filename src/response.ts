export const json = (body: unknown, status = 200): Response =>
    Response.json(body, { status });
