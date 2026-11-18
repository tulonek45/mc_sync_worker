module.exports = {
    testEnvironment: "node",
    testMatch: ["<rootDir>/test/unit/**/*.test.ts"],
    transform: {
        "^.+\\.tsx?$": ["@swc/jest", {
            jsc: {
                target: "es2022",
                parser: { syntax: "typescript" },
            },
            module: { type: "commonjs" },
        }],
    },
};
