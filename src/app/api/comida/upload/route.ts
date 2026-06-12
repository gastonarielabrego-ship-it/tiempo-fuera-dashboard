import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function toDate(d: any): string {
  if (d instanceof Date) {
    return isNaN(d.getTime()) ? String(d) : d.toISOString().split('T')[0];
  }
  if (typeof d === 'number') {
    return new Date(new Date(1899, 11, 30).getTime() + d * 86400000).toISOString().split('T')[0];
  }
  if (typeof d === 'string') {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d.split('T')[0]?.substring(0, 10) || d : dt.toISOString().split('T')[0];
  }
  return String(d);
}

function toTime(t: any): string {
  if (typeof t === 'number') {
    const s = Math.round(t * 86400);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  if (t instanceof Date) {
    const h = t.getUTCHours();
    const m = t.getUTCMinutes();
    const s = t.getUTCSeconds();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (typeof t === 'string') {
    const num = Number(t);
    if (!isNaN(num)) {
      const s = Math.round(num * 86400);
      return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
    return t;
  }
  return String(t);
}

async function ensureComidaTable() {
  try {
    const cols: any[] = await db.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Comida' AND column_name = 'dni'
    `);
    if (cols.length === 0) {
      console.log('Creating Comida table...');
      await db.$executeRawUnsafe(`
        CREATE TABLE "Comida" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "dni" TEXT NOT NULL,
          "nombre" TEXT NOT NULL,
          "fecha" TEXT NOT NULL,
          "horario" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.$executeRawUnsafe(`CREATE INDEX "Comida_dni_fecha_idx" ON "Comida"("dni", "fecha")`);
      await db.$executeRawUnsafe(`CREATE INDEX "Comida_fecha_idx" ON "Comida"("fecha")`);
      console.log('Comida table created');
    }
  } catch (e) {
    console.error('Error creating Comida table:', e);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureComidaTable();

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const rows: { dni: string; nombre: string; fecha: string; horario: string }[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

      for (const row of data) {
        const keys = Object.keys(row);
        const nombre = String(row[keys[0]] || '').trim();
        const dni = String(row[keys[1]] || '').trim();
        const fechaRaw = row[keys[2]];
        const horarioRaw = row[keys[3]];

        if (!dni || !nombre) continue;

        const fecha = toDate(fechaRaw);
        const horario = toTime(horarioRaw);

        rows.push({ dni, nombre, fecha, horario });
      }
    }

    // Delete existing data and insert new
    await db.$executeRawUnsafe(`DELETE FROM "Comida"`);
    console.log(`Deleted existing Comida data, inserting ${rows.length} rows...`);

    const inserted: string[] = [];
    for (const r of rows) {
      const id = r.dni + '_' + r.fecha.replace(/-/g, '') + '_' + r.horario.replace(/:/g, '') + '_' + Math.random().toString(36).substring(2, 6);
      try {
        await db.$queryRawUnsafe(
          `INSERT INTO "Comida" (id, dni, nombre, fecha, horario) VALUES ($1, $2, $3, $4, $5)`,
          id, r.dni, r.nombre, r.fecha, r.horario
        );
        inserted.push(id);
      } catch (e: any) {
        if (!e.message?.includes('duplicate')) {
          console.error('Error inserting row:', r, e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      inserted: inserted.length,
      message: `Se cargaron ${inserted.length} registros de comida`
    });
  } catch (error: any) {
    console.error('Comida upload error:', error);
    return NextResponse.json({ error: error.message || 'Error al procesar archivo' }, { status: 500 });
  }
}