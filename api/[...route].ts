import type { Express } from "express";

let cachedAppPromise: Promise<Express> | null = null;

const getApp = async () => {
  if (!cachedAppPromise) {
    cachedAppPromise = import("../server.js").then(({ createApp }) =>
      createApp({ includeFrontend: false }),
    );
  }
  return await cachedAppPromise;
};

export default async function handler(req: any, res: any) {
  const app = await getApp();
  return app(req, res);
}
