import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const fecha = searchParams.get('fecha') || '';

    // Build where using raw query since Prisma client may not know AnomaliaEvento yet
    let whereClause = 'WHERE 1=1';
    const params: string[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND ("legajo" LIKE $${paramIndex} OR "nombre" ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (fecha) {
      whereClause += ` AND "fecha" = $${paramIndex}`;
      params.push(fecha);
      paramIndex++;
    }

    const anomalies: any[] = await db.$queryRawUnsafe(
      `SELECT * FROM "AnomaliaEvento" ${whereClause} ORDER BY "fecha" DESC, "hora" DESC, "legajo" ASC`,
      ...params
    );

    // Get unique dates for filter
    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT "fecha" FROM "AnomaliaEvento" ORDER BY "fecha" DESC`
    );

    return NextResponse.json({
      anomalies,
      total: anomalies.length,
      uniqueDates: dates.map((d: any) => d.fecha),
    });
  } catch (error) {
    console.error('Anomalies API error:', error);
    return NextResponse.json({ error: 'Failed to fetch anomalies' }, { status: 500 });
  }
}
