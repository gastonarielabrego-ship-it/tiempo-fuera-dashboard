import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nombre = searchParams.get('nombre') || '';
    const fecha = searchParams.get('fecha') || '';

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

    // For fichadas without duration already set, compute it by pairing S→E
    // Group by legajo + fecha for pairing
    const movements = fichadas.map((f: any) => ({
      tipo: f.tipo,
      legajo: f.legajo,
      nombre: f.nombre,
      fecha: f.fecha,
      hora: f.hora,
      turno: f.turno,
      sector: f.sector,
      empresa: f.empresa,
      duracionMinutos: f.duracionMinutos,
    }));

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
