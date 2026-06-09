import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RawRow {
  legajo?: string | number;
  'Apellido y Nombre'?: string;
  'Apellido y Nombre '?: string;
  FECHA?: string | number;
  HORA?: string | number;
  FICHERO?: string;
  'FICHERO '?: string;
  TURNO?: string;
  'TURNO '?: string;
  SECTOR?: string;
  'SECTOR '?: string;
  EMPRESA?: string;
  'EMPRESA '?: string;
}

function getVal(row: RawRow, keys: string[]): string {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
}

function excelDateToString(date: string | number): string {
  if (typeof date === 'number') {
    // Excel serial date
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + date * 86400000);
    return jsDate.toISOString().split('T')[0];
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toISOString().split('T')[0];
}

function excelTimeToString(time: string | number): string {
  if (typeof time === 'number') {
    // Excel serial time (fraction of a day)
    const totalSeconds = Math.round(time * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return String(time);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Find the sheet
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = Object.keys(workbook.Sheets).find(
      name => name.toLowerCase().includes('base')
    ) || Object.keys(workbook.Sheets)[0];

    const sheet = workbook.Sheets[sheetName];
    const rawData: RawRow[] = XLSX.utils.sheet_to_json(sheet);

    if (rawData.length === 0) {
      return NextResponse.json({ error: 'No data found in file' }, { status: 400 });
    }

    // Filter only Salida Depo and Entrada Depo
    const ficheroKey = rawData[0]['FICHERO '] !== undefined ? 'FICHERO ' : 'FICHERO';
    const filtered = rawData.filter(row => {
      const fichero = getVal(row, ['FICHERO ', 'FICHERO']);
      return fichero === 'Salida Depo' || fichero === 'Entrada Depo';
    });

    // Process events
    interface Event {
      legajo: string;
      nombre: string;
      fecha: string;
      hora: string;
      tipo: 'salida' | 'entrada';
      turno: string;
      sector: string;
      empresa: string;
      sortKey: number;
    }

    const events: Event[] = filtered.map(row => {
      const fichero = getVal(row, ['FICHERO ', 'FICHERO']);
      const fechaStr = excelDateToString(getVal(row, ['FECHA']) || '');
      const horaStr = excelTimeToString(getVal(row, ['HORA']) || '');

      // Create sort key (timestamp approximation)
      const [hh, mm, ss] = horaStr.split(':').map(Number);
      const sortKey = new Date(fechaStr).getTime() + (hh * 3600 + mm * 60 + ss) * 1000;

      return {
        legajo: getVal(row, ['legajo']),
        nombre: getVal(row, ['Apellido y Nombre ', 'Apellido y Nombre']),
        fecha: fechaStr,
        hora: horaStr,
        tipo: fichero === 'Salida Depo' ? 'salida' as const : 'entrada' as const,
        turno: getVal(row, ['TURNO ', 'TURNO']),
        sector: getVal(row, ['SECTOR ', 'SECTOR']),
        empresa: getVal(row, ['EMPRESA ', 'EMPRESA']),
        sortKey,
      };
    });

    // Sort by legajo, fecha+hora
    events.sort((a, b) => {
      if (a.legajo !== b.legajo) return a.legajo.localeCompare(b.legajo);
      return a.sortKey - b.sortKey;
    });

    // Pair Salida with next Entrada
    const sessions: Array<{
      legajo: string;
      nombre: string;
      fecha: string;
      horaSalida: string;
      horaEntrada: string;
      duracionMinutos: number;
      turno: string;
      sector: string;
      empresa: string;
    }> = [];

    // Build a map of legajo -> sorted events
    const byLegajo = new Map<string, Event[]>();
    for (const e of events) {
      if (!byLegajo.has(e.legajo)) byLegajo.set(e.legajo, []);
      byLegajo.get(e.legajo)!.push(e);
    }

    for (const [, legEvents] of byLegajo) {
      for (let i = 0; i < legEvents.length; i++) {
        if (legEvents[i].tipo !== 'salida') continue;
        for (let j = i + 1; j < legEvents.length; j++) {
          if (legEvents[j].tipo === 'entrada') {
            const salidaTime = legEvents[i].sortKey;
            const entradaTime = legEvents[j].sortKey;
            const duracion = (entradaTime - salidaTime) / 60000;
            if (duracion > 0 && duracion < 720) {
              // Calculate jornadaDate: for TN shifts starting >= 19:00, jornada belongs to previous day
              const [hSalida] = legEvents[i].hora.split(':').map(Number);
              let jornadaDate = legEvents[i].fecha;
              const turnoStr = legEvents[i].turno.toLowerCase();
              if (turnoStr.startsWith('tn') && hSalida >= 19) {
                const salidaDate = new Date(legEvents[i].fecha + 'T00:00:00');
                salidaDate.setDate(salidaDate.getDate() - 1);
                jornadaDate = salidaDate.toISOString().split('T')[0];
              }

              sessions.push({
                legajo: legEvents[i].legajo,
                nombre: legEvents[i].nombre,
                fecha: legEvents[i].fecha,
                jornadaDate,
                horaSalida: legEvents[i].hora,
                horaEntrada: legEvents[j].hora,
                duracionMinutos: Math.round(duracion * 100) / 100,
                turno: legEvents[i].turno,
                sector: legEvents[i].sector,
                empresa: legEvents[i].empresa,
              });
            }
            break; // Take first entrada after this salida
          }
        }
      }
    }

    if (sessions.length === 0) {
      await db.tiempoFuera.deleteMany();
      return NextResponse.json({
        success: true,
        registrosProcesados: rawData.length,
        sessionsCalculadas: 0,
        warning: 'No se encontraron pares salida/entrada válidos',
      });
    }

    // Replace database content: delete old, insert new using Prisma ORM (works with PostgreSQL)
    await db.tiempoFuera.deleteMany();

    const batchSize = 500;
    for (let i = 0; i < sessions.length; i += batchSize) {
      const batch = sessions.slice(i, i + batchSize);
      await db.tiempoFuera.createMany({ data: batch });
    }

    return NextResponse.json({
      success: true,
      registrosProcesados: rawData.length,
      sessionsCalculadas: sessions.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process file: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
