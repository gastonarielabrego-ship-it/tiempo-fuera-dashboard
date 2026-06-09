import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetName = Object.keys(wb.Sheets).find(n => n.toLowerCase().includes('base')) || Object.keys(wb.Sheets)[0];
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    
    // Check date conversion
    function toDate(d: any): string {
      if (typeof d === 'number') {
        const result = new Date(new Date(1899, 11, 30).getTime() + d * 86400000).toISOString().split('T')[0];
        return `number->${result}`;
      }
      const dt = new Date(d);
      return `string(${d})->${isNaN(dt.getTime()) ? 'INVALID' : dt.toISOString().split('T')[0]}`;
    }

    const samples = rows.slice(0, 3).map((r, i) => ({
      row: i + 1,
      legajo: { raw: r['legajo'], type: typeof r['legajo'] },
      fecha: { raw: r['FECHA'], type: typeof r['FECHA'], toDate: toDate(r['FECHA']) },
      hora: { raw: r['HORA'], type: typeof r['HORA'] },
      fichero: r['FICHERO '],
    }));

    return NextResponse.json({
      sheetName,
      totalRows: rows.length,
      columns: Object.keys(rows[0]),
      samples,
      nodeVersion: process.version,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
