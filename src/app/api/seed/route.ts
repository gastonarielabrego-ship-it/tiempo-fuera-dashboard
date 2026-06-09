import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Force dynamic rendering and increase timeout
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Expect JSON data in the request body instead of reading from filesystem
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

    // Clear existing data and insert new data using Prisma (works with PostgreSQL)
    await db.tiempoFuera.deleteMany();

    const batchSize = 500;
    for (let i = 0; i < sessions.length; i += batchSize) {
      const batch = sessions.slice(i, i + batchSize);
      await db.tiempoFuera.createMany({ data: batch });
    }

    return NextResponse.json({ success: true, count: sessions.length });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed database: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
