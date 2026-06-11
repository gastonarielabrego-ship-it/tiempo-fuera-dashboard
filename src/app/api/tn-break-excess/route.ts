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

    let whereClause = 'WHERE 1=1';
    whereClause += ` AND "empresa" NOT IN ('GESTION EE-EXTERNO', 'GESTION EE-EXTERNO(SELECCION)', 'G.L.D. GREMIAL EE')`;
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

    // Buscar pares Salida->Entrada en ventana 02:45 - 03:45 AM, umbral 15 min
    const sql = `
      WITH raw_fichadas AS (
        SELECT * FROM "Fichada" ${whereClause}
      ),
      with_jornada AS (
        SELECT *,
          CASE
            WHEN turno ILIKE 'TN%' AND hora < '06:00:00' THEN
              TO_CHAR(("fecha"::date - INTERVAL '1 day'), 'YYYY-MM-DD')
            ELSE "fecha"
          END as jornada
        FROM raw_fichadas
      ),
      tn_break_window AS (
        SELECT * FROM with_jornada
        WHERE hora >= '02:45:00' AND hora <= '03:45:00'
      ),
      with_next AS (
        SELECT *,
          LEAD(hora) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as next_hora,
          LEAD(tipo) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as next_tipo,
          LEAD(nombre) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as next_nombre,
          LEAD(sector) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as next_sector,
          LEAD(empresa) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as next_empresa,
          LEAD(turno) OVER (PARTITION BY legajo, jornada ORDER BY "fecha", hora) as next_turno
        FROM tn_break_window
      ),
      tn_break_pairs AS (
        SELECT
          legajo,
          nombre,
          jornada as fecha,
          hora as hora_salida,
          next_hora as hora_entrada,
          turno,
          sector,
          empresa,
          (EXTRACT(EPOCH FROM next_hora::time - hora::time) / 60) as dur_min
        FROM with_next
        WHERE tipo = 'Salida Depo'
          AND next_tipo = 'Entrada Depo'
          AND (EXTRACT(EPOCH FROM next_hora::time - hora::time) / 60) > 15
          AND (EXTRACT(EPOCH FROM next_hora::time - hora::time) / 60) < 1440
      )
      SELECT
        legajo,
        nombre,
        fecha,
        hora_salida,
        hora_entrada,
        ROUND(dur_min::numeric, 2) as duracion_total,
        ROUND((dur_min - 15)::numeric, 2) as exceso_minutos,
        turno,
        sector,
        empresa
      FROM tn_break_pairs
      ORDER BY exceso_minutos DESC
    `;

    const rows: any[] = params.length > 0
      ? await db.$queryRawUnsafe(sql, ...params)
      : await db.$queryRawUnsafe(sql);

    const excesos = rows.map((r) => ({
      legajo: r.legajo,
      nombre: r.nombre,
      fecha: r.fecha,
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
    console.error('TN break excess API error:', error);
    return NextResponse.json({ excesos: [], total: 0 }, { status: 500 });
  }
}