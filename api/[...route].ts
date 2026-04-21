import type { Express } from "express";
import { createApp } from "../server.ts";

let cachedAppPromise: Promise<Express> | null = null;

const getApp = () => {
  if (!cachedAppPromise) {
    cachedAppPromise = createApp({ includeFrontend: false });
  }
  return cachedAppPromise;
};

export default async function handler(req: any, res: any) {
  const app = await getApp();
  return app(req, res);
}
