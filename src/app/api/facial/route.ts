import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const fecha = searchParams.get('fecha') || '';
    const fechaDesde = searchParams.get('fechaDesde') || '';
    const fechaHasta = searchParams.get('fechaHasta') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    // Check if table exists
    let tableExists = false;
    try {
      const tbl: any[] = await db.$queryRawUnsafe(
        `SELECT table_name FROM information_schema.tables WHERE table_name = 'Facial'`
      );
      tableExists = tbl.length > 0;
    } catch (e) {
      tableExists = false;
    }

    if (!tableExists) {
      return NextResponse.json({ data: [], total: 0, page, pageSize, totalPages: 0, uniqueDates: [], summary: { trabajadores: 0, dias: 0 } });
    }

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];
    let pIdx = 1;

    if (search) {
      whereClause += ` AND ("dni" LIKE $${pIdx} OR "nombre" ILIKE $${pIdx} OR "apellido" ILIKE $${pIdx})`;
      params.push(`%${search}%`); pIdx++;
    }
    if (fecha) {
      whereClause += ` AND "fecha" = $${pIdx}`;
      params.push(fecha); pIdx++;
    }
    if (fechaDesde) {
      whereClause += ` AND "fecha" >= $${pIdx}`;
      params.push(fechaDesde); pIdx++;
    }
    if (fechaHasta) {
      whereClause += ` AND "fecha" <= $${pIdx}`;
      params.push(fechaHasta); pIdx++;
    }

    // Count total
    const countSql = `SELECT COUNT(*)::int as total FROM "Facial" ${whereClause}`;
    const countRows: any[] = params.length > 0
      ? await db.$queryRawUnsafe(countSql, ...params)
      : await db.$queryRawUnsafe(countSql);
    const total = countRows[0]?.total || 0;

    // Fetch paginated data
    const offset = (page - 1) * pageSize;
    const dataSql = `
      SELECT "nombre", "apellido", "dni", "fecha", "horario", "zona"
      FROM "Facial" ${whereClause}
      ORDER BY "nombre" ASC, "fecha" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const rows: any[] = params.length > 0
      ? await db.$queryRawUnsafe(dataSql, ...params)
      : await db.$queryRawUnsafe(dataSql);

    // Get unique dates
    const datesRows: any[] = await db.$queryRawUnsafe(
      `SELECT DISTINCT "fecha" FROM "Facial" ORDER BY "fecha" DESC`
    );

    // Count summary
    const summaryRows: any[] = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT "dni")::int as trabajadores, COUNT(DISTINCT "fecha")::int as dias FROM "Facial"`
    );
    const summary = summaryRows[0] || { trabajadores: 0, dias: 0 };

    return NextResponse.json({
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      uniqueDates: datesRows.map((d: any) => d.fecha),
      summary,
    });
  } catch (error) {
    console.error('Facial API error:', error);
    return NextResponse.json({ error: 'Failed to fetch facial data', data: [], total: 0, page: 1, pageSize: 50, totalPages: 0, uniqueDates: [], summary: { trabajadores: 0, dias: 0 } }, { status: 500 });
  }
}