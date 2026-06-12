import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Lightweight endpoint for merge data only.
 * No pagination, no count, no dates, no summary, no table existence check.
 * Just returns raw records for the Movimientos tab merge map.
 */
export async function GET() {
  try {
    const rows: any[] = await db.$queryRawUnsafe(`
      SELECT "nombre", "apellido", "dni", "fecha", "horario", "zona"
      FROM "Facial"
    `);
    return NextResponse.json({ data: rows });
  } catch (error) {
    // Table might not exist — return empty
    return NextResponse.json({ data: [] });
  }
}