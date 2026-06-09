import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Test DB connection
    const count = await db.tiempoFuera.count();
    
    // Try a simple query
    const sample = await db.tiempoFuera.findMany({ take: 3 });
    
    // Check if table exists by trying aggregate
    let tableExists = true;
    try {
      await db.tiempoFuera.aggregate({ _count: { id: true } });
    } catch {
      tableExists = false;
    }

    return NextResponse.json({
      dbConnected: true,
      tableExists,
      recordCount: count,
      sampleRecords: sample,
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasDirectUrl: !!process.env.DIRECT_DATABASE_URL,
        hasPostgresPrismaUrl: !!process.env.POSTGRES_PRISMA_URL,
      }
    });
  } catch (error) {
    return NextResponse.json({
      dbConnected: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
