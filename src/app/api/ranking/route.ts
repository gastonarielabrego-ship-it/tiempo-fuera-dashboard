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
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'tiempo'; // 'tiempo' or 'salidas'
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '25');

    // Build where clause
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
    if (search) {
      where.OR = [
        { legajo: { contains: search } },
        { nombre: { contains: search } },
      ];
    }

    // Aggregate ranking - order by requested sort
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

    // Get most frequent turno per employee
    const turnosByEmployee = await db.tiempoFuera.groupBy({
      by: ['legajo', 'turno'],
      where,
      _count: { id: true },
    });

    const turnoMap = new Map<string, string>();
    for (const t of turnosByEmployee) {
      const existing = turnoMap.get(t.legajo);
      if (!existing || t._count.id > (turnosByEmployee.find(x => x.legajo === t.legajo && x.turno === existing)?._count.id || 0)) {
        turnoMap.set(t.legajo, t.turno);
      }
    }

    const total = ranking.length;
    const ranked = ranking.map((r, i) => ({
      ranking: i + 1,
      legajo: r.legajo,
      nombre: r.nombre,
      totalMinutos: Math.round((r._sum.duracionMinutos || 0) * 100) / 100,
      totalHoras: Math.round((r._sum.duracionMinutos || 0) / 60 * 100) / 100,
      cantidadSalidas: r._count.id,
      promedioMinutos: Math.round((r._avg.duracionMinutos || 0) * 100) / 100,
      turno: turnoMap.get(r.legajo) || '-',
    }));

    // Paginate
    const start = (page - 1) * pageSize;
    const paginated = ranked.slice(start, start + pageSize);

    // Get unique sectors and empresas for filters
    const allSectores = await db.tiempoFuera.findMany({
      distinct: ['sector'],
      select: { sector: true },
      orderBy: { sector: 'asc' },
    });
    const allEmpresas = await db.tiempoFuera.findMany({
      distinct: ['empresa'],
      select: { empresa: true },
      orderBy: { empresa: 'asc' },
    });

    // Date range (use jornadaDate for accurate range)
    const dateRange = await db.tiempoFuera.aggregate({
      _min: { fecha: true },
      _max: { fecha: true },
    });

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
        fechaMin: dateRange._min.fecha,
        fechaMax: dateRange._max.fecha,
      },
    });
  } catch (error) {
    console.error('Ranking API error:', error);
    return NextResponse.json({ error: 'Failed to fetch ranking' }, { status: 500 });
  }
}
