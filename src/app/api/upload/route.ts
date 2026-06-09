import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessions: Array<{
      legajo: string;
      nombre: string;
      fecha: string;
      jornadaDate: string;
      horaSalida: string;
      horaEntrada: string;
      duracionMinutos: number;
      turno: string;
      sector: string;
      empresa: string;
    }> = body.sessions || body;

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron datos válidos' }, { status: 400 });
    }

    console.log('Upload: inserting', sessions.length, 'sessions');

    // Delete old data
    await db.tiempoFuera.deleteMany();

    // Insert using raw SQL for speed (single large INSERT)
    const { randomUUID } = await import('crypto');
    const batchSize = 2000;
    let insertedTotal = 0;

    for (let i = 0; i < sessions.length; i += batchSize) {
      const batch = sessions.slice(i, i + batchSize);
      const values = batch.map(s => {
        const leg = String(s.legajo).replace(/'/g, "''");
        const nom = String(s.nombre).replace(/'/g, "''");
        const tur = String(s.turno).replace(/'/g, "''");
        const sec = String(s.sector).replace(/'/g, "''");
        const emp = String(s.empresa).replace(/'/g, "''");
        return `('${randomUUID()}', '${leg}', '${nom}', '${s.fecha}', '${s.jornadaDate || s.fecha}', '${s.horaSalida}', '${s.horaEntrada}', ${s.duracionMinutos}, '${tur}', '${sec}', '${emp}')`;
      }).join(',');
      await db.$executeRawUnsafe(
        `INSERT INTO "TiempoFuera" (id, legajo, nombre, fecha, "jornadaDate", "horaSalida", "horaEntrada", "duracionMinutos", turno, sector, empresa) VALUES ${values}`
      );
      insertedTotal += batch.length;
    }

    // Verify
    const verifyCount = await db.tiempoFuera.count();
    console.log('Upload: done,', verifyCount, 'records in DB');

    return NextResponse.json({
      success: true,
      insertedTotal,
      verifyCount,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to insert data: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
