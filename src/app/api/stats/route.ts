import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

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

    // Top 10 for chart (by time)
    const top10 = await db.tiempoFuera.groupBy({
      by: ['legajo', 'nombre'],
      where,
      _sum: { duracionMinutos: true },
      orderBy: { _sum: { duracionMinutos: 'desc' } },
      take: 10,
    });

    // Top 10 by number of salidas (exits)
    const top10Salidas = await db.tiempoFuera.groupBy({
      by: ['legajo', 'nombre'],
      where,
      _count: { id: true },
      _sum: { duracionMinutos: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    // Distribution by sector
    const bySector = await db.tiempoFuera.groupBy({
      by: ['sector'],
      where,
      _sum: { duracionMinutos: true },
      _count: { id: true },
      orderBy: { _sum: { duracionMinutos: 'desc' } },
    });

    // Distribution by empresa
    const byEmpresa = await db.tiempoFuera.groupBy({
      by: ['empresa'],
      where,
      _sum: { duracionMinutos: true },
      _count: { id: true },
      orderBy: { _sum: { duracionMinutos: 'desc' } },
    });

    return NextResponse.json({
      totalRegistros: totalStats._count.id,
      totalMinutos: Math.round((totalStats._sum.duracionMinutos || 0) * 100) / 100,
      totalHoras: Math.round((totalStats._sum.duracionMinutos || 0) / 60 * 100) / 100,
      empleadosUnicos: uniqueEmployees.length,
      promedioMinutos: Math.round((totalStats._avg.duracionMinutos || 0) * 100) / 100,
      top10: top10.map((t, i) => ({
        ranking: i + 1,
        legajo: t.legajo,
        nombre: t.nombre,
        totalHoras: Math.round((t._sum.duracionMinutos || 0) / 60 * 100) / 100,
        totalMinutos: Math.round((t._sum.duracionMinutos || 0) * 100) / 100,
      })),
      top10Salidas: top10Salidas.map((t, i) => ({
        ranking: i + 1,
        legajo: t.legajo,
        nombre: t.nombre,
        salidas: t._count.id,
        totalHoras: Math.round((t._sum.duracionMinutos || 0) / 60 * 100) / 100,
        totalMinutos: Math.round((t._sum.duracionMinutos || 0) * 100) / 100,
      })),
      bySector: bySector.map(s => ({
        sector: s.sector,
        totalHoras: Math.round((s._sum.duracionMinutos || 0) / 60 * 100) / 100,
        registros: s._count.id,
      })),
      byEmpresa: byEmpresa.map(e => ({
        empresa: e.empresa,
        totalHoras: Math.round((e._sum.duracionMinutos || 0) / 60 * 100) / 100,
        registros: e._count.id,
      })),
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
