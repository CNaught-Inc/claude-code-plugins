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
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function getClaudeDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(homeDir, ".claude");
}
function main() {
  const claudeDir = getClaudeDir();
  const dbPath = path.join(claudeDir, "carbon-tracker.db");
  const statuslinePath = path.join(claudeDir, "statusline-carbon.mjs");
  const settingsPath = path.join(claudeDir, "settings.json");
  console.log("\n");
  console.log("========================================");
  console.log("  CNaught Carbon Tracker Uninstall      ");
  console.log("========================================");
  console.log("\n");
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log(`  Deleted database: ${dbPath}`);
  } else {
    console.log("  Database not found (already removed)");
  }
  for (const suffix of ["-wal", "-shm"]) {
    const walPath = dbPath + suffix;
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
  }
  if (fs.existsSync(statuslinePath)) {
    fs.unlinkSync(statuslinePath);
    console.log(`  Deleted statusline: ${statuslinePath}`);
  }
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(content);
      const statusLine = settings.statusLine;
      if (statusLine && typeof statusLine === "object" && typeof statusLine.command === "string" && statusLine.command.includes("statusline-carbon")) {
        delete settings.statusLine;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log("  Removed statusLine from settings.json");
      }
    } catch {
    }
  }
  console.log("\n");
  console.log("========================================");
  console.log("\n");
}
main();
//# sourceMappingURL=carbon-uninstall.js.map
