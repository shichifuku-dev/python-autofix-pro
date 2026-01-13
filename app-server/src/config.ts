export type AppConfig = {
  appId: number;
  privateKey: string;
  webhookSecret: string;
  port: number;
  docsUrl?: string;
};

export const loadConfig = (): AppConfig => {
  const appIdRaw = process.env.APP_ID;
  if (!appIdRaw) {
    throw new Error("APP_ID is required.");
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required.");
  }

  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("WEBHOOK_SECRET is required.");
  }

  const port = Number(process.env.PORT ?? "3000");
  if (Number.isNaN(port)) {
    throw new Error("PORT must be a number.");
  }

  return {
    appId: Number(appIdRaw),
    privateKey,
    webhookSecret,
    port,
    docsUrl: process.env.DOCS_URL,
  };
};
