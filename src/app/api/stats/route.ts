import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector') || '';
    const empresa = searchParams.get('empresa') || '';
    const fechaDesde = searchParams.get('fechaDesde') || '';
    const fechaHasta = searchParams.get('fechaHasta') || '';
    const turnoTipo = searchParams.get('turnoTipo') || '';

    // Build WHERE clause for Fichada
    let whereClause = 'WHERE 1=1';
    const params: string[] = [];
    let pIdx = 1;

    if (sector) {
      whereClause += ` AND "sector" = $${pIdx}`;
      params.push(sector); pIdx++;
    }
    if (empresa) {
      whereClause += ` AND "empresa" = $${pIdx}`;
      params.push(empresa); pIdx++;
    }
    if (fechaDesde) {
      whereClause += ` AND "fecha" >= $${pIdx}`;
      params.push(fechaDesde); pIdx++;
    }
    if (fechaHasta) {
      whereClause += ` AND "fecha" <= $${pIdx}`;
      params.push(fechaHasta); pIdx++;
    }
    if (turnoTipo) {
      if (turnoTipo === 'Descanso') {
        whereClause += ` AND "turno" ILIKE 'Descanso%'`;
      } else if (turnoTipo === 'MM') {
        whereClause += ` AND "turno" ILIKE 'MM%'`;
      } else {
        whereClause += ` AND "turno" ILIKE $${pIdx}`;
        params.push(`${turnoTipo} -%`); pIdx++;
      }
    }

    // Check if Fichada table exists
    let tableExists = false;
    try {
      const tbl: any[] = await db.$queryRawUnsafe(
        `SELECT table_name FROM information_schema.tables WHERE table_name = 'Fichada'`
      );
      tableExists = tbl.length > 0;
    } catch (e) {
      tableExists = false;
    }

    let totalEgresos = 0;
    let totalIngresos = 0;
    let totalMinutos = 0;
    let promedioMinutos = 0;
    let empleadosUnicos = 0;

    if (tableExists) {
      // Count egresos and ingresos
      const countQuery = `SELECT 
        COUNT(*) FILTER (WHERE "tipo" = 'Salida Depo')::int as egresos,
        COUNT(*) FILTER (WHERE "tipo" = 'Entrada Depo')::int as ingresos
        FROM "Fichada" ${whereClause}`;

      const counts: any[] = params.length > 0
        ? await db.$queryRawUnsafe(countQuery, ...params)
        : await db.$queryRawUnsafe(countQuery);

      if (counts.length > 0) {
        totalEgresos = counts[0].egresos || 0;
        totalIngresos = counts[0].ingresos || 0;
      }

      // Total minutos and promedio: sum of Ingreso durations only with TN jornada
      const statsSql = `
        WITH raw_fichadas AS (
          SELECT * FROM "Fichada" ${whereClause}
        ),
        with_jornada AS (
          SELECT *,
            CASE
              WHEN turno ILIKE 'TN%' AND hora < '10:00:00' THEN
                TO_CHAR(("fecha"::date - INTERVAL '1 day'), 'YYYY-MM-DD')
              ELSE "fecha"
            END as jornada
          FROM raw_fichadas
        ),
        ordered AS (
          SELECT *,
            LAG(hora) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as prev_hora
          FROM with_jornada
        ),
        with_dur AS (
          SELECT *,
            CASE
              WHEN prev_hora IS NOT NULL THEN
                (EXTRACT(EPOCH FROM hora::time - prev_hora::time) / 60)
              ELSE NULL
            END as dur_min
          FROM ordered
        )
        SELECT
          ROUND(SUM(CASE WHEN tipo = 'Entrada Depo' AND dur_min > 0 AND dur_min < 1440 THEN dur_min ELSE 0 END)::numeric, 2) as total_min,
          ROUND(AVG(CASE WHEN tipo = 'Entrada Depo' AND dur_min > 0 AND dur_min < 1440 THEN dur_min END)::numeric, 2) as avg_min,
          COUNT(DISTINCT legajo) as empleados
        FROM with_dur
      `;

      const statsRows: any[] = params.length > 0
        ? await db.$queryRawUnsafe(statsSql, ...params)
        : await db.$queryRawUnsafe(statsSql);

      if (statsRows.length > 0) {
        totalMinutos = Number(statsRows[0].total_min) || 0;
        promedioMinutos = Number(statsRows[0].avg_min) || 0;
        empleadosUnicos = Number(statsRows[0].empleados) || 0;
      }
    } else {
      // Fallback: use TiempoFuera
      const { Prisma } = await import('@prisma/client');
      const where: any = {};
      if (sector) where.sector = sector;
      if (empresa) where.empresa = empresa;
      if (fechaDesde || fechaHasta) {
        const f: any = {};
        if (fechaDesde) f.gte = fechaDesde;
        if (fechaHasta) f.lte = fechaHasta;
        where.fecha = f;
      }
      if (turnoTipo) {
        if (turnoTipo === 'Descanso') where.turno = { startsWith: 'Descanso' };
        else if (turnoTipo === 'MM') where.turno = { startsWith: 'MM' };
        else where.turno = { startsWith: turnoTipo + ' -' };
      }

      const totalStats = await db.tiempoFuera.aggregate({
        where,
        _sum: { duracionMinutos: true },
        _count: { id: true },
        _avg: { duracionMinutos: true },
      });

      const uniqueEmployees = await db.tiempoFuera.groupBy({
        by: ['legajo'],
        where,
      });

      totalMinutos = Math.round((totalStats._sum.duracionMinutos || 0) * 100) / 100;
      promedioMinutos = Math.round((totalStats._avg.duracionMinutos || 0) * 100) / 100;
      empleadosUnicos = uniqueEmployees.length;
    }

    const totalHoras = Math.round(totalMinutos / 60 * 100) / 100;

    return NextResponse.json({
      totalRegistros: totalEgresos + totalIngresos,
      totalMinutos,
      totalHoras,
      empleadosUnicos,
      promedioMinutos,
      totalEgresos,
      totalIngresos,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
