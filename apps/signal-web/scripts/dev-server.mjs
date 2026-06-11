import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = join(appDir, "dist");
const preferredPort = Number(process.env.PORT ?? 5173);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function safePath(pathname) {
  const withoutQuery = decodeURIComponent(pathname.split("?")[0] ?? "/");
  const candidate = withoutQuery === "/" ? "/index.html" : withoutQuery;
  const normalized = normalize(candidate).replace(/^(\.\.[/\\])+/, "");
  return join(rootDir, normalized);
}

function start(port) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const filePath = safePath(url.pathname);

    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      const body = await readFile(join(rootDir, "index.html"));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(body);
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      start(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`crm_signal Console: http://127.0.0.1:${port}`);
  });
}

start(preferredPort);
