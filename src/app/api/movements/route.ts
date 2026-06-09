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

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];
    let paramIndex = 1;

    if (nombre) {
      whereClause += ` AND ("legajo" LIKE $${paramIndex} OR "nombre" ILIKE $${paramIndex})`;
      params.push(`%${nombre}%`);
      paramIndex++;
    }
    if (fecha) {
      whereClause += ` AND "fecha" = $${paramIndex}`;
      params.push(fecha);
      paramIndex++;
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
      // Fallback: read from TiempoFuera (old behavior)
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
        const fechaFilter: any = { ...(where.fecha && typeof where.fecha === 'object' ? where.fecha : {}) };
        if (typeof where.fecha === 'string') fechaFilter.equals = where.fecha;
        if (fechaDesde) fechaFilter.gte = fechaDesde;
        if (fechaHasta) fechaFilter.lte = fechaHasta;
        where.fecha = fechaFilter;
      }

      const sessions = await db.tiempoFuera.findMany({
        where,
        orderBy: { fecha: 'desc' },
        take: 800,
      });

      const movements = [];
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

    // Read ALL fichadas from Fichada table (todas las fichadas individuales)
    let fichadas: any[];
    if (params.length > 0) {
      fichadas = await db.$queryRawUnsafe(
        `SELECT * FROM "Fichada" ${whereClause} ORDER BY "fecha" DESC, "legajo" ASC, "hora" ASC`,
        ...params
      );
    } else {
      fichadas = await db.$queryRawUnsafe(
        `SELECT * FROM "Fichada" ${whereClause} ORDER BY "fecha" DESC, "legajo" ASC, "hora" ASC`
      );
    }

    // Calcular duración dinámicamente entre filas consecutivas por legajo + fecha
    // Solo se muestra duración en Salida (Egreso): tiempo hasta la próxima Entrada
    const movements: any[] = [];
    for (let i = 0; i < fichadas.length; i++) {
      const f = fichadas[i];
      let dur = null;

      if (f.tipo === 'Salida Depo') {
        // Buscar la próxima Entrada para el mismo legajo+fecha
        for (let j = i + 1; j < fichadas.length; j++) {
          const next = fichadas[j];
          if (next.legajo !== f.legajo || next.fecha !== f.fecha) break;
          if (next.tipo === 'Entrada Depo') {
            const [h1, m1, s1] = f.hora.split(':').map(Number);
            const [h2, m2, s2] = next.hora.split(':').map(Number);
            const durSec = (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1);
            if (durSec > 0 && durSec < 86400) {
              dur = Math.round(durSec / 60 * 100) / 100;
            }
            break;
          }
        }
      }

      movements.push({
        tipo: f.tipo,
        legajo: f.legajo,
        nombre: f.nombre,
        fecha: f.fecha,
        hora: f.hora,
        turno: f.turno,
        sector: f.sector,
        empresa: f.empresa,
        duracionMinutos: dur,
      });
    }

    // Get unique names and dates
    const uniqueNames: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT nombre FROM "Fichada" ORDER BY nombre ASC LIMIT 500`
    );
    const uniqueDates: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT fecha FROM "Fichada" ORDER BY fecha DESC`
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
      uniqueDates: [] 
    }, { status: 500 });
  }
}
