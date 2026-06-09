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

    // Total stats from TiempoFuera (paired sessions)
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

    // Count egresos and ingresos from Fichada table
    let totalEgresos = 0;
    let totalIngresos = 0;
    try {
      const tblCheck: any[] = await db.$queryRawUnsafe(
        `SELECT table_name FROM information_schema.tables WHERE table_name = 'Fichada'`
      );
      if (tblCheck.length > 0) {
        // Build WHERE for Fichada
        let fichWhere = 'WHERE 1=1';
        const fParams: string[] = [];
        let fIdx = 1;
        if (sector) {
          fichWhere += ` AND "sector" = $${fIdx}`;
          fParams.push(sector);
          fIdx++;
        }
        if (empresa) {
          fichWhere += ` AND "empresa" = $${fIdx}`;
          fParams.push(empresa);
          fIdx++;
        }
        if (fechaDesde) {
          fichWhere += ` AND "fecha" >= $${fIdx}`;
          fParams.push(fechaDesde);
          fIdx++;
        }
        if (fechaHasta) {
          fichWhere += ` AND "fecha" <= $${fIdx}`;
          fParams.push(fechaHasta);
          fIdx++;
        }
        if (turnoTipo) {
          if (turnoTipo === 'Descanso') {
            fichWhere += ` AND "turno" ILIKE 'Descanso%'`;
          } else if (turnoTipo === 'MM') {
            fichWhere += ` AND "turno" ILIKE 'MM%'`;
          } else {
            fichWhere += ` AND "turno" ILIKE $${fIdx}`;
            fParams.push(`${turnoTipo} -%`);
            fIdx++;
          }
        }

        const countQuery = `SELECT 
          COUNT(*) FILTER (WHERE "tipo" = 'Salida Depo')::int as egresos,
          COUNT(*) FILTER (WHERE "tipo" = 'Entrada Depo')::int as ingresos
          FROM "Fichada" ${fichWhere}`;

        const counts: any[] = fParams.length > 0
          ? await db.$queryRawUnsafe(countQuery, ...fParams)
          : await db.$queryRawUnsafe(countQuery);
        
        if (counts.length > 0) {
          totalEgresos = counts[0].egresos || 0;
          totalIngresos = counts[0].ingresos || 0;
        }
      }
    } catch (e) {
      console.error('Error counting fichadas:', e);
    }

    return NextResponse.json({
      totalRegistros: totalStats._count.id,
      totalMinutos: Math.round((totalStats._sum.duracionMinutos || 0) * 100) / 100,
      totalHoras: Math.round((totalStats._sum.duracionMinutos || 0) / 60 * 100) / 100,
      empleadosUnicos: uniqueEmployees.length,
      promedioMinutos: Math.round((totalStats._avg.duracionMinutos || 0) * 100) / 100,
      totalEgresos,
      totalIngresos,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}