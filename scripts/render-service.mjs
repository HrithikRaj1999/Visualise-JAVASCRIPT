import { existsSync, readFileSync } from "node:fs";

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

const baseUrl = "https://api.render.com/v1";
const action = (process.argv[2] ?? "status").toLowerCase();
const apiKey = process.env.RENDER_API_KEY;
const serviceId = process.env.RENDER_SERVICE_ID;

if (!apiKey || !serviceId) {
  console.error(
    "Missing RENDER_API_KEY or RENDER_SERVICE_ID. Set both before running Render commands.",
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function request(path, method) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
  });

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String(body.message)
        : raw;
    throw new Error(`${method} ${path} failed (${response.status}): ${message}`);
  }
  return body;
}

async function run() {
  switch (action) {
    case "status": {
      const result = await request(`/services/${serviceId}`, "GET");
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "deploy": {
      const result = await request(`/services/${serviceId}/deploys`, "POST");
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "resume":
    case "start": {
      const resumeResult = await request(`/services/${serviceId}/resume`, "POST");
      console.log(JSON.stringify(resumeResult, null, 2));
      if (action === "start") {
        const deployResult = await request(`/services/${serviceId}/deploys`, "POST");
        console.log(JSON.stringify(deployResult, null, 2));
      }
      return;
    }
    case "suspend":
    case "stop": {
      const result = await request(`/services/${serviceId}/suspend`, "POST");
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    default:
      console.error(
        "Unknown action. Use one of: status, deploy, resume, suspend, start, stop.",
      );
      process.exit(1);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
