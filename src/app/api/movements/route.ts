import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nombre = searchParams.get('nombre') || '';
    const fecha = searchParams.get('fecha') || '';
    const fechaDesde = searchParams.get('fechaDesde') || '';
    const fechaHasta = searchParams.get('fechaHasta') || '';

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
      // Fallback: read from TiempoFuera
      const { Prisma } = await import('@prisma/client');
      const where: any = {};
      if (nombre) {
        where.OR = [
          { nombre: { contains: nombre } },
          { legajo: { contains: nombre } },
        ];
      }
      if (fecha) where.fecha = fecha;
      if (fechaDesde || fechaHasta) {
        const fechaFilter: any = {};
        if (fechaDesde) fechaFilter.gte = fechaDesde;
        if (fechaHasta) fechaFilter.lte = fechaHasta;
        where.fecha = fechaFilter;
      }

      const sessions = await db.tiempoFuera.findMany({
        where,
        orderBy: { fecha: 'desc' },
        take: 800,
      });

      const movements: any[] = [];
      for (const s of sessions) {
        movements.push(
          { tipo: 'Salida Depo', legajo: s.legajo, nombre: s.nombre, fecha: s.fecha, hora: s.horaSalida, turno: s.turno, sector: s.sector, empresa: s.empresa },
          { tipo: 'Entrada Depo', legajo: s.legajo, nombre: s.nombre, fecha: s.fecha, hora: s.horaEntrada, turno: s.turno, sector: s.sector, empresa: s.empresa, duracionMinutos: s.duracionMinutos }
        );
      }
      movements.sort((a: any, b: any) => {
        if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
        if (a.legajo !== b.legajo) return a.legajo.localeCompare(b.legajo);
        return a.hora.localeCompare(b.hora);
      });

      return NextResponse.json({ movements, total: movements.length, uniqueNames: [], uniqueDates: [] });
    }

    // Build WHERE clause
    let whereClause = 'WHERE 1=1';
    whereClause += ` AND "empresa" NOT IN ('GESTION EE-EXTERNO', 'GESTION EE-EXTERNO(SELECCION)', 'G.L.D. GREMIAL EE')`;
    const params: string[] = [];
    let pIdx = 1;

    if (nombre) {
      whereClause += ` AND ("legajo" LIKE $${pIdx} OR "nombre" ILIKE $${pIdx})`;
      params.push(`%${nombre}%`); pIdx++;
    }
    if (fecha) {
      whereClause += ` AND "fecha" = $${pIdx}`;
      params.push(fecha); pIdx++;
    }
    if (fechaDesde) {
      whereClause += ` AND "fecha" >= $${pIdx}`;
      params.push(fechaDesde); pIdx++;
    }
    if (fechaHasta) {
      whereClause += ` AND "fecha" <= $${pIdx}`;
      params.push(fechaHasta); pIdx++;
    }

    // SQL sin jornada TN: cada fichada en su fecha real
    // Para TN, se anula la duración cuando prev_hora está entre 06:00-10:00 (egreso fin de turno)
    // porque lo que sigue es la primer fichada de la nueva jornada
    const sql = `
      WITH raw_fichadas AS (
        SELECT * FROM "Fichada" ${whereClause}
      ),
      ordered AS (
        SELECT *,
          LAG(hora) OVER (PARTITION BY legajo, "fecha" ORDER BY hora) as prev_hora,
          ROW_NUMBER() OVER (PARTITION BY legajo, "fecha" ORDER BY hora) as rn
        FROM raw_fichadas
      ),
      with_dur AS (
        SELECT *,
          CASE
            WHEN prev_hora IS NOT NULL AND rn > 1
              AND NOT (turno ILIKE 'TN%' AND prev_hora >= '06:00:00' AND prev_hora < '10:00:00') THEN
              ROUND(EXTRACT(EPOCH FROM hora::time - prev_hora::time) / 60, 2)
            ELSE NULL
          END as dur_min
        FROM ordered
      )
      SELECT tipo, legajo, nombre, "fecha", hora, turno, sector, empresa, dur_min
      FROM with_dur
      ORDER BY "fecha" DESC, legajo ASC, hora ASC
    `;

    const rows: any[] = params.length > 0
      ? await db.$queryRawUnsafe(sql, ...params)
      : await db.$queryRawUnsafe(sql);

    const movements = rows.map((r: any) => ({
      tipo: r.tipo,
      legajo: r.legajo,
      nombre: r.nombre,
      fecha: r.fecha,
      hora: r.hora,
      turno: r.turno,
      sector: r.sector,
      empresa: r.empresa,
      duracionMinutos: r.dur_min,
    }));

    // Unique names and dates
    const uniqueNames: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT nombre FROM "Fichada" ORDER BY nombre ASC LIMIT 500`
    );
    const uniqueDates: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT "fecha" FROM "Fichada" ORDER BY "fecha" DESC`
    );

    return NextResponse.json({
      movements,
      total: movements.length,
      uniqueNames: uniqueNames.map((n: any) => n.nombre),
      uniqueDates: uniqueDates.map((d: any) => d.fecha),
    });
  } catch (error) {
    console.error('Movements API error:', error);
    return NextResponse.json({
      error: 'Failed to fetch movements',
      movements: [],
      total: 0,
      uniqueNames: [],
      uniqueDates: [],
    }, { status: 500 });
  }
}
