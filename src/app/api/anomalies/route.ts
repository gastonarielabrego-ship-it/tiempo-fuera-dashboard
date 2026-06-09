import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

async function ensureAnomaliaTableSchema() {
  // Check if the table has the correct columns
  try {
    const cols: any[] = await db.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'AnomaliaEvento' AND column_name = 'horaEntrada1'
    `);
    if (cols.length === 0) {
      // Table has old schema - fix it by dropping and recreating
      console.log('AnomaliaEvento has old schema, recreating...');
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "AnomaliaEvento"`);
      await db.$executeRawUnsafe(`
        CREATE TABLE "AnomaliaEvento" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "legajo" TEXT NOT NULL,
          "nombre" TEXT NOT NULL,
          "fecha" TEXT NOT NULL,
          "horaEntrada1" TEXT NOT NULL,
          "horaEntrada2" TEXT NOT NULL,
          "diferenciaMinutos" INTEGER NOT NULL,
          "turno" TEXT NOT NULL,
          "sector" TEXT NOT NULL,
          "empresa" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('AnomaliaEvento table recreated with correct schema');
    }
  } catch (e) {
    console.error('Error checking/migrating AnomaliaEvento table:', e);
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureAnomaliaTableSchema();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const fecha = searchParams.get('fecha') || '';
    const fechaDesde = searchParams.get('fechaDesde') || '';
    const fechaHasta = searchParams.get('fechaHasta') || '';
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
    if (fechaDesde) {
      whereClause += ` AND "fecha" >= $${paramIndex}`;
      params.push(fechaDesde);
      paramIndex++;
    }
    if (fechaHasta) {
      whereClause += ` AND "fecha" <= $${paramIndex}`;
      params.push(fechaHasta);
      paramIndex++;
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

    // Build a simple WHERE for unique dates (reuse fechaDesde/fechaHasta)
    let datesWhereClause = '';
    const datesParams: string[] = [];
    let datesParamIndex = 1;
    if (fechaDesde) {
      datesWhereClause += ` WHERE "fecha" >= $${datesParamIndex}`;
      datesParams.push(fechaDesde);
      datesParamIndex++;
    }
    if (fechaHasta) {
      datesWhereClause += `${fechaDesde ? ' AND' : ' WHERE'} "fecha" <= $${datesParamIndex}`;
      datesParams.push(fechaHasta);
      datesParamIndex++;
    }

    const dates: any[] = datesParams.length > 0
      ? await db.$queryRawUnsafe(
          `SELECT DISTINCT "fecha" FROM "AnomaliaEvento"${datesWhereClause} ORDER BY "fecha" DESC`,
          ...datesParams
        )
      : await db.$queryRawUnsafe(
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