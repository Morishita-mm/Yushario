import { defineConfig } from "vitest/config";

// The SEC suites start real relays and CLIs and fsync real stores. Running files
// together races free-port handoffs (including SEC-11's adjacent ports) and starves
// durability tests. Individual tests still exercise concurrent HTTP requests.
export default defineConfig({ test: { fileParallelism: false } });
