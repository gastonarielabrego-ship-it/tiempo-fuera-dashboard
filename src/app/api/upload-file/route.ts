import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

function toDate(d: any): string {
  if (d instanceof Date) {
    return isNaN(d.getTime()) ? String(d) : d.toISOString().split('T')[0];
  }
  if (typeof d === 'number') {
    return new Date(new Date(1899, 11, 30).getTime() + d * 86400000).toISOString().split('T')[0];
  }
  if (typeof d === 'string') {
    const num = Number(d);
    if (!isNaN(num) && d.trim() !== '') {
      return new Date(new Date(1899, 11, 30).getTime() + num * 86400000).toISOString().split('T')[0];
    }
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? String(d) : dt.toISOString().split('T')[0];
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

function val(r: any, keys: string[]): string {
  for (const k of keys) {
    if (r[k] != null && r[k] !== '') return String(r[k]).trim();
  }
  return '';
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No se seleccionó archivo' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
    const sheetName = Object.keys(wb.Sheets).find(n => n.toLowerCase().includes('base')) || Object.keys(wb.Sheets)[0];
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: true });
    if (!rows.length) return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });

    console.log(`Upload: ${rows.length} rows from sheet "${sheetName}"`);

    const map = new Map<string, any[]>();
    for (const r of rows) {
      const fichero = val(r, ['FICHERO ', 'FICHERO']);
      if (fichero !== 'Salida Depo' && fichero !== 'Entrada Depo') continue;

      const leg = val(r, ['legajo', 'Legajo', 'LEGHAJO']);
      const fec = toDate(r['FECHA']);
      const hor = toTime(r['HORA']);
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

    const totalEvents = Array.from(map.values()).flat().length;
    console.log(`Upload: ${map.size} employees, ${totalEvents} events`);

    const { randomUUID } = await import('crypto');
    const allValues: string[] = [];       // TiempoFuera (paired S→E)
    const anomaliaValues: string[] = [];  // AnomaliaEvento (doble entrada)
    const fichadaValues: string[] = [];    // Fichada (TODAS las fichadas individuales)

    for (const [legajo, evts] of map) {
      evts.sort((a: any, b: any) => a.key - b.key);

      const localPaired = new Set<number>();
      // Map: event index -> paired duration (for Fichada)
      const pairedDuration = new Map<number, number>();

      // Detect doble entrada: dos Entrada seguidas sin Salida en medio
      for (let i = 1; i < evts.length; i++) {
        if (evts[i].tipo === 'E' && evts[i - 1].tipo === 'E') {
          const esc = (str: string) => str.replace(/'/g, "''");
          const diffMin = Math.round((evts[i].key - evts[i - 1].key) / 60000);
          anomaliaValues.push(
            `('${randomUUID()}', '${esc(legajo)}', '${esc(evts[i - 1].nom)}', '${evts[i - 1].fec}', '${evts[i - 1].hor}', '${evts[i].hor}', ${diffMin}, '${esc(evts[i - 1].tur)}', '${esc(evts[i - 1].sec)}', '${esc(evts[i - 1].emp)}')`
          );
        }
      }

      // Pair Salida → Entrada for ranking (TiempoFuera)
      // Limite 1440 min (24h) para cubrir turnos TN largos (18:00→06:00)
      for (let i = 0; i < evts.length; i++) {
        if (evts[i].tipo !== 'S') continue;
        for (let j = i + 1; j < evts.length; j++) {
          if (evts[j].tipo === 'E') {
            const dur = (evts[j].key - evts[i].key) / 60000;
            if (dur > 0 && dur < 1440) {
              const [hS, mS] = evts[i].hor.split(':').map(Number);
              let jd = evts[i].fec;

              // TN shift: jornada del dia que inicia el turno
              // Si sale de madrugada (00:00-05:59), la jornada es del dia anterior
              // Si sale desde la tarde/noche (06:00+), la jornada es ese dia
              if (evts[i].tur.toLowerCase().startsWith('tn')) {
                if (hS < 6) {
                  const d = new Date(evts[i].fec + 'T00:00:00');
                  d.setDate(d.getDate() - 1);
                  jd = d.toISOString().split('T')[0];
                }
              }

              const esc = (str: string) => str.replace(/'/g, "''");
              allValues.push(
                `('${randomUUID()}', '${esc(legajo)}', '${esc(evts[i].nom)}', '${evts[i].fec}', '${jd}', '${evts[i].hor}', '${evts[j].hor}', ${Math.round(dur * 100) / 100}, '${esc(evts[i].tur)}', '${esc(evts[i].sec)}', '${esc(evts[i].emp)}')`
              );
              localPaired.add(i);
              localPaired.add(j);
              pairedDuration.set(i, Math.round(dur * 100) / 100);
              pairedDuration.set(j, Math.round(dur * 100) / 100);
            }
            break;
          }
        }
      }

      // Guardar TODAS las fichadas individuales en tabla Fichada
      for (let idx = 0; idx < evts.length; idx++) {
        const e = evts[idx];
        const esc = (str: string) => str.replace(/'/g, "''");
        const tipoStr = e.tipo === 'S' ? 'Salida Depo' : 'Entrada Depo';
        const dur = pairedDuration.get(idx);
        const durVal = dur !== undefined ? dur : 'NULL';
        fichadaValues.push(
          `('${randomUUID()}', '${esc(legajo)}', '${esc(e.nom)}', '${e.fec}', '${e.hor}', '${tipoStr}', '${esc(e.tur)}', '${esc(e.sec)}', '${esc(e.emp)}', ${durVal})`
        );
      }
    }

    if (!allValues.length && !anomaliaValues.length && !fichadaValues.length) {
      return NextResponse.json({
        error: `No se encontraron eventos validos (${rows.length} filas, ${map.size} empleados, ${totalEvents} eventos)`
      }, { status: 400 });
    }

    console.log(`Upload: ${allValues.length} pares, ${anomaliaValues.length} doble entrada, ${fichadaValues.length} fichadas, inserting...`);

    // Create AnomaliaEvento table (correct schema)
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "AnomaliaEvento"`);
    } catch (e) { /* ignore */ }
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE "AnomaliaEvento" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "legajo" TEXT NOT NULL,
          "nombre" TEXT NOT NULL,
          "fecha" TEXT NOT NULL,
          "horaEntrada1" TEXT NOT NULL,
          "horaEntrada2" TEXT NOT NULL,
          "diferenciaMinutos" INTEGER NOT NULL,
          "turno" TEXT NOT NULL,
          "sector" TEXT NOT NULL,
          "empresa" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (e) {
      console.error('Error creating AnomaliaEvento:', e);
    }

    // Create Fichada table (todas las fichadas individuales)
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "Fichada"`);
    } catch (e) { /* ignore */ }
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE "Fichada" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "legajo" TEXT NOT NULL,
          "nombre" TEXT NOT NULL,
          "fecha" TEXT NOT NULL,
          "hora" TEXT NOT NULL,
          "tipo" TEXT NOT NULL,
          "turno" TEXT NOT NULL,
          "sector" TEXT NOT NULL,
          "empresa" TEXT NOT NULL,
          "duracionMinutos" FLOAT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Fichada table created');
    } catch (e) {
      console.error('Error creating Fichada:', e);
    }

    // Clear and re-insert
    await db.$executeRawUnsafe(`DELETE FROM "TiempoFuera"`);
    await db.$executeRawUnsafe(`DELETE FROM "AnomaliaEvento"`);
    await db.$executeRawUnsafe(`DELETE FROM "Fichada"`);

    const batchSize = 2000;

    if (allValues.length > 0) {
      for (let i = 0; i < allValues.length; i += batchSize) {
        const batch = allValues.slice(i, i + batchSize);
        await db.$executeRawUnsafe(
          `INSERT INTO "TiempoFuera" (id, legajo, nombre, fecha, "jornadaDate", "horaSalida", "horaEntrada", "duracionMinutos", turno, sector, empresa) VALUES ${batch.join(',')}`
        );
      }
    }

    if (anomaliaValues.length > 0) {
      for (let i = 0; i < anomaliaValues.length; i += batchSize) {
        const batch = anomaliaValues.slice(i, i + batchSize);
        await db.$executeRawUnsafe(
          `INSERT INTO "AnomaliaEvento" (id, legajo, nombre, fecha, "horaEntrada1", "horaEntrada2", "diferenciaMinutos", turno, sector, empresa) VALUES ${batch.join(',')}`
        );
      }
    }

    if (fichadaValues.length > 0) {
      for (let i = 0; i < fichadaValues.length; i += batchSize) {
        const batch = fichadaValues.slice(i, i + batchSize);
        await db.$executeRawUnsafe(
          `INSERT INTO "Fichada" (id, legajo, nombre, fecha, hora, tipo, turno, sector, empresa, "duracionMinutos") VALUES ${batch.join(',')}`
        );
      }
    }

    const verifyCount = await db.tiempoFuera.count();
    const anomaliaCount: any = await db.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "AnomaliaEvento"`);
    const fichadaCount: any = await db.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "Fichada"`);
    console.log(`Upload: done, ${verifyCount} sesiones, ${anomaliaCount[0].count} doble entrada, ${fichadaCount[0].count} fichadas`);

    return NextResponse.json({
      success: true,
      rowsProcessed: rows.length,
      sessionsInserted: allValues.length,
      dobleEntradas: anomaliaValues.length,
      fichadasTotal: fichadaValues.length,
      verifyCount,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Error: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
