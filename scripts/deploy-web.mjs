import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(path = ".env") {
  if (!existsSync(path)) {
    return;
  }
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice(7)
      : trimmed;
    const index = normalized.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = normalized.slice(0, index).trim();
    let value = normalized.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const projectName = process.env.CLOUDFLARE_PAGES_PROJECT;
const branch = process.env.CLOUDFLARE_PAGES_BRANCH ?? "main";
const skipBuild = process.argv.includes("--skip-build");
const outputDir = resolve("apps/web/dist");

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(`${command} ${args.join(" ")} failed with code ${code}`),
      );
    });
  });
}

if (!projectName) {
  console.error(
    "Missing CLOUDFLARE_PAGES_PROJECT. Set it before running deploy:web.",
  );
  process.exit(1);
}

if (!skipBuild) {
  await run("npm", ["run", "build", "-w", "@jsv/web"]);
}

if (!existsSync(outputDir)) {
  console.error(
    `Frontend build output not found at ${outputDir}. Run npm run build -w @jsv/web first.`,
  );
  process.exit(1);
}

await run("npx", [
  "wrangler",
  "pages",
  "deploy",
  outputDir,
  "--project-name",
  projectName,
  "--branch",
  branch,
]);
