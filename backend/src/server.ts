import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config.js";
import { attachRealtimeServer } from "./realtime/server.js";

const app = createApp();
const server = createServer(app);

attachRealtimeServer(server);

server.listen(env.PORT, () => {
  console.log(`Telegram Retail backend listening on port ${env.PORT}`);
});
