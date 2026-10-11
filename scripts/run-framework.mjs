import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";

// Regenerate from checked-in sources on every build. No secrets or DB exports.
if (command === "build") await import("./build-collector-release.mjs");

// A build ends with the static home page (scripts/build-static-page.mjs).
if (command === "build") {
  const result = managedLinux
    ? spawnSync("bash", [fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args], { stdio: "inherit" })
    : spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url)), "build", ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status) process.exit(result.status);
  await import("./build-static-page.mjs");
  process.exit(0);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);
