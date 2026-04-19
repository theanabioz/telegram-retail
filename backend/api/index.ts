import { createApp } from "../src/app.js";

const app = createApp();

export default function handler(req: any, res: any) {
  if (req.url === "/health") {
    res.status(200).json({
      ok: true,
      service: "telegram-retail-backend",
    });
    return;
  }

  return app(req, res);
}
