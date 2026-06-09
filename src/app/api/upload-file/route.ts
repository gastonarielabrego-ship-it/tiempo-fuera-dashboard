import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

function toDate(d: any): string {
  if (typeof d === 'number') {
    return new Date(new Date(1899, 11, 30).getTime() + d * 86400000).toISOString().split('T')[0];
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toISOString().split('T')[0];
}

function toTime(t: any): string {
  if (typeof t !== 'number') return String(t);
  const s = Math.round(t * 86400);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Get string value from row, trying multiple column name variants
function val(r: any, keys: string[]): string {
  for (const k of keys) {
    if (r[k] != null && r[k] !== '') return String(r[k]).trim();
  }
  return '';
}

// Get raw value (preserves number type) for date/time fields
function raw(r: any, keys: string[]): any {
  for (const k of keys) {
    if (r[k] != null && r[k] !== '') return r[k];
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No se seleccionó archivo' }, { status: 400 });

    // Parse Excel
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetName = Object.keys(wb.Sheets).find(n => n.toLowerCase().includes('base')) || Object.keys(wb.Sheets)[0];
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    if (!rows.length) return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });

    console.log(`Upload: ${rows.length} rows read from sheet "${sheetName}"`);

    // Build events map: legajo → sorted events
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const fichero = val(r, ['FICHERO ', 'FICHERO']);
      if (fichero !== 'Salida Depo' && fichero !== 'Entrada Depo') continue;

      const leg = val(r, ['legajo', 'Legajo', 'LEGHAJO']);
      // Use RAW values for FECHA and HORA to preserve number type
      const fec = toDate(raw(r, ['FECHA', 'Fecha', 'fecha']));
      const hor = toTime(raw(r, ['HORA', 'Hora', 'hora']));
      const [h, m, s] = hor.split(':').map(Number);
      const key = new Date(fec).getTime() + (h * 3600 + m * 60 + s) * 1000;

      if (!map.has(leg)) map.set(leg, []);
      map.get(leg)!.push({
        tipo: fichero === 'Salida Depo' ? 'S' : 'E',
        fec, hor, key,
        nom: val(r, ['Apellido y Nombre ', 'Apellido y Nombre']),
        tur: val(r, ['TURNO ', 'TURNO', 'Turno']),
        sec: val(r, ['SECTOR ', 'SECTOR', 'Sector']),
        emp: val(r, ['EMPRESA ', 'EMPRESA', 'Empresa']),
      });
    }

    console.log(`Upload: ${map.size} employees, ${Array.from(map.values()).flat().length} events`);

    // Pair Salida → Entrada and build SQL values
    const { randomUUID } = await import('crypto');
    const allValues: string[] = [];
    const batchSize = 2000;

    for (const [legajo, evts] of map) {
      evts.sort((a: any, b: any) => a.key - b.key);
      for (let i = 0; i < evts.length; i++) {
        if (evts[i].tipo !== 'S') continue;
        for (let j = i + 1; j < evts.length; j++) {
          if (evts[j].tipo === 'E') {
            const dur = (evts[j].key - evts[i].key) / 60000;
            if (dur > 0 && dur < 720) {
              const [hS] = evts[i].hor.split(':').map(Number);
              let jd = evts[i].fec;
              if (evts[i].tur.toLowerCase().startsWith('tn') && hS >= 19) {
                const d = new Date(evts[i].fec + 'T00:00:00');
                d.setDate(d.getDate() - 1);
                jd = d.toISOString().split('T')[0];
              }
              const esc = (s: string) => s.replace(/'/g, "''");
              allValues.push(
                `('${randomUUID()}', '${esc(legajo)}', '${esc(evts[i].nom)}', '${evts[i].fec}', '${jd}', '${evts[i].hor}', '${evts[j].hor}', ${Math.round(dur * 100) / 100}, '${esc(evts[i].tur)}', '${esc(evts[i].sec)}', '${esc(evts[i].emp)}')`
              );
            }
            break;
          }
        }
      }
    }

    if (!allValues.length) {
      return NextResponse.json({
        error: `No se encontraron pares salida/entrada (${rows.length} filas, ${map.size} empleados). Verificá que el archivo tenga columnas Salida/Entrada Depo.`
      }, { status: 400 });
    }

    console.log(`Upload: ${allValues.length} pairs found, inserting...`);

    // Delete old data
    await db.$executeRawUnsafe(`DELETE FROM "TiempoFuera"`);

    // Insert in batches
    for (let i = 0; i < allValues.length; i += batchSize) {
      const batch = allValues.slice(i, i + batchSize);
      await db.$executeRawUnsafe(
        `INSERT INTO "TiempoFuera" (id, legajo, nombre, fecha, "jornadaDate", "horaSalida", "horaEntrada", "duracionMinutos", turno, sector, empresa) VALUES ${batch.join(',')}`
      );
    }

    const verifyCount = await db.tiempoFuera.count();
    console.log(`Upload: done, ${verifyCount} records in DB`);

    return NextResponse.json({
      success: true,
      rowsProcessed: rows.length,
      sessionsInserted: allValues.length,
      verifyCount,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Error al procesar: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
