import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Lightweight endpoint for merge data only.
 * No pagination, no count, no dates, no summary, no table existence check.
 */
export async function GET() {
  try {
    const rows: any[] = await db.$queryRawUnsafe(`
      SELECT "nombre", "dni", "fecha", "horario"
      FROM "Comida"
    `);
    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json({ data: [] });
  }
}