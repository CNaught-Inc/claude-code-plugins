#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/scripts/carbon-uninstall.ts
var fs2 = __toESM(require("fs"));

// src/data-store.ts
var import_bun_sqlite = require("bun:sqlite");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function getDatabasePath() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(homeDir, ".claude", "carbon-tracker.db");
}
function ensureDbDirectory() {
  const dbPath = getDatabasePath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}
function openDatabase() {
  ensureDbDirectory();
  const dbPath = getDatabasePath();
  return new import_bun_sqlite.Database(dbPath);
}

// src/scripts/carbon-uninstall.ts
function deleteProjectSessions(projectPath) {
  const dbPath = getDatabasePath();
  if (!fs2.existsSync(dbPath)) {
    return { deleted: 0, remaining: 0 };
  }
  const db = openDatabase();
  try {
    const encodedPath = projectPath.replace(/\//g, "-");
    const deleteResult = db.prepare(
      "DELETE FROM sessions WHERE project_path = ? OR project_path = ?"
    ).run(encodedPath, projectPath);
    const deleted = deleteResult.changes;
    const countRow = db.prepare("SELECT COUNT(*) as count FROM sessions").get();
    return { deleted, remaining: countRow.count };
  } finally {
    db.close();
  }
}
function deleteDatabase() {
  const dbPath = getDatabasePath();
  if (fs2.existsSync(dbPath)) {
    fs2.unlinkSync(dbPath);
    console.log(`  Deleted database: ${dbPath}`);
  } else {
    console.log("  Database not found (already removed)");
  }
  for (const suffix of ["-wal", "-shm"]) {
    const walPath = dbPath + suffix;
    if (fs2.existsSync(walPath)) {
      fs2.unlinkSync(walPath);
    }
  }
}
function main() {
  const args = process.argv.slice(2);
  const pathIndex = args.indexOf("--project-path");
  const projectPath = pathIndex !== -1 ? args[pathIndex + 1] : null;
  console.log("\n");
  console.log("========================================");
  console.log("  CNaught Carbon Tracker Uninstall      ");
  console.log("========================================");
  console.log("\n");
  if (!projectPath) {
    console.log("  Error: --project-path is required");
    process.exit(1);
  }
  console.log(`  Removing sessions for: ${projectPath}
`);
  const { deleted, remaining } = deleteProjectSessions(projectPath);
  console.log(`  Deleted ${deleted} session(s) for this project`);
  if (remaining === 0) {
    console.log("  No sessions remain \u2014 deleting database...\n");
    deleteDatabase();
  } else {
    console.log(`  ${remaining} session(s) from other projects remain`);
    console.log("  Database left intact");
  }
  console.log("\n");
  console.log("========================================");
  console.log("\n");
}
main();
//# sourceMappingURL=carbon-uninstall.js.map
