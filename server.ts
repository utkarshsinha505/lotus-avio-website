import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Serve API routes first
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy Google Drive images to avoid browser sandbox / third-party-cookie blockages
  app.get("/api/drive-image", async (req, res) => {
    const fileId = req.query.id;
    const directUrl = req.query.url;

    if (directUrl && typeof directUrl === "string") {
      try {
        console.log(`[PROXY-DIRECT-TRY] URL: ${directUrl}`);
        const response = await fetch(directUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });

        console.log(`[PROXY-DIRECT-RESULT] Status: ${response.status} Content-Length: ${response.headers.get("content-length")} Type: ${response.headers.get("content-type")}`);

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "image/jpeg";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

          const arrayBuffer = await response.arrayBuffer();
          console.log(`[PROXY-DIRECT-SUCCESS] Successfully returning ${arrayBuffer.byteLength} bytes`);
          return res.send(Buffer.from(arrayBuffer));
        }
      } catch (err) {
        console.error(`Proxy direct fetch failed for ${directUrl}:`, err);
      }
    }

    if (!fileId || typeof fileId !== "string") {
      return res.status(400).send("Missing image id or url parameter");
    }

    // List of URLs to try to fetch the image from Google Drive servers
    const urls = [
      `https://lh3.googleusercontent.com/d/${fileId}`,
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/thumbnail?sz=w1000&id=${fileId}`
    ];

    for (const url of urls) {
      try {
        console.log(`[PROXY-TRY] ID: ${fileId} from URL: ${url}`);
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });

        console.log(`[PROXY-RESULT] ID: ${fileId} Status: ${response.status} Content-Length: ${response.headers.get("content-length")} Type: ${response.headers.get("content-type")}`);

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "image/jpeg";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

          const arrayBuffer = await response.arrayBuffer();
          console.log(`[PROXY-SUCCESS] Successfully returning ${arrayBuffer.byteLength} bytes for ${fileId}`);
          return res.send(Buffer.from(arrayBuffer));
        } else {
          try {
            const textSample = await response.clone().text();
            console.log(`[PROXY-FAIL-BODY] First 200 chars: ${textSample.substring(0, 200)}`);
          } catch (_) {}
        }
      } catch (err) {
        console.error(`Proxy failed to fetch google drive asset from ${url}:`, err);
      }
    }

    return res.status(500).send("Failed to retrieve image from Google Drive servers");
  });

  // Integrate Vite Dev Server Middleware or Serve Built Files
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving production build from:", distPath);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
