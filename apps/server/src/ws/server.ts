import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import { logger } from "../lib/logger";
import { handleRunCode } from "./handlers/runCode";

import { ClientCommand, parseClientCommand } from "@jsv/protocol";

export function createServer(port: number) {
  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(426, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Use WebSocket protocol." }));
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket) => {
    logger.info("Client connected");

    socket.on("message", async (raw) => {
      let command: ClientCommand;
      try {
        command = parseClientCommand(JSON.parse(raw.toString()));
      } catch {
        return;
      }

      if (command.type === "RUN_CODE") {
        await handleRunCode(socket, command.payload);
      }
    });
  });

  httpServer.listen(port, () => {
    logger.info(`WebSocket server listening on port ${port}`);
  });

  return {
    close: (cb?: () => void) => {
      wss.close(() => {
        httpServer.close(cb);
      });
    },
  };
}
