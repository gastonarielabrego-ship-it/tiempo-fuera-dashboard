import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const fecha = searchParams.get('fecha') || '';
    const turnoTipo = searchParams.get('turnoTipo') || '';

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
    if (turnoTipo) {
      if (turnoTipo === 'Descanso') {
        whereClause += ` AND "turno" ILIKE 'Descanso%'`;
      } else if (turnoTipo === 'MM') {
        whereClause += ` AND "turno" ILIKE 'MM%'`;
      } else {
        whereClause += ` AND "turno" ILIKE $${paramIndex}`;
        params.push(`${turnoTipo} -%`);
        paramIndex++;
      }
    }

    let anomalies: any[];
    if (params.length > 0) {
      anomalies = await db.$queryRawUnsafe(
        `SELECT * FROM "AnomaliaEvento" ${whereClause} ORDER BY "fecha" DESC, "horaEntrada1" ASC, "legajo" ASC`,
        ...params
      );
    } else {
      anomalies = await db.$queryRawUnsafe(
        `SELECT * FROM "AnomaliaEvento" ${whereClause} ORDER BY "fecha" DESC, "horaEntrada1" ASC, "legajo" ASC`
      );
    }

    const dates: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT "fecha" FROM "AnomaliaEvento" ORDER BY "fecha" DESC`
    );

    return NextResponse.json({
      anomalies: anomalies || [],
      total: anomalies?.length || 0,
      uniqueDates: dates.map((d: any) => d.fecha),
    });
  } catch (error) {
    console.error('Anomalies API error:', error);
    return NextResponse.json({ 
      anomalies: [], 
      total: 0, 
      uniqueDates: [],
      error: 'Failed to fetch anomalies' 
    }, { status: 500 });
  }
}