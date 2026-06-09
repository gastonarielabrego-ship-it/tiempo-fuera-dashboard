import { NextRequest, NextResponse } from 'next/server';
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
  return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

const val = (r: any, keys: string[]) => { for (const k of keys) if (r[k] != null && r[k] !== '') return String(r[k]).trim(); return ''; };

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sn = Object.keys(wb.Sheets).find(n => n.toLowerCase().includes('base')) || Object.keys(wb.Sheets)[0];
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sn]);
    if (!rows.length) return NextResponse.json({ error: 'Sin datos' }, { status: 400 });

    // Build map: legajo → events
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const f = val(r, ['FICHERO ', 'FICHERO']);
      if (f !== 'Salida Depo' && f !== 'Entrada Depo') continue;
      const leg = val(r, ['legajo']);
      const fec = toDate(val(r, ['FECHA']) || r['FECHA']);
      const hor = toTime(val(r, ['HORA']) || r['HORA']);
      const [h, m, s] = hor.split(':').map(Number);
      const key = new Date(fec).getTime() + (h*3600+m*60+s)*1000;
      if (!map.has(leg)) map.set(leg, []);
      map.get(leg).push({
        tipo: f === 'Salida Depo' ? 'S' : 'E',
        fec, hor, key,
        nom: val(r, ['Apellido y Nombre ', 'Apellido y Nombre']),
        tur: val(r, ['TURNO ', 'TURNO']),
        sec: val(r, ['SECTOR ', 'SECTOR']),
        emp: val(r, ['EMPRESA ', 'EMPRESA']),
      });
    }

    // Pair S→E
    const sessions: any[] = [];
    for (const [leg, evts] of map) {
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
              sessions.push({
                legajo: leg, nombre: evts[i].nom, fecha: evts[i].fec,
                jornadaDate: jd, horaSalida: evts[i].hor, horaEntrada: evts[j].hor,
                duracionMinutos: Math.round(dur * 100) / 100,
                turno: evts[i].tur, sector: evts[i].sec, empresa: evts[i].emp,
              });
            }
            break;
          }
        }
      }
    }

    return NextResponse.json({ sessions, totalRows: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
