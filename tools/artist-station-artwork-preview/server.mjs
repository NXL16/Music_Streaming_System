import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4313);

createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  if (pathname !== "/" && pathname !== "/index.html") {
    response.writeHead(404).end("Not found");
    return;
  }

  try {
    const page = await readFile(join(here, "index.html"));
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(page);
  } catch {
    response.writeHead(500).end("Could not load Artist Station Artwork Preview.");
  }
}).listen(port, () => {
  console.log(`Artist Station Artwork Preview: http://localhost:${port}`);
});
