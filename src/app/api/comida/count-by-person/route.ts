import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Returns TK comida count grouped by collaborator name, sorted by count desc.
 */
export async function GET(request: NextRequest) {
  try {
    const rows: any[] = await db.$queryRawUnsafe(`
      SELECT "nombre", COUNT(*)::int as total_tk
      FROM "Comida"
      GROUP BY "nombre"
      ORDER BY total_tk DESC, "nombre" ASC
    `);
    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json({ data: [] });
  }
}