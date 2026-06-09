import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nombre = searchParams.get('nombre') || '';
    const fecha = searchParams.get('fecha') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '200');

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

    const sessions = await db.tiempoFuera.findMany({
      where,
      orderBy: { fecha: 'desc' },
    });

    // Build individual movements from paired sessions
    interface Movement {
      tipo: string;
      legajo: string;
      nombre: string;
      fecha: string;
      hora: string;
      turno: string;
      sector: string;
      empresa: string;
      duracionMinutos?: number;
    }

    const movements: Movement[] = [];

    for (const s of sessions) {
      // Salida
      movements.push({
        tipo: 'Salida Depo',
        legajo: s.legajo,
        nombre: s.nombre,
        fecha: s.fecha,
        hora: s.horaSalida,
        turno: s.turno,
        sector: s.sector,
        empresa: s.empresa,
      });
      // Entrada
      movements.push({
        tipo: 'Entrada Depo',
        legajo: s.legajo,
        nombre: s.nombre,
        fecha: s.fecha,
        hora: s.horaEntrada,
        turno: s.turno,
        sector: s.sector,
        empresa: s.empresa,
        duracionMinutos: s.duracionMinutos,
      });
    }

    // Sort by fecha desc, then legajo, then hora
    movements.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      if (a.legajo !== b.legajo) return a.legajo.localeCompare(b.legajo);
      return a.hora.localeCompare(b.hora);
    });

    // Get unique names and dates for autocomplete
    const uniqueNames = await db.tiempoFuera.findMany({
      distinct: ['nombre'],
      select: { nombre: true },
      orderBy: { nombre: 'asc' },
    });

    const uniqueDates = await db.tiempoFuera.findMany({
      distinct: ['fecha'],
      select: { fecha: true },
      orderBy: { fecha: 'desc' },
    });

    return NextResponse.json({
      movements,
      total: movements.length,
      uniqueNames: uniqueNames.map(n => n.nombre),
      uniqueDates: uniqueDates.map(d => d.fecha),
    });
  } catch (error) {
    console.error('Movements API error:', error);
    return NextResponse.json({ error: 'Failed to fetch movements' }, { status: 500 });
  }
}
