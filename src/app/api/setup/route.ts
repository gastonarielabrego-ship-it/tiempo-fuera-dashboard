import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Create AnomaliaEvento table if not exists
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AnomaliaEvento" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "legajo" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "fecha" TEXT NOT NULL,
        "hora" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "turno" TEXT NOT NULL,
        "sector" TEXT NOT NULL,
        "empresa" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "AnomaliaEvento_legajo_fecha_idx" ON "AnomaliaEvento"("legajo", "fecha");
    `);

    // Verify
    const count = await db.$executeRawUnsafe(`SELECT COUNT(*) FROM "AnomaliaEvento"`);
    return NextResponse.json({ success: true, message: 'Tabla AnomaliaEvento creada', count });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
