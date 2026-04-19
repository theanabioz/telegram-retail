type JsonResponse = {
  status?: number;
  body: Record<string, unknown>;
};

let appPromise: Promise<any> | null = null;

function sendJson(res: any, { status = 200, body }: JsonResponse) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function withTimeout<T>(label: string, task: Promise<T>, timeoutMs = 5000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function getApp() {
  if (!appPromise) {
    appPromise = import("../src/app.js").then(({ createApp }) => createApp());
  }

  return appPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await withTimeout("app creation", getApp());
    return app(req, res);
  } catch (error) {
    sendJson(res, {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : "Backend bootstrap failed",
      },
    });
  }
}
