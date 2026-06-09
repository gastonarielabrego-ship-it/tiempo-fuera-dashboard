'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import {
  Upload, Clock, Users, TrendingUp, Search, Trophy, FileSpreadsheet,
  BarChart3, PieChartIcon, RefreshCw, List, ArrowDownToLine, ArrowRightLeft
} from 'lucide-react'
import { toast } from 'sonner'

interface RankingItem {
  ranking: number
  legajo: string
  nombre: string
  totalMinutos: number
  totalHoras: number
  cantidadSalidas: number
  promedioMinutos: number
  turno: string
}

interface StatsData {
  totalRegistros: number
  totalMinutos: number
  totalHoras: number
  empleadosUnicos: number
  promedioMinutos: number
  top10: Array<{ ranking: number; nombre: string; totalHoras: number; totalMinutos: number }>
  top10Salidas: Array<{ ranking: number; nombre: string; salidas: number; totalHoras: number; totalMinutos: number }>
  bySector: Array<{ sector: string; totalHoras: number; registros: number }>
  byEmpresa: Array<{ empresa: string; totalHoras: number; registros: number }>
}

interface MovementItem {
  tipo: string
  legajo: string
  nombre: string
  fecha: string
  hora: string
  turno: string
  sector: string
  empresa: string
  duracionMinutos?: number
}

interface FilterData {
  sectores: string[]
  empresas: string[]
  fechaMin: string
  fechaMax: string
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6', '#a855f7']

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return `${h}h ${m}m`
}

function getRankBadgeColor(ranking: number): string {
  if (ranking === 1) return 'bg-yellow-500 text-white'
  if (ranking === 2) return 'bg-gray-400 text-white'
  if (ranking === 3) return 'bg-amber-700 text-white'
  return 'bg-muted text-muted-foreground'
}

