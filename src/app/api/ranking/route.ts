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
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'tiempo';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '25');

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

    if (!tableExists) {
      // Fallback: use TiempoFuera (original behavior)
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
      if (search) {
        where.OR = [
          { legajo: { contains: search } },
          { nombre: { contains: search } },
        ];
      }

      const ranking = await db.tiempoFuera.groupBy({
        by: ['legajo', 'nombre'],
        where,
        _sum: { duracionMinutos: true },
        _count: { id: true },
        _avg: { duracionMinutos: true },
        orderBy: sortBy === 'salidas'
          ? { _count: { id: 'desc' } }
          : { _sum: { duracionMinutos: 'desc' } },
      });

      const ranked = ranking.map((r, i) => {
        const rawTotal = Math.round((r._sum.duracionMinutos || 0) * 100) / 100;
        const descuento = rawTotal >= 60 ? 60 : 0;
        return {
          ranking: i + 1,
          legajo: r.legajo,
          nombre: r.nombre,
          totalMinutos: rawTotal,
          descuentoMinutos: descuento,
          netoMinutos: Math.round((rawTotal - descuento) * 100) / 100,
          cantidadSalidas: r._count.id,
          cantidadIngresos: r._count.id,
          promedioMinutos: Math.round((r._avg.duracionMinutos || 0) * 100) / 100,
          turno: '-',
        };
      });

      return NextResponse.json({
        ranking: ranked.slice((page - 1) * pageSize, page * pageSize),
        total: ranked.length,
        page, pageSize,
        totalPages: Math.ceil(ranked.length / pageSize),
        sortBy,
        filters: { sectores: [], empresas: [], fechaMin: '', fechaMax: '' },
      });
    }

    // Build WHERE clause for Fichada
    let whereClause = 'WHERE 1=1';
    whereClause += ` AND "empresa" != 'Gestion Externo'`;
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
    if (search) {
      whereClause += ` AND ("legajo" LIKE $${pIdx} OR "nombre" ILIKE $${pIdx})`;
      params.push(`%${search}%`); pIdx++;
    }

    // Calcular duración con LAG + jornada TN: eventos TN >= 17:00 van al día siguiente
    const sql = `
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
        legajo,
        MAX(nombre) as nombre,
        ROUND(SUM(CASE WHEN tipo = 'Entrada Depo' AND dur_min > 0 AND dur_min < 1440 THEN dur_min ELSE 0 END)::numeric, 2) as total_minutos,
        COUNT(CASE WHEN tipo = 'Entrada Depo' AND dur_min > 0 AND dur_min < 1440 THEN 1 END) as cantidad_ingresos,
        ROUND(AVG(CASE WHEN tipo = 'Entrada Depo' AND dur_min > 0 AND dur_min < 1440 THEN dur_min END)::numeric, 2) as promedio_minutos,
        COUNT(CASE WHEN tipo = 'Salida Depo' THEN 1 END) as cantidad_salidas
      FROM with_dur
      GROUP BY legajo
    `;

    const rows: any[] = params.length > 0
      ? await db.$queryRawUnsafe(sql, ...params)
      : await db.$queryRawUnsafe(sql);

    const ranked = rows.map((r, i) => {
      const rawTotal = Number(r.total_minutos) || 0;
      const descuento = rawTotal >= 60 ? 60 : 0;
      const neto = Math.round((rawTotal - descuento) * 100) / 100;
      return {
        ranking: 0,
        legajo: r.legajo,
        nombre: r.nombre,
        totalMinutos: Math.round(rawTotal * 100) / 100,
        descuentoMinutos: Math.round(descuento * 100) / 100,
        netoMinutos: neto,
        cantidadSalidas: Number(r.cantidad_salidas) || 0,
        cantidadIngresos: Number(r.cantidad_ingresos) || 0,
        promedioMinutos: Number(r.promedio_minutos) || 0,
        turno: '-',
      };
    });

    // Ordenar por tiempo neto
    ranked.sort((a, b) => sortBy === 'salidas'
      ? b.cantidadSalidas - a.cantidadSalidas
      : b.netoMinutos - a.netoMinutos
    );
    ranked.forEach((r, i) => r.ranking = i + 1);

    const total = ranked.length;
    const start = (page - 1) * pageSize;
    const paginated = ranked.slice(start, start + pageSize);

    // Get unique sectors and empresas for filters
    const allSectores: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT "sector" as sector FROM "Fichada" ORDER BY sector ASC`
    );
    const allEmpresas: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT "empresa" as empresa FROM "Fichada" WHERE "empresa" != 'Gestion Externo' ORDER BY empresa ASC`
    );
    const dateRange: any[] = await db.$queryRawUnsafe(
      `SELECT MIN("fecha") as "fechaMin", MAX("fecha") as "fechaMax" FROM "Fichada"`
    );

    return NextResponse.json({
      ranking: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      sortBy,
      filters: {
        sectores: allSectores.map(s => s.sector),
        empresas: allEmpresas.map(e => e.empresa),
        fechaMin: dateRange[0]?.fechaMin || '',
        fechaMax: dateRange[0]?.fechaMax || '',
      },
    });
  } catch (error) {
    console.error('Ranking API error:', error);
    return NextResponse.json({ error: 'Failed to fetch ranking', ranking: [], total: 0, page: 1, pageSize: 25, totalPages: 0, sortBy: 'tiempo', filters: { sectores: [], empresas: [], fechaMin: '', fechaMax: '' } }, { status: 500 });
  }
}
