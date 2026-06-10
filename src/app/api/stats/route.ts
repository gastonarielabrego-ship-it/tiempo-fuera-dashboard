import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sectors = searchParams.getAll('sector').filter(Boolean);
    const empresas = searchParams.getAll('empresa').filter(Boolean);
    const fechaDesde = searchParams.get('fechaDesde') || '';
    const fechaHasta = searchParams.get('fechaHasta') || '';
    const turnoTipo = searchParams.get('turnoTipo') || '';

    // Build WHERE clause for Fichada
    let whereClause = 'WHERE 1=1';
    const params: string[] = [];
    let pIdx = 1;

    if (sectors.length > 0) {
      const placeholders = sectors.map(() => `$${pIdx++}`);
      whereClause += ` AND "sector" IN (${placeholders.join(',')})`;
      params.push(...sectors);
    }
    if (empresas.length > 0) {
      const placeholders = empresas.map(() => `$${pIdx++}`);
      whereClause += ` AND "empresa" IN (${placeholders.join(',')})`;
      params.push(...empresas);
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
              WHEN turno ILIKE 'TN%' AND hora >= '17:00:00' THEN
                TO_CHAR(("fecha"::date + INTERVAL '1 day'), 'YYYY-MM-DD')
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
          COUNT(DISTINCT legajo) as empleados
        FROM with_dur
      `;

      const statsRows: any[] = params.length > 0
        ? await db.$queryRawUnsafe(statsSql, ...params)
        : await db.$queryRawUnsafe(statsSql);

      if (statsRows.length > 0) {
        empleadosUnicos = Number(statsRows[0].empleados) || 0;
        const rawTotal = Number(statsRows[0].total_min) || 0;
        // Descontar 60 min por empleado (descanso) solo si ese empleado supera 60 min
        // Se necesita un segundo query para saber cuántos empleados superan 60 min
        if (empleadosUnicos > 0 && rawTotal > 0) {
          const ajusteSql = `
            WITH raw_fichadas AS (
              SELECT * FROM "Fichada" ${whereClause}
            ),
            with_jornada AS (
              SELECT *,
                CASE
                  WHEN turno ILIKE 'TN%' AND hora >= '17:00:00' THEN
                    TO_CHAR(("fecha"::date + INTERVAL '1 day'), 'YYYY-MM-DD')
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
            ),
            per_emp AS (
              SELECT legajo,
                SUM(CASE WHEN tipo = 'Entrada Depo' AND dur_min > 0 AND dur_min < 1440 THEN dur_min ELSE 0 END) as emp_total
              FROM with_dur
              GROUP BY legajo
              HAVING SUM(CASE WHEN tipo = 'Entrada Depo' AND dur_min > 0 AND dur_min < 1440 THEN dur_min ELSE 0 END) > 60
            )
            SELECT
              ROUND(SUM(emp_total - 60)::numeric, 2) as descuento_total,
              COUNT(*) as empleados_con_descuento
            FROM per_emp
          `;
          const ajusteRows: any[] = params.length > 0
            ? await db.$queryRawUnsafe(ajusteSql, ...params)
            : await db.$queryRawUnsafe(ajusteSql);
          if (ajusteRows.length > 0) {
            const descuento = Number(ajusteRows[0].descuento_total) || 0;
            totalMinutos = Math.round((rawTotal - descuento) * 100) / 100;
          } else {
            totalMinutos = Math.round(rawTotal * 100) / 100;
          }
        } else {
          totalMinutos = Math.round(rawTotal * 100) / 100;
        }
        // Promedio = total ajustado / empleados
        promedioMinutos = empleadosUnicos > 0 ? Math.round((totalMinutos / empleadosUnicos) * 100) / 100 : 0;
      }
    } else {
      // Fallback: use TiempoFuera
      const { Prisma } = await import('@prisma/client');
      const where: any = {};
      if (sectors.length === 1) where.sector = sectors[0];
      else if (sectors.length > 1) where.sector = { in: sectors };
      if (empresas.length === 1) where.empresa = empresas[0];
      else if (empresas.length > 1) where.empresa = { in: empresas };
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