export default function Dashboard() {
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [stats, setStats] = useState<StatsData | null>(null)
  const [filters, setFilters] = useState<FilterData>({ sectores: [], empresas: [], fechaMin: '', fechaMax: '' })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Filter state
  const [sectorFilter, setSectorFilter] = useState('')
  const [empresaFilter, setEmpresaFilter] = useState('')
  const [turnoFilter, setTurnoFilter] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'tiempo' | 'salidas'>('tiempo')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  const fetchRanking = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (sectorFilter) params.set('sector', sectorFilter)
      if (empresaFilter) params.set('empresa', empresaFilter)
      if (turnoFilter) params.set('turnoTipo', turnoFilter)
      if (fechaDesde) params.set('fechaDesde', fechaDesde)
      if (fechaHasta) params.set('fechaHasta', fechaHasta)
      if (search) params.set('search', search)
      if (sortBy) params.set('sortBy', sortBy)
      params.set('page', String(page))

      const res = await fetch(`/api/ranking?${params}`)
      const data = await res.json()
      setRanking(data.ranking)
      setTotalPages(data.totalPages)
      setTotalItems(data.total)
      if (data.filters) setFilters(data.filters)
    } catch (err) {
      console.error('Error fetching ranking:', err)
      toast.error('Error al cargar los datos del ranking')
    } finally {
      setLoading(false)
    }
  }, [sectorFilter, empresaFilter, turnoFilter, fechaDesde, fechaHasta, search, sortBy, page])

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (sectorFilter) params.set('sector', sectorFilter)
      if (empresaFilter) params.set('empresa', empresaFilter)
      if (turnoFilter) params.set('turnoTipo', turnoFilter)
      if (fechaDesde) params.set('fechaDesde', fechaDesde)
      if (fechaHasta) params.set('fechaHasta', fechaHasta)

      const res = await fetch(`/api/stats?${params}`)
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }, [sectorFilter, empresaFilter, turnoFilter, fechaDesde, fechaHasta])

  useEffect(() => {
    fetchRanking()
    fetchStats()
  }, [fetchRanking, fetchStats])

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [sectorFilter, empresaFilter, fechaDesde, fechaHasta, search])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      toast.info('Leyendo archivo Excel...')

      // Parse Excel entirely in the browser to avoid Vercel 10s timeout
      const XLSX = await import('xlsx')
      const arrayBuffer = await file.arrayBuffer()
      const wb = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = Object.keys(wb.Sheets).find(n => n.toLowerCase().includes('base')) || Object.keys(wb.Sheets)[0]
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName])

      if (!rows.length) {
        toast.error('El archivo está vacío o no se encontraron datos')
        return
      }

      toast.info(`${rows.length} filas leídas. Procesando salidas/entradas...`)

      // Helper functions
      function toDate(d: any): string {
        if (typeof d === 'number') {
          return new Date(new Date(1899, 11, 30).getTime() + d * 86400000).toISOString().split('T')[0]
        }
        const dt = new Date(d)
        return isNaN(dt.getTime()) ? String(d) : dt.toISOString().split('T')[0]
      }

      function toTime(t: any): string {
        if (typeof t !== 'number') return String(t)
        const s = Math.round(t * 86400)
        return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
      }

      function getVal(r: any, keys: string[]): string {
        for (const k of keys) if (r[k] != null && r[k] !== '') return String(r[k]).trim()
        return ''
      }

      // Build events map: legajo → sorted events
      const map = new Map<string, any[]>()
      for (const r of rows) {
        const fichero = getVal(r, ['FICHERO ', 'FICHERO'])
        if (fichero !== 'Salida Depo' && fichero !== 'Entrada Depo') continue

        const leg = getVal(r, ['legajo'])
        const fec = toDate(getVal(r, ['FECHA']) || r['FECHA'])
        const hor = toTime(getVal(r, ['HORA']) || r['HORA'])
        const [h, m, s] = hor.split(':').map(Number)
        const key = new Date(fec).getTime() + (h * 3600 + m * 60 + s) * 1000

        if (!map.has(leg)) map.set(leg, [])
        map.get(leg)!.push({
          tipo: fichero === 'Salida Depo' ? 'S' : 'E',
          fec, hor, key,
          nom: getVal(r, ['Apellido y Nombre ', 'Apellido y Nombre']),
          tur: getVal(r, ['TURNO ', 'TURNO']),
          sec: getVal(r, ['SECTOR ', 'SECTOR']),
          emp: getVal(r, ['EMPRESA ', 'EMPRESA']),
        })
      }

      // Pair Salida → Entrada
      const sessions: any[] = []
      for (const [legajo, evts] of map) {
        evts.sort((a: any, b: any) => a.key - b.key)
        for (let i = 0; i < evts.length; i++) {
          if (evts[i].tipo !== 'S') continue
          for (let j = i + 1; j < evts.length; j++) {
            if (evts[j].tipo === 'E') {
              const dur = (evts[j].key - evts[i].key) / 60000
              if (dur > 0 && dur < 720) {
                const [hS] = evts[i].hor.split(':').map(Number)
                let jd = evts[i].fec
                if (evts[i].tur.toLowerCase().startsWith('tn') && hS >= 19) {
                  const d = new Date(evts[i].fec + 'T00:00:00')
                  d.setDate(d.getDate() - 1)
                  jd = d.toISOString().split('T')[0]
                }
                sessions.push({
                  legajo: legajo,
                  nombre: evts[i].nom,
                  fecha: evts[i].fec,
                  jornadaDate: jd,
                  horaSalida: evts[i].hor,
                  horaEntrada: evts[j].hor,
                  duracionMinutos: Math.round(dur * 100) / 100,
                  turno: evts[i].tur,
                  sector: evts[i].sec,
                  empresa: evts[i].emp,
                })
              }
              break
            }
          }
        }
      }

      if (!sessions.length) {
        toast.error(`No se encontraron pares salida/entrada (${rows.length} filas leídas)`)
        return
      }

      toast.info(`Enviando ${sessions.length} sesiones al servidor...`)

      // Send JSON to server - just SQL inserts, very fast
      const insertRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions }),
      })
      const insertData = await insertRes.json()

      if (insertRes.ok) {
        toast.success(`${sessions.length} sesiones cargadas (${rows.length} filas procesadas, ${insertData.verifyCount} registros en DB)`)
        fetchRanking()
        fetchStats()
      } else {
        toast.error(`Error al guardar: ${insertData.error}`)
      }
    } catch (err) {
      toast.error('Error al procesar: ' + (err instanceof Error ? err.message : String(err)))
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Base cargada: ${data.count} registros`)
        fetchRanking()
        fetchStats()
      } else {
        toast.error('Error al cargar la base de datos')
      }
    } catch (err) {
      toast.error('Error al cargar la base')
    } finally {
      setSeeding(false)
    }
  }

  const clearFilters = () => {
    setSectorFilter('')
    setEmpresaFilter('')
    setTurnoFilter('')
    setFechaDesde('')
    setFechaHasta('')
    setSearch('')
  }

  // Movements state
  const [movNombre, setMovNombre] = useState('')
  const [movFecha, setMovFecha] = useState('')
  const [movements, setMovements] = useState<MovementItem[]>([])
  const [movLoading, setMovLoading] = useState(false)
  const [movSearched, setMovSearched] = useState(false)
  const [movAutoNames, setMovAutoNames] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchMovements = useCallback(async () => {
    if (!movNombre && !movFecha) {
      toast.error('Ingresá un nombre o seleccioná una fecha')
      return
    }
    setMovLoading(true)
    setMovSearched(true)
    try {
      const params = new URLSearchParams()
      if (movNombre) params.set('nombre', movNombre)
      if (movFecha) params.set('fecha', movFecha)
      const res = await fetch(`/api/movements?${params}`)
      const data = await res.json()
      setMovements(data.movements)
      setMovAutoNames(data.uniqueNames || [])
    } catch (err) {
      toast.error('Error al buscar movimientos')
    } finally {
      setMovLoading(false)
    }
  }, [movNombre, movFecha])

  const downloadMovementsCSV = () => {
    if (!movements || movements.length === 0) return
    try {
      const BOM = '\uFEFF'
      const headers = ['Tipo', 'Legajo', 'Nombre', 'Fecha', 'Hora', 'Duracion (min)', 'Turno', 'Sector', 'Empresa']
      const rows = movements.map(m => [
        m.tipo,
        m.legajo,
        m.nombre,
        m.fecha,
        m.hora,
        m.duracionMinutos ? String(m.duracionMinutos) : '-',
        m.turno,
        m.sector,
        m.empresa,
      ])
      const csvContent = BOM + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = `movimientos_${movNombre || 'todos'}_${movFecha || 'todas'}.csv`
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('Archivo CSV descargado')
    } catch (err) {
      console.error('Download error:', err)
      toast.error('Error al descargar')
    }
  }

  const hasFilters = sectorFilter || empresaFilter || turnoFilter || fechaDesde || fechaHasta || search

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-lg">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Tiempos Fuera de Depósito</h1>
              <p className="text-sm text-slate-500">Ranking de tiempos muertos por empleado</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUpload}
              className="hidden"
            />
            <Button variant="outline" size="sm" className="gap-2" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Procesando...' : 'Cargar Archivo Excel'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <Clock className="h-4 w-4" />
                  Tiempo Total
                </div>
                <p className="text-2xl font-bold text-slate-900">{formatDuration(stats.totalMinutos)}</p>
                <p className="text-xs text-slate-400">{stats.totalHoras.toLocaleString()} horas</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <Users className="h-4 w-4" />
                  Empleados
                </div>
                <p className="text-2xl font-bold text-slate-900">{stats.empleadosUnicos}</p>
                <p className="text-xs text-slate-400">con registros</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Promedio
                </div>
                <p className="text-2xl font-bold text-slate-900">{formatDuration(stats.promedioMinutos)}</p>
                <p className="text-xs text-slate-400">por salida</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <BarChart3 className="h-4 w-4" />
                  Registros
                </div>
                <p className="text-2xl font-bold text-slate-900">{stats.totalRegistros.toLocaleString()}</p>
                <p className="text-xs text-slate-400">salidas totales</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Legajo o nombre..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Sector</label>
                <Select value={sectorFilter} onValueChange={(v) => setSectorFilter(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {filters.sectores.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Empresa</label>
                <Select value={empresaFilter} onValueChange={(v) => setEmpresaFilter(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {filters.empresas.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Turno</label>
                <Select value={turnoFilter} onValueChange={(v) => setTurnoFilter(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    <SelectItem value="TM">TM - Mañana</SelectItem>
                    <SelectItem value="TT">TT - Tarde</SelectItem>
                    <SelectItem value="TN">TN - Noche</SelectItem>
                    <SelectItem value="MM">MM - Media</SelectItem>
                    <SelectItem value="Descanso">Descanso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Desde</label>
                  <Input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="h-9"
                    min={filters.fechaMin}
                    max={filters.fechaMax}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Hasta</label>
                  <Input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="h-9"
                    min={filters.fechaMin}
                    max={filters.fechaMax}
                  />
                </div>
              </div>
              <div>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-slate-500">
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content: Table + Charts */}
        <Tabs defaultValue="ranking" className="space-y-4">
          <TabsList className="bg-white">
            <TabsTrigger value="ranking" className="gap-2">
              <Trophy className="h-4 w-4" />
              Ranking
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Gráficos
            </TabsTrigger>
            <TabsTrigger value="distribution" className="gap-2">
              <PieChartIcon className="h-4 w-4" />
              Distribución
            </TabsTrigger>
            <TabsTrigger value="movimientos" className="gap-2">
              <List className="h-4 w-4" />
              Movimientos
            </TabsTrigger>
          </TabsList>

          {/* Ranking Table */}
          <TabsContent value="ranking">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Ranking de Tiempos Fuera de Depósito</CardTitle>
                    <CardDescription>
                      {totalItems} empleados encontrados
                      {hasFilters && ' (con filtros aplicados)'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-100 rounded-lg p-1">
                      <button
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${sortBy === 'tiempo' ? 'bg-white shadow-sm text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => { setSortBy('tiempo'); setPage(1) }}
                      >
                        <Trophy className="h-3.5 w-3.5 inline mr-1" />
                        Por Tiempo
                      </button>
                      <button
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${sortBy === 'salidas' ? 'bg-white shadow-sm text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => { setSortBy('salidas'); setPage(1) }}
                      >
                        <BarChart3 className="h-3.5 w-3.5 inline mr-1" />
                        Por Salidas
                      </button>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Pág. {page} de {totalPages}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-16 text-center">#</TableHead>
                        <TableHead className="w-24">Legajo</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="text-right">Tiempo Total</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Horas</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Salidas</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">Promedio</TableHead>
                        <TableHead className="hidden xl:table-cell">Turno</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 8 }).map((_, j) => (
                              <TableCell key={j}>
                                <div className="h-4 bg-slate-200 animate-pulse rounded" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : ranking.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                            No se encontraron registros
                          </TableCell>
                        </TableRow>
                      ) : (
                        ranking.map((item) => (
                          <TableRow key={item.legajo} className="hover:bg-slate-50 transition-colors">
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${getRankBadgeColor(item.ranking)}`}>
                                {item.ranking}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.legajo}</TableCell>
                            <TableCell className="font-medium">{item.nombre}</TableCell>
                            <TableCell className="text-right font-semibold text-red-600">
                              {formatDuration(item.totalMinutos)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm hidden md:table-cell">
                              {item.totalHoras.toFixed(1)}h
                            </TableCell>
                            <TableCell className="text-right hidden sm:table-cell">
                              <Badge variant="secondary">{item.cantidadSalidas}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm text-slate-500 hidden lg:table-cell">
                              {formatDuration(item.promedioMinutos)}
                            </TableCell>
                            <TableCell className="hidden xl:table-cell text-xs text-slate-500" title={item.turno}>
                              {item.turno.length > 25 ? item.turno.substring(0, 25) + '...' : item.turno}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-slate-500">
                      Mostrando {(page - 1) * 25 + 1} a {Math.min(page * 25, totalItems)} de {totalItems}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bar Chart - Top 10 */}
          <TabsContent value="charts">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top 10 - Mayores Tiempos Fuera</CardTitle>
                  <CardDescription>Empleados con mayor tiempo acumulado fuera de depósito</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats && stats.top10.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={stats.top10} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => `${v}h`} />
                        <YAxis
                          type="category"
                          dataKey="nombre"
                          width={180}
                          tick={{ fontSize: 11 }}
                          interval={0}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${value.toFixed(1)} horas`, 'Tiempo Total']}
                          contentStyle={{ borderRadius: 8, fontSize: 13 }}
                        />
                        <Bar dataKey="totalHoras" fill="#ef4444" radius={[0, 4, 4, 0]}>
                          {stats.top10.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-slate-400">
                      Sin datos para mostrar
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top 10 - Cantidad de Salidas</CardTitle>
                  <CardDescription>Empleados con mayor cantidad de salidas del depósito</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats && stats.top10Salidas && stats.top10Salidas.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={stats.top10Salidas} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis
                          type="category"
                          dataKey="nombre"
                          width={180}
                          tick={{ fontSize: 11 }}
                          interval={0}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            name === 'salidas' ? `${value} salidas` : `${value.toFixed(1)} horas`,
                            name === 'salidas' ? 'Cantidad de Salidas' : 'Tiempo Total'
                          ]}
                          contentStyle={{ borderRadius: 8, fontSize: 13 }}
                        />
                        <Bar dataKey="salidas" fill="#f97316" radius={[0, 4, 4, 0]}>
                          {stats.top10Salidas.map((_, index) => (
                            <Cell key={index} fill={COLORS[(index + 3) % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-slate-400">
                      Sin datos para mostrar
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Movimientos Detail + Download */}
          <TabsContent value="movimientos">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ArrowRightLeft className="h-5 w-5" />
                      Movimientos por Empleado y Fecha
                    </CardTitle>
                    <CardDescription>
                      Buscá los ingresos y egresos individuales por nombre y fecha
                    </CardDescription>
                  </div>
                    <Button size="sm" className="gap-2" onClick={downloadMovementsCSV} disabled={!movements || movements.length === 0}>
                      <ArrowDownToLine className="h-4 w-4" />
                      Descargar CSV
                    </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Nombre o Legajo</label>
                    <Input
                      placeholder="Ej: ROLON, RAMON"
                      value={movNombre}
                      onChange={(e) => setMovNombre(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Fecha</label>
                    <Input
                      type="date"
                      value={movFecha}
                      onChange={(e) => setMovFecha(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button className="gap-2 h-9" onClick={fetchMovements} disabled={movLoading}>
                    {movLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Buscar
                  </Button>
                </div>

                {/* Results summary */}
                {movSearched && !movLoading && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">
                      {movements.length} movimiento{movements.length !== 1 ? 's' : ''} encontrado{movements.length !== 1 ? 's' : ''}
                    </Badge>
                    {movNombre && <Badge variant="secondary">{movNombre}</Badge>}
                    {movFecha && <Badge variant="secondary">{movFecha}</Badge>}
                  </div>
                )}

                {/* Movements table */}
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-28">Tipo</TableHead>
                        <TableHead className="w-20">Legajo</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-24">Fecha</TableHead>
                        <TableHead className="w-20 text-center">Hora</TableHead>
                        <TableHead className="w-24 text-right">Duración</TableHead>
                        <TableHead className="hidden lg:table-cell">Turno</TableHead>
                        <TableHead className="hidden md:table-cell">Sector</TableHead>
                        <TableHead className="hidden xl:table-cell">Empresa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <TableCell key={j}>
                                <div className="h-4 bg-slate-200 animate-pulse rounded" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : movements.length === 0 && movSearched ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                            No se encontraron movimientos para esa búsqueda
                          </TableCell>
                        </TableRow>
                      ) : !movSearched ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                            Ingresá un nombre o seleccioná una fecha para buscar movimientos
                          </TableCell>
                        </TableRow>
                      ) : (
                        movements.map((m, idx) => (
                          <TableRow
                            key={`${m.legajo}-${m.fecha}-${m.hora}-${m.tipo}-${idx}`}
                            className={m.tipo === 'Salida Depo' ? 'bg-red-50/50' : 'bg-green-50/50'}
                          >
                            <TableCell>
                              <Badge variant={m.tipo === 'Salida Depo' ? 'destructive' : 'default'} className="text-xs">
                                {m.tipo === 'Salida Depo' ? 'Egreso' : 'Ingreso'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{m.legajo}</TableCell>
                            <TableCell className="font-medium text-sm">{m.nombre}</TableCell>
                            <TableCell className="text-sm">{m.fecha}</TableCell>
                            <TableCell className="text-center font-mono text-sm">{m.hora}</TableCell>
                            <TableCell className="text-right text-sm">
                              {m.duracionMinutos ? formatDuration(m.duracionMinutos) : '-'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-slate-500" title={m.turno}>
                              {m.turno.length > 20 ? m.turno.substring(0, 20) + '...' : m.turno}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm">{m.sector}</TableCell>
                            <TableCell className="hidden xl:table-cell text-sm">{m.empresa}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Auto-suggest names */}
                {movAutoNames.length > 0 && movNombre.length >= 2 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-slate-400">Sugerencias:</span>
                    {movAutoNames
                      .filter(n => n.toLowerCase().includes(movNombre.toLowerCase()))
                      .slice(0, 10)
                      .map(n => (
                        <Badge
                          key={n}
                          variant="outline"
                          className="text-xs cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => setMovNombre(n)}
                        >
                          {n}
                        </Badge>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Distribution Charts */}
          <TabsContent value="distribution">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Distribución por Sector</CardTitle>
                  <CardDescription>Horas totales de tiempos fuera por sector</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats && stats.bySector.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie
                          data={stats.bySector}
                          dataKey="totalHoras"
                          nameKey="sector"
                          cx="50%"
                          cy="50%"
                          outerRadius={140}
                          label={({ sector, totalHoras }) => `${sector} (${totalHoras.toFixed(1)}h)`}
                          labelLine={true}
                          fontSize={11}
                        >
                          {stats.bySector.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => `${value.toFixed(1)} horas`}
                          contentStyle={{ borderRadius: 8, fontSize: 13 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-slate-400">
                      Sin datos para mostrar
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Distribución por Empresa</CardTitle>
                  <CardDescription>Horas totales de tiempos fuera por empresa</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats && stats.byEmpresa.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie
                          data={stats.byEmpresa}
                          dataKey="totalHoras"
                          nameKey="empresa"
                          cx="50%"
                          cy="50%"
                          outerRadius={140}
                          label={({ empresa, totalHoras }) => `${empresa} (${totalHoras.toFixed(1)}h)`}
                          labelLine={true}
                          fontSize={11}
                        >
                          {stats.byEmpresa.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => `${value.toFixed(1)} horas`}
                          contentStyle={{ borderRadius: 8, fontSize: 13 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-slate-400">
                      Sin datos para mostrar
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-slate-400">
          Tiempos Fuera de Depósito — Aplicación de Control y Ranking
        </div>
      </footer>
    </div>
  )
}
