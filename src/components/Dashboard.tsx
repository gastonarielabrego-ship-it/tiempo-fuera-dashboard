'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Upload, Clock, Users, TrendingUp, Search, Trophy,
  BarChart3, RefreshCw, List, ArrowDownToLine, ArrowRightLeft, CalendarDays, AlertTriangle, LogOut, LogIn, X, ChevronsUpDown, Check
} from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'

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
  totalEgresos: number
  totalIngresos: number
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

interface AnomaliaItem {
  id: string
  legajo: string
  nombre: string
  fecha: string
  horaEntrada1: string
  horaEntrada2: string
  diferenciaMinutos: number
  turno: string
  sector: string
  empresa: string
}

interface FilterData {
  sectores: string[]
  empresas: string[]
  fechaMin: string
  fechaMax: string
}

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

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const day = parts[2].padStart(2, '0')
    const month = parts[1].padStart(2, '0')
    const year = parts[0]
    return `${day}/${month}/${year}`
  }
  return dateStr
}

function toISODate(displayStr: string): string {
  if (!displayStr) return ''
  const parts = displayStr.split('/')
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return displayStr
}

export default function Dashboard() {
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [stats, setStats] = useState<StatsData | null>(null)
  const [filters, setFilters] = useState<FilterData>({ sectores: [], empresas: [], fechaMin: '', fechaMax: '' })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  // Filter state
  const [sectorFilter, setSectorFilter] = useState<string[]>([])
  const [empresaFilter, setEmpresaFilter] = useState<string[]>([])
  const [turnoFilter, setTurnoFilter] = useState('')
  const [search, setSearch] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [sortBy, setSortBy] = useState<'tiempo' | 'salidas'>('tiempo')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  const fetchRanking = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      sectorFilter.forEach(s => params.append('sector', s))
      empresaFilter.forEach(e => params.append('empresa', e))
      if (turnoFilter) params.set('turnoTipo', turnoFilter)
      if (search) params.set('search', search)
      if (sortBy) params.set('sortBy', sortBy)
      params.set('page', String(page))
      if (fechaDesde) params.set('fechaDesde', toISODate(fechaDesde))
      if (fechaHasta) params.set('fechaHasta', toISODate(fechaHasta))

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
  }, [sectorFilter, empresaFilter, turnoFilter, search, sortBy, page, fechaDesde, fechaHasta])

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      sectorFilter.forEach(s => params.append('sector', s))
      empresaFilter.forEach(e => params.append('empresa', e))
      if (turnoFilter) params.set('turnoTipo', turnoFilter)
      if (fechaDesde) params.set('fechaDesde', toISODate(fechaDesde))
      if (fechaHasta) params.set('fechaHasta', toISODate(fechaHasta))

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

  useEffect(() => {
    setPage(1)
  }, [sectorFilter, empresaFilter, search, fechaDesde, fechaHasta])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      toast.info('Procesando archivo...')

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        const extraMsg = data.dobleEntradas > 0 ? ` | ${data.dobleEntradas} inconsistencia(s) detectada(s)` : ''
        toast.success(`${data.sessionsInserted} sesiones cargadas (${data.rowsProcessed} filas, ${data.fichadasTotal} fichadas)${extraMsg}`)
        fetchRanking()
        fetchStats()
        fetchAllMovements()
        fetchAnomalies()
      } else {
        toast.error(`Error: ${data.error}`)
      }
    } catch (err) {
      toast.error('Error al procesar: ' + (err instanceof Error ? err.message : String(err)))
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const clearFilters = () => {
    setSectorFilter([])
    setEmpresaFilter([])
    setTurnoFilter('')
    setSearch('')
    setFechaDesde('')
    setFechaHasta('')
  }

  // Movements state
  const [movements, setMovements] = useState<MovementItem[]>([])
  const [movLoading, setMovLoading] = useState(false)
  const [movAutoNames, setMovAutoNames] = useState<string[]>([])
  const [movUniqueDates, setMovUniqueDates] = useState<string[]>([])
  const [movNombre, setMovNombre] = useState('')
  const [movFecha, setMovFecha] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchAllMovements = useCallback(async () => {
    setMovLoading(true)
    try {
      const params = new URLSearchParams()
      if (fechaDesde) params.set('fechaDesde', toISODate(fechaDesde))
      if (fechaHasta) params.set('fechaHasta', toISODate(fechaHasta))
      const res = await fetch(`/api/movements?${params}`)
      const data = await res.json()
      setMovements(data.movements)
      setMovAutoNames(data.uniqueNames || [])
      setMovUniqueDates(data.uniqueDates || [])
    } catch (err) {
      console.error('Error fetching movements:', err)
    } finally {
      setMovLoading(false)
    }
  }, [fechaDesde, fechaHasta])

  const fetchFilteredMovements = useCallback(async () => {
    setMovLoading(true)
    try {
      const params = new URLSearchParams()
      if (movNombre) params.set('nombre', movNombre)
      if (movFecha) params.set('fecha', movFecha)
      if (fechaDesde) params.set('fechaDesde', toISODate(fechaDesde))
      if (fechaHasta) params.set('fechaHasta', toISODate(fechaHasta))
      const res = await fetch(`/api/movements?${params}`)
      const data = await res.json()
      setMovements(data.movements)
      setMovAutoNames(data.uniqueNames || [])
      setMovUniqueDates(data.uniqueDates || [])
    } catch (err) {
      toast.error('Error al buscar movimientos')
    } finally {
      setMovLoading(false)
    }
  }, [movNombre, movFecha, fechaDesde, fechaHasta])

  useEffect(() => {
    if (filters.fechaMin) {
      fetchAllMovements()
    }
  }, [filters.fechaMin, fetchAllMovements])

  // Anomalies state
  const [anomalies, setAnomalies] = useState<AnomaliaItem[]>([])
  const [anomLoading, setAnomLoading] = useState(false)
  const [anomUniqueDates, setAnomUniqueDates] = useState<string[]>([])
  const [anomFecha, setAnomFecha] = useState('')
  const [anomSearch, setAnomSearch] = useState('')

  const fetchAnomalies = useCallback(async () => {
    setAnomLoading(true)
    try {
      const params = new URLSearchParams()
      if (anomSearch) params.set('search', anomSearch)
      if (anomFecha) params.set('fecha', anomFecha)
      if (turnoFilter) params.set('turnoTipo', turnoFilter)
      if (fechaDesde) params.set('fechaDesde', toISODate(fechaDesde))
      if (fechaHasta) params.set('fechaHasta', toISODate(fechaHasta))
      const res = await fetch(`/api/anomalies?${params}`)
      const data = await res.json()
      setAnomalies(data.anomalies || [])
      setAnomUniqueDates(data.uniqueDates || [])
    } catch (err) {
      console.error('Error fetching anomalies:', err)
    } finally {
      setAnomLoading(false)
    }
  }, [anomSearch, anomFecha, turnoFilter, fechaDesde, fechaHasta])

  useEffect(() => {
    if (filters.fechaMin) {
      fetchAnomalies()
    }
  }, [filters.fechaMin, fetchAnomalies])

  const downloadMovementsCSV = () => {
    if (!movements || movements.length === 0) return
    try {
      const BOM = '\uFEFF'
      const headers = ['Tipo', 'Legajo', 'Nombre', 'Fecha', 'Hora', 'Duracion (min)', 'Turno', 'Sector', 'Empresa']
      const rows = movements.map(m => [
        m.tipo, m.legajo, m.nombre, m.fecha, m.hora,
        m.duracionMinutos ? String(m.duracionMinutos) : '-',
        m.turno, m.sector, m.empresa,
      ])
      const csvContent = BOM + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = `movimientos_todos.csv`
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

  const downloadAnomaliesCSV = () => {
    if (!anomalies || anomalies.length === 0) return
    try {
      const BOM = '\uFEFF'
      const headers = ['Legajo', 'Nombre', 'Fecha', '1ra Entrada', '2da Entrada', 'Diferencia (min)', 'Turno', 'Sector', 'Empresa']
      const rows = anomalies.map(a => [
        a.legajo, a.nombre, a.fecha, a.horaEntrada1, a.horaEntrada2,
        a.diferenciaMinutos, a.turno, a.sector, a.empresa,
      ])
      const csvContent = BOM + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = `inconsistencias.csv`
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

  const hasFilters = sectorFilter.length > 0 || empresaFilter.length > 0 || turnoFilter || search || fechaDesde || fechaHasta

  const fechasCargadas = movUniqueDates.length > 0 ? movUniqueDates.sort().map(formatDateDisplay) : []

  const filteredMovements = movements.filter(m => {
    if (movNombre && !m.nombre.toLowerCase().includes(movNombre.toLowerCase()) && !m.legajo.includes(movNombre)) return false
    if (movFecha && m.fecha !== movFecha) return false
    return true
  })

  const totalFichadas = movements.length
  const egresosCount = movements.filter(m => m.tipo === 'Salida Depo').length
  const ingresosCount = movements.filter(m => m.tipo === 'Entrada Depo').length

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
          <div className="flex items-center gap-3">
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
        {/* Stats Cards - 5 cards: Egresos, Ingresos, Tiempo Total, Empleados, Promedio */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <LogOut className="h-4 w-4 text-red-500" />
                  Egresos
                </div>
                <p className="text-2xl font-bold text-slate-900">{(stats.totalEgresos || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-400">salidas del depósito</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <LogIn className="h-4 w-4 text-green-500" />
                  Ingresos
                </div>
                <p className="text-2xl font-bold text-slate-900">{(stats.totalIngresos || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-400">ingresos al depósito</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Tiempo Total
                </div>
                <p className="text-2xl font-bold text-slate-900">{formatDuration(stats.totalMinutos)}</p>
                <p className="text-xs text-slate-400">{stats.totalHoras.toLocaleString()} horas</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <Users className="h-4 w-4" />
                  Empleados
                </div>
                <p className="text-2xl font-bold text-slate-900">{stats.empleadosUnicos}</p>
                <p className="text-xs text-slate-400">con registros</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Promedio
                </div>
                <p className="text-2xl font-bold text-slate-900">{formatDuration(stats.promedioMinutos)}</p>
                <p className="text-xs text-slate-400">por salida</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Fechas cargadas */}
        {fechasCargadas.length > 0 && (
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {fechasCargadas.length === 1
                      ? `Fecha cargada: ${fechasCargadas[0]}`
                      : `Fechas cargadas (${fechasCargadas.length}):`
                    }
                  </p>
                  {fechasCargadas.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {fechasCargadas.map(f => (
                        <Badge key={f} variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Desde</label>
                <Input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Hasta</label>
                <Input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="h-9"
                />
              </div>
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 w-full justify-between text-left font-normal">
                      <span className="truncate">
                        {sectorFilter.length === 0 ? 'Todos' : `${sectorFilter.length} seleccionado(s)`}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <div className="p-2 border-b flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Sectores ({filters.sectores.length})</span>
                      {sectorFilter.length > 0 && (
                        <button onClick={() => setSectorFilter([])} className="text-xs text-slate-400 hover:text-slate-600">Limpiar</button>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {filters.sectores.map((s) => (
                        <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-slate-50 cursor-pointer text-sm">
                          <Checkbox
                            checked={sectorFilter.includes(s)}
                            onCheckedChange={(checked) => {
                              if (checked) setSectorFilter([...sectorFilter, s])
                              else setSectorFilter(sectorFilter.filter(x => x !== s))
                            }}
                          />
                          <span>{s}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Empresa</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 w-full justify-between text-left font-normal">
                      <span className="truncate">
                        {empresaFilter.length === 0 ? 'Todas' : `${empresaFilter.length} seleccionada(s)`}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <div className="p-2 border-b flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Empresas ({filters.empresas.length})</span>
                      {empresaFilter.length > 0 && (
                        <button onClick={() => setEmpresaFilter([])} className="text-xs text-slate-400 hover:text-slate-600">Limpiar</button>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {filters.empresas.map((e) => (
                        <label key={e} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-slate-50 cursor-pointer text-sm">
                          <Checkbox
                            checked={empresaFilter.includes(e)}
                            onCheckedChange={(checked) => {
                              if (checked) setEmpresaFilter([...empresaFilter, e])
                              else setEmpresaFilter(empresaFilter.filter(x => x !== e))
                            }}
                          />
                          <span>{e}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
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
                    <SelectItem value="Descanso">Descanso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-slate-500">
                    Limpiar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content: Ranking + Movimientos + Inconsistencias */}
        <Tabs defaultValue="ranking" className="space-y-4">
          <TabsList className="bg-white">
            <TabsTrigger value="ranking" className="gap-2">
              <Trophy className="h-4 w-4" />
              Ranking
            </TabsTrigger>
            <TabsTrigger value="movimientos" className="gap-2">
              <List className="h-4 w-4" />
              Movimientos
            </TabsTrigger>
            <TabsTrigger value="inconsistencias" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Inconsistencias
              {anomalies.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{anomalies.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Ranking Table */}
          <TabsContent value="ranking">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
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
                    <Badge variant="outline" className="text-xs">
                      Pág. {page} de {totalPages}
                    </Badge>
                  </div>
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
                          <TableCell colSpan={8} className="text-center py-12 text-slate-500">
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

                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-slate-500">
                      Mostrando {(page - 1) * 25 + 1} a {Math.min(page * 25, totalItems)} de {totalItems}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        Anterior
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Movimientos */}
          <TabsContent value="movimientos">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ArrowRightLeft className="h-5 w-5" />
                      Todos los Movimientos
                    </CardTitle>
                    <CardDescription>
                      {egresosCount} egresos, {ingresosCount} ingresos. {filteredMovements.length} registros mostrados.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-2" onClick={downloadMovementsCSV} disabled={!movements || movements.length === 0}>
                      <ArrowDownToLine className="h-4 w-4" />
                      CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Filtrar por Nombre/Legajo</label>
                    <Input
                      placeholder="Todos"
                      value={movNombre}
                      onChange={(e) => setMovNombre(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Filtrar por Fecha</label>
                    <Select value={movFecha || '__all__'} onValueChange={(v) => setMovFecha(v === '__all__' ? '' : v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todas las fechas</SelectItem>
                        {movUniqueDates.map((d) => (
                          <SelectItem key={d} value={d}>{formatDateDisplay(d)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button className="gap-2 h-9" onClick={fetchFilteredMovements} disabled={movLoading}>
                      {movLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Filtrar
                    </Button>
                  </div>
                  <div className="flex items-end">
                    {(movNombre || movFecha) && (
                      <Button variant="ghost" size="sm" onClick={() => { setMovNombre(''); setMovFecha(''); fetchAllMovements() }} className="h-9 text-slate-500">
                        Ver todos
                      </Button>
                    )}
                  </div>
                </div>

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

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-28">Tipo</TableHead>
                        <TableHead className="w-20">Legajo</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead className="w-20 text-center">Hora</TableHead>
                        <TableHead className="w-32 text-right">Dur. desde anterior</TableHead>
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
                      ) : filteredMovements.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                            No hay movimientos cargados. Subí un archivo Excel para comenzar.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMovements.map((m, idx) => (
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
                            <TableCell className="text-sm">{formatDateDisplay(m.fecha)}</TableCell>
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inconsistencias */}
          <TabsContent value="inconsistencias">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Doble Entrada
                    </CardTitle>
                    <CardDescription>
                      Empleados con dos ingresos consecutivos sin registrar salida. {anomalies.length} encontradas.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-2" onClick={downloadAnomaliesCSV} disabled={anomalies.length === 0}>
                      <ArrowDownToLine className="h-4 w-4" />
                      CSV
                    </Button>
                    <Button size="sm" variant="outline" className="gap-2" onClick={fetchAnomalies}>
                      <RefreshCw className="h-4 w-4" />
                      Actualizar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Buscar Nombre/Legajo</label>
                    <Input
                      placeholder="Todos"
                      value={anomSearch}
                      onChange={(e) => setAnomSearch(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Fecha</label>
                    <Select value={anomFecha || '__all__'} onValueChange={(v) => setAnomFecha(v === '__all__' ? '' : v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todas</SelectItem>
                        {anomUniqueDates.map((d) => (
                          <SelectItem key={d} value={d}>{formatDateDisplay(d)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="gap-2 h-9" onClick={fetchAnomalies} disabled={anomLoading}>
                    {anomLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Filtrar
                  </Button>
                </div>

                <div className="overflow-x-auto max-h-[500px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow className="bg-amber-50">
                        <TableHead className="w-20">Legajo</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead className="w-20 text-center">1ra Entrada</TableHead>
                        <TableHead className="w-20 text-center">2da Entrada</TableHead>
                        <TableHead className="w-24 text-center">Diferencia</TableHead>
                        <TableHead className="hidden md:table-cell">Turno</TableHead>
                        <TableHead className="hidden lg:table-cell">Sector</TableHead>
                        <TableHead className="hidden xl:table-cell">Empresa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {anomLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <TableCell key={j}>
                                <div className="h-4 bg-slate-200 animate-pulse rounded" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : anomalies.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                            No se encontraron dobles entradas
                          </TableCell>
                        </TableRow>
                      ) : (
                        anomalies.map((a, idx) => (
                          <TableRow key={a.id || idx} className="bg-amber-50/50 hover:bg-amber-100/50 transition-colors">
                            <TableCell className="font-mono text-sm">{a.legajo}</TableCell>
                            <TableCell className="font-medium text-sm">{a.nombre}</TableCell>
                            <TableCell className="text-sm">{formatDateDisplay(a.fecha)}</TableCell>
                            <TableCell className="text-center font-mono text-sm font-medium text-green-700">{a.horaEntrada1}</TableCell>
                            <TableCell className="text-center font-mono text-sm font-medium text-green-700">{a.horaEntrada2}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-mono">
                                {formatDuration(a.diferenciaMinutos)}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-slate-500">{a.turno}</TableCell>
                            <TableCell className="hidden lg:table-cell text-sm">{a.sector}</TableCell>
                            <TableCell className="hidden xl:table-cell text-sm">{a.empresa}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}