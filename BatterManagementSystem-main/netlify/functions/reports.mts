import type { Config, Context } from '@netlify/functions';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index';
import { simulationReports as reports } from '../../db/schema';
import type { StoredReport } from '../../reportGenerator';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store' };
export default async (req: Request, context: Context) => {
  let owner = context.cookies.get('bms_history');
  if (!owner || !uuid.test(owner)) {
    owner = crypto.randomUUID();
    context.cookies.set({ name: 'bms_history', value: owner, httpOnly: true, secure: new URL(req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: 31536000 });
  }
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  try {
    const url = new URL(req.url);
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        if (!uuid.test(id)) return reply({ error: 'Invalid report ID.' }, 400);
        const [row] = await db.select({ report: reports.report }).from(reports).where(and(eq(reports.ownerId, owner), eq(reports.id, id)));
        return row ? reply(row.report) : reply({ error: 'Report not found.' }, 404);
      }
      const page = Math.max(0, Math.min(10000, Number(url.searchParams.get('page')) || 0));
      const rows = await db.select().from(reports).where(eq(reports.ownerId, owner)).orderBy(desc(reports.startedAt)).limit(21).offset(Math.floor(page) * 20);
      return reply({ hasMore: rows.length > 20, reports: rows.slice(0, 20).map(row => ({
        id: row.id, startedAt: row.startedAt, updatedAt: row.updatedAt,
        label: row.report.label, session: row.report.session,
      })) });
    }
    if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    if (req.headers.get('origin') !== url.origin) return reply({ error: 'Invalid request origin.' }, 403);
    const text = await req.text();
    if (new TextEncoder().encode(text).length > 4_000_000) return reply({ error: 'Report exceeds the storage limit.' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return reply({ error: 'Invalid JSON.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Invalid report request.' }, 400);
    const { id, startedAt, report } = body as { id: string; startedAt: string; report: StoredReport };
    if (!uuid.test(id ?? '') || !Number.isFinite(Date.parse(startedAt)) || !report?.ctx ||
      !Array.isArray(report.ctx.cells) || report.ctx.cells.length < 1 || report.ctx.cells.length > 384 ||
      !report.session || typeof report.label !== 'string' || report.label.length > 200 ||
      !report.ctx.telemetry || !report.ctx.chemistrySpec || !report.ctx.config ||
      !Array.isArray(report.ctx.logs) || !Array.isArray(report.ctx.snapshots) ||
      !Number.isFinite(report.session.elapsedMs) || !Number.isFinite(report.ctx.seriesCount) ||
      !report.ctx.cells.every(c => Number.isFinite(c.id) && Number.isFinite(c.voltage) && Array.isArray(c.history))) {
      return reply({ error: 'Invalid simulation report.' }, 400);
    }
    await db.insert(reports).values({ id, ownerId: owner, startedAt: new Date(startedAt), report })
      .onConflictDoUpdate({ target: reports.id, set: { report, updatedAt: new Date() }, where: eq(reports.ownerId, owner) });
    return reply({ id });
  } catch {
    return reply({ error: 'Report storage is temporarily unavailable. Please retry.' }, 503);
  }
};
export const config: Config = { path: '/api/reports' };
