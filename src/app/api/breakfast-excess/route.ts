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
    const search = searchParams.get('search') || '';

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
      return NextResponse.json({ excesos: [], total: 0 });
    }

    // Build WHERE clause
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
    if (search) {
      whereClause += ` AND ("legajo" LIKE $${pIdx} OR "nombre" ILIKE $${pIdx})`;
      params.push(`%${search}%`); pIdx++;
    }

    // Solo eventos entre 06:30 y 10:30, con LAG para duración, jornada TN
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
          LAG(hora) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as prev_hora,
          LAG(tipo) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as prev_tipo
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
      breakfast_events AS (
        SELECT *
        FROM with_dur
        WHERE hora >= '06:30:00' AND hora <= '10:30:00'
          AND dur_min IS NOT NULL
          AND dur_min > 25
          AND dur_min < 1440
      )
      SELECT
        legajo,
        nombre,
        jornada as fecha,
        prev_tipo as tipo_salida,
        tipo as tipo_entrada,
        prev_hora as hora_salida,
        hora as hora_entrada,
        ROUND(dur_min::numeric, 2) as duracion_total,
        ROUND((dur_min - 25)::numeric, 2) as exceso_minutos,
        turno,
        sector,
        empresa
      FROM breakfast_events
      ORDER BY exceso_minutos DESC, fecha, hora
    `;

    const rows: any[] = params.length > 0
      ? await db.$queryRawUnsafe(sql, ...params)
      : await db.$queryRawUnsafe(sql);

    const excesos = rows.map((r) => ({
      legajo: r.legajo,
      nombre: r.nombre,
      fecha: r.fecha,
      tipoSalida: r.tipo_salida || 'Salida Depo',
      tipoEntrada: r.tipo_entrada || 'Entrada Depo',
      horaSalida: r.hora_salida,
      horaEntrada: r.hora_entrada,
      duracionTotal: Number(r.duracion_total) || 0,
      excesoMinutos: Number(r.exceso_minutos) || 0,
      turno: r.turno,
      sector: r.sector,
      empresa: r.empresa,
    }));

    return NextResponse.json({
      excesos,
      total: excesos.length,
    });
  } catch (error) {
    console.error('Breakfast excess API error:', error);
    return NextResponse.json({ excesos: [], total: 0 }, { status: 500 });
  }
}