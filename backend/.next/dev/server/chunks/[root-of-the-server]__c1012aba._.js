module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/@prisma/client [external] (@prisma/client, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("@prisma/client", () => require("@prisma/client"));

module.exports = mod;
}),
"[project]/Desktop/otcr-dashboard/backend/src/lib/prisma.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "prisma",
    ()=>prisma
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs)");
;
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$29$__["PrismaClient"]();
if ("TURBOPACK compile-time truthy", 1) globalForPrisma.prisma = prisma;
}),
"[project]/Desktop/otcr-dashboard/backend/src/lib/test-db.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "testDatabaseConnection",
    ()=>testDatabaseConnection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/otcr-dashboard/backend/src/lib/prisma.ts [app-route] (ecmascript)");
;
async function testDatabaseConnection() {
    try {
        // Test the connection
        await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].$connect();
        console.log("✅ Database connected successfully!");
        // Test a simple query
        const userCount = await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].user.count();
        console.log(`📊 Current users in database: ${userCount}`);
        return {
            success: true,
            userCount
        };
    } catch (error) {
        console.error("❌ Database connection failed:", error);
        return {
            success: false,
            error: error.message
        };
    } finally{
        await __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].$disconnect();
    }
}
}),
"[project]/Desktop/otcr-dashboard/backend/src/app/api/test-db/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/otcr-dashboard/backend/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$src$2f$lib$2f$test$2d$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Desktop/otcr-dashboard/backend/src/lib/test-db.ts [app-route] (ecmascript)");
;
;
async function GET() {
    try {
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$src$2f$lib$2f$test$2d$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["testDatabaseConnection"])();
        if (result.success) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                status: "success",
                message: "Database connection successful",
                userCount: result.userCount
            });
        } else {
            return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                status: "error",
                message: "Database connection failed",
                error: result.error
            }, {
                status: 500
            });
        }
    } catch (error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$Desktop$2f$otcr$2d$dashboard$2f$backend$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            status: "error",
            message: "Database test failed",
            error: error.message
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__c1012aba._.js.map