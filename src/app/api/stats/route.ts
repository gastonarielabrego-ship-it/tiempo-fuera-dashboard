import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

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

    const where: Prisma.TiempoFueraWhereInput = {};
    if (sector) where.sector = sector;
    if (empresa) where.empresa = empresa;
    if (fechaDesde) where.fecha = { ...((where.fecha as Prisma.StringFilter) || {}), gte: fechaDesde };
    if (fechaHasta) where.fecha = { ...((where.fecha as Prisma.StringFilter) || {}), lte: fechaHasta };
    if (turnoTipo) {
      if (turnoTipo === 'Descanso') {
        where.turno = { startsWith: 'Descanso' };
      } else if (turnoTipo === 'MM') {
        where.turno = { startsWith: 'MM' };
      } else {
        where.turno = { startsWith: turnoTipo + ' -' };
      }
    }

    // Total stats
    const totalStats = await db.tiempoFuera.aggregate({
      where,
      _sum: { duracionMinutos: true },
      _count: { id: true },
      _avg: { duracionMinutos: true },
    });

    // Unique employees
    const uniqueEmployees = await db.tiempoFuera.groupBy({
      by: ['legajo'],
      where,
    });

    return NextResponse.json({
      totalRegistros: totalStats._count.id,
      totalMinutos: Math.round((totalStats._sum.duracionMinutos || 0) * 100) / 100,
      totalHoras: Math.round((totalStats._sum.duracionMinutos || 0) / 60 * 100) / 100,
      empleadosUnicos: uniqueEmployees.length,
      promedioMinutos: Math.round((totalStats._avg.duracionMinutos || 0) * 100) / 100,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
