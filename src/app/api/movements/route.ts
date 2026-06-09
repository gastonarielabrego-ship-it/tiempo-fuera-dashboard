import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nombre = searchParams.get('nombre') || '';
    const fecha = searchParams.get('fecha') || '';

    const where: Prisma.TiempoFueraWhereInput = {};
    if (nombre) {
      where.OR = [
        { nombre: { contains: nombre } },
        { legajo: { contains: nombre } },
      ];
    }
    if (fecha) {
      where.fecha = fecha;
    }

    // Single query with limit
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

    movements.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      if (a.legajo !== b.legajo) return a.legajo.localeCompare(b.legajo);
      return a.hora.localeCompare(b.hora);
    });

    return NextResponse.json({
      movements,
      total: movements.length,
      uniqueNames: [],
      uniqueDates: [],
    });
  } catch (error) {
    console.error('Movements API error:', error);
    return NextResponse.json({ error: 'Failed to fetch movements', movements: [], total: 0, uniqueNames: [], uniqueDates: [] }, { status: 500 });
  }
}
