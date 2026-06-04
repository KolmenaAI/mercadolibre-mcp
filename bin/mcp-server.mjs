#!/usr/bin/env node
// Thin shim — adds the shebang npm bin entries need (tsc strips them).
// All substantive logic lives in src/cli.ts → dist/cli.js so it's
// type-checked.
import { main } from "../dist/cli.js";
await main();
