import type { Request, Response } from "express";

const maxReqItems = 100;

export type RecentRequest = {
  at: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string;
};

const requestAudit: RecentRequest[] = [];

function pushRequestAudit(item: RecentRequest): void {
  requestAudit.unshift(item);
  if (requestAudit.length > maxReqItems) {
    requestAudit.length = maxReqItems;
  }
}

export function captureRequestAudit(req: Request, res: Response): void {
  if (!req.originalUrl.startsWith("/rss")) {
    return;
  }

  const startedAt = Date.now();

  res.on("finish", () => {
    pushRequestAudit({
      at: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.max(0, Date.now() - startedAt),
      ip: req.ip || "unknown",
    });
  });
}

export function getRecentRequests(limit = 10): RecentRequest[] {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
  return requestAudit.slice(0, safeLimit);
}
