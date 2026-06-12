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
  BarChart3, RefreshCw, List, ArrowDownToLine, ArrowRightLeft, CalendarDays, AlertTriangle, LogOut, LogIn, X, ChevronsUpDown, Check, Coffee, Moon, UtensilsCrossed, ScanFace
} from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'

interface RankingItem {
  ranking: number
  legajo: string
  nombre: string
  totalMinutos: number
  descuentoMinutos: number
  netoMinutos: number
  cantidadSalidas: number
  cantidadIngresos: number
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

interface BreakfastExcessItem {
  legajo: string
  nombre: string
  fecha: string
  horaSalida: string
  horaEntrada: string
  duracionTotal: number
  excesoMinutos: number
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

function formatHHMMSS(totalMinutes: number): string {
  const totalSec = Math.round(totalMinutes * 60)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
  const [uploadingComida, setUploadingComida] = useState(false)
  const comidaFileRef = useRef<HTMLInputElement>(null)
  const [uploadingFacial, setUploadingFacial] = useState(false)
  const facialFileRef = useRef<HTMLInputElement>(null)

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
        fetchBreakfastExcess()
        fetchTnBreakExcess()
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

  const handleComidaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingComida(true)
    try {
      toast.info('Procesando archivo de comida...')
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/comida/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        toast.success(data.message || `${data.inserted} registros de comida cargados`)
        fetchComidaData()
      } else {
        toast.error(`Error: ${data.error}`)
      }
    } catch (err) {
      toast.error('Error al procesar comida: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setUploadingComida(false)
      if (comidaFileRef.current) comidaFileRef.current.value = ''
    }
  }

  const handleFacialUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingFacial(true)
    try {
      toast.info('Procesando archivo de facial...')
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/facial/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        toast.success(data.message || `${data.inserted} registros de facial cargados`)
        fetchFacialData()
        fetchAllMovements()
      } else {
        toast.error(`Error: ${data.error}`)
      }
    } catch (err) {
      toast.error('Error al procesar facial: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setUploadingFacial(false)
      if (facialFileRef.current) facialFileRef.current.value = ''
    }
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

      // Also fetch comida for the same date range to merge into movements
      try {
        const cParams = new URLSearchParams()
        if (fechaDesde) cParams.set('fechaDesde', toISODate(fechaDesde))
        if (fechaHasta) cParams.set('fechaHasta', toISODate(fechaHasta))
        cParams.set('pageSize', '9999')
        const cRes = await fetch(`/api/comida?${cParams}`)
        const cData = await cRes.json()
        // Build map: key = nombre_fecha -> array of comida records
        const map = new Map<string, any[]>()
        for (const c of (cData.data || [])) {
          const key = `${c.nombre.toUpperCase().trim()}_${c.fecha}`
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push(c)
        }
        setComidaMovMerge(map)
      } catch (e) {
        console.error('Error fetching comida for movements:', e)
      }

      // Also fetch facial for the same date range to merge into movements
      try {
        const fParams = new URLSearchParams()
        if (fechaDesde) fParams.set('fechaDesde', toISODate(fechaDesde))
        if (fechaHasta) fParams.set('fechaHasta', toISODate(fechaHasta))
        fParams.set('pageSize', '9999')
        const fRes = await fetch(`/api/facial?${fParams}`)
        const fData = await fRes.json()
        // Build map with TWO keys: nombre_fecha AND apellido_fecha
        const fmap = new Map<string, any[]>()
        for (const f of (fData.data || [])) {
          const nombreKey = `${(f.nombre || '').toUpperCase().trim()}_${f.fecha}`
          const apellidoKey = `${(f.apellido || '').toUpperCase().trim()}_${f.fecha}`
          // Also try each word of apellido for compound surnames
          if (!fmap.has(nombreKey)) fmap.set(nombreKey, [])
          fmap.get(nombreKey)!.push(f)
          if (!fmap.has(apellidoKey)) fmap.set(apellidoKey, [])
          fmap.get(apellidoKey)!.push(f)
          // For compound surnames like "CEJAS BARROS", also index by last word
          const apParts = (f.apellido || '').toUpperCase().trim().split(/\s+/)
          if (apParts.length > 1) {
            const lastWord = apParts[apParts.length - 1]
            const lwKey = `${lastWord}_${f.fecha}`
            if (!fmap.has(lwKey)) fmap.set(lwKey, [])
            fmap.get(lwKey)!.push(f)
          }
        }
        setFacialMovMerge(fmap)
      } catch (e) {
        console.error('Error fetching facial for movements:', e)
      }
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

      // Re-fetch facial for merge
      try {
        const fParams = new URLSearchParams()
        if (fechaDesde) fParams.set('fechaDesde', toISODate(fechaDesde))
        if (fechaHasta) fParams.set('fechaHasta', toISODate(fechaHasta))
        fParams.set('pageSize', '9999')
        const fRes = await fetch(`/api/facial?${fParams}`)
        const fData = await fRes.json()
        const fmap = new Map<string, any[]>()
        for (const f of (fData.data || [])) {
          const nombreKey = `${(f.nombre || '').toUpperCase().trim()}_${f.fecha}`
          const apellidoKey = `${(f.apellido || '').toUpperCase().trim()}_${f.fecha}`
          if (!fmap.has(nombreKey)) fmap.set(nombreKey, [])
          fmap.get(nombreKey)!.push(f)
          if (!fmap.has(apellidoKey)) fmap.set(apellidoKey, [])
          fmap.get(apellidoKey)!.push(f)
          const apParts = (f.apellido || '').toUpperCase().trim().split(/\s+/)
          if (apParts.length > 1) {
            const lastWord = apParts[apParts.length - 1]
            const lwKey = `${lastWord}_${f.fecha}`
            if (!fmap.has(lwKey)) fmap.set(lwKey, [])
            fmap.get(lwKey)!.push(f)
          }
        }
        setFacialMovMerge(fmap)
      } catch (e) {
        console.error('Error fetching facial for movements:', e)
      }
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

  // Breakfast excess state
  const [breakfastExcess, setBreakfastExcess] = useState<BreakfastExcessItem[]>([])
  const [breakfastLoading, setBreakfastLoading] = useState(false)

  // TN break excess state
  const [tnBreakExcess, setTnBreakExcess] = useState<BreakfastExcessItem[]>([])
  const [tnBreakLoading, setTnBreakLoading] = useState(false)

  // Comida state
  const [comidaData, setComidaData] = useState<any[]>([])
  const [comidaMovMerge, setComidaMovMerge] = useState<Map<string, any[]>>(new Map())
  const [comidaTotal, setComidaTotal] = useState(0)
  const [comidaPage, setComidaPage] = useState(1)
  const [comidaTotalPages, setComidaTotalPages] = useState(0)
  const [comidaLoading, setComidaLoading] = useState(false)
  const [comidaSearch, setComidaSearch] = useState('')
  const [comidaSummary, setComidaSummary] = useState({ trabajadores: 0, dias: 0 })

  // Facial state
  const [facialData, setFacialData] = useState<any[]>([])
  const [facialMovMerge, setFacialMovMerge] = useState<Map<string, any[]>>(new Map())
  const [facialTotal, setFacialTotal] = useState(0)
  const [facialPage, setFacialPage] = useState(1)
  const [facialTotalPages, setFacialTotalPages] = useState(0)
  const [facialLoading, setFacialLoading] = useState(false)
  const [facialSearch, setFacialSearch] = useState('')
  const [facialSummary, setFacialSummary] = useState({ trabajadores: 0, dias: 0 })

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

  const fetchBreakfastExcess = useCallback(async () => {
    setBreakfastLoading(true)
    try {
      const params = new URLSearchParams()
      sectorFilter.forEach(s => params.append('sector', s))
      empresaFilter.forEach(e => params.append('empresa', e))
      if (search) params.set('search', search)
      if (fechaDesde) params.set('fechaDesde', toISODate(fechaDesde))
      if (fechaHasta) params.set('fechaHasta', toISODate(fechaHasta))
      const res = await fetch(`/api/breakfast-excess?${params}`)
      const data = await res.json()
      setBreakfastExcess(data.excesos || [])
    } catch (err) {
      console.error('Error fetching breakfast excess:', err)
    } finally {
      setBreakfastLoading(false)
    }
  }, [sectorFilter, empresaFilter, search, fechaDesde, fechaHasta])

  const fetchTnBreakExcess = useCallback(async () => {
    setTnBreakLoading(true)
    try {
      const params = new URLSearchParams()
      sectorFilter.forEach(s => params.append('sector', s))
      empresaFilter.forEach(e => params.append('empresa', e))
      if (search) params.set('search', search)
      if (fechaDesde) params.set('fechaDesde', toISODate(fechaDesde))
      if (fechaHasta) params.set('fechaHasta', toISODate(fechaHasta))
      const res = await fetch(`/api/tn-break-excess?${params}`)
      const data = await res.json()
      setTnBreakExcess(data.excesos || [])
    } catch (err) {
      console.error('Error fetching TN break excess:', err)
    } finally {
      setTnBreakLoading(false)
    }
  }, [sectorFilter, empresaFilter, search, fechaDesde, fechaHasta])

  const fetchComidaData = useCallback(async () => {
    setComidaLoading(true)
    try {
      const params = new URLSearchParams()
      if (comidaSearch) params.set('search', comidaSearch)
      params.set('page', String(comidaPage))
      const res = await fetch(`/api/comida?${params}`)
      const data = await res.json()
      setComidaData(data.data || [])
      setComidaTotal(data.total || 0)
      setComidaTotalPages(data.totalPages || 0)
      setComidaSummary(data.summary || { trabajadores: 0, dias: 0 })
    } catch (err) {
      console.error('Error fetching comida:', err)
    } finally {
      setComidaLoading(false)
    }
  }, [comidaSearch, comidaPage])

  // Auto-fetch comida when tab is opened or search/page changes
  useEffect(() => {
    fetchComidaData()
  }, [fetchComidaData])

  const fetchFacialData = useCallback(async () => {
    setFacialLoading(true)
    try {
      const params = new URLSearchParams()
      if (facialSearch) params.set('search', facialSearch)
      params.set('page', String(facialPage))
      const res = await fetch(`/api/facial?${params}`)
      const data = await res.json()
      setFacialData(data.data || [])
      setFacialTotal(data.total || 0)
      setFacialTotalPages(data.totalPages || 0)
      setFacialSummary(data.summary || { trabajadores: 0, dias: 0 })
    } catch (err) {
      console.error('Error fetching facial:', err)
    } finally {
      setFacialLoading(false)
    }
  }, [facialSearch, facialPage])

  // Auto-fetch facial when tab is opened or search/page changes
  useEffect(() => {
    fetchFacialData()
  }, [fetchFacialData])

  useEffect(() => {
    if (filters.fechaMin) {
      fetchAnomalies()
      fetchBreakfastExcess()
      fetchTnBreakExcess()
    }
  }, [filters.fechaMin, fetchAnomalies, fetchBreakfastExcess, fetchTnBreakExcess])

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

  const filteredMovements = useMemo(() => {
    // Merge comida and facial records into movements
    const merged: MovementItem[] = []
    const usedComida = new Set<string>()
    const usedFacial = new Set<string>()

    for (const m of movements) {
      if (movNombre && !m.nombre.toLowerCase().includes(movNombre.toLowerCase()) && !m.legajo.includes(movNombre)) continue
      if (movFecha && m.fecha !== movFecha) continue
      merged.push(m)
    }

    // Add comida rows matched by nombre and fecha
    for (const m of merged) {
      const key = `${m.nombre.toUpperCase().trim()}_${m.fecha}`
      const comidas = comidaMovMerge.get(key)
      if (comidas) {
        for (const c of comidas) {
          const cKey = `${c.dni}_${c.fecha}_${c.horario}`
          if (!usedComida.has(cKey)) {
            usedComida.add(cKey)
            merged.push({
              tipo: 'Comida TK',
              legajo: '',
              nombre: m.nombre,
              fecha: c.fecha,
              hora: c.horario,
              turno: '',
              sector: '',
              empresa: '',
              duracionMinutos: null,
            })
          }
        }
      }
    }

    // Add facial rows matched by nombre (full) or apellido + fecha
    // First collect all fichada movements (skip non-fichada)
    const fichadaMovs = merged.filter(m => m.tipo !== 'Comida TK' && m.tipo !== 'Facial Entrada' && m.tipo !== 'Facial Salida')
    for (const m of fichadaMovs) {
      const nombreFull = m.nombre.toUpperCase().trim()
      // Try 1: exact full name match
      let facials = facialMovMerge.get(`${nombreFull}_${m.fecha}`)
      // Try 2: apellido (last word)
      if (!facials || facials.length === 0) {
        const nameParts = nombreFull.split(/\s+/)
        const apellido = nameParts[nameParts.length - 1] || ''
        if (apellido) {
          facials = facialMovMerge.get(`${apellido}_${m.fecha}`)
        }
      }
      // Try 3: last 2 words (for compound names like "JESUS CEJAS BARROS" matching "CEJAS BARROS")
      if (!facials || facials.length === 0) {
        const nameParts = nombreFull.split(/\s+/)
        if (nameParts.length >= 2) {
          const last2 = nameParts.slice(-2).join(' ')
          facials = facialMovMerge.get(`${last2}_${m.fecha}`)
        }
      }
      if (facials) {
        for (const f of facials) {
          const fIdKey = `${f.dni}_${f.fecha}_${f.horario}_${f.zona}`
          if (!usedFacial.has(fIdKey)) {
            usedFacial.add(fIdKey)
            const tipo = f.zona.includes('Entrada') ? 'Facial Entrada' : 'Facial Salida'
            merged.push({
              tipo,
              legajo: '',
              nombre: m.nombre,
              fecha: f.fecha,
              hora: f.horario,
              turno: '',
              sector: '',
              empresa: '',
              duracionMinutos: null,
            })
          }
        }
      }
    }

    // Sort by fecha DESC, then hora ASC (comida/facial rows interleave correctly)
    merged.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha)
      if (a.legajo && b.legajo && a.legajo !== b.legajo) return a.legajo.localeCompare(b.legajo)
      return a.hora.localeCompare(b.hora)
    })

    return merged
  }, [movements, movNombre, movFecha, comidaMovMerge, facialMovMerge])

  const totalFichadas = movements.length
  const egresosCount = movements.filter(m => m.tipo === 'Salida Depo').length
  const ingresosCount = movements.filter(m => m.tipo === 'Entrada Depo').length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo-grupo-gestion.jpeg" alt="Grupo Gestión" className="h-10 w-auto object-contain" />
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
              {uploading ? 'Procesando...' : 'Cargar Fichadas'}
            </Button>
            <input
              ref={comidaFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleComidaUpload}
              className="hidden"
            />
            <Button variant="outline" size="sm" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50" disabled={uploadingComida} onClick={() => comidaFileRef.current?.click()}>
              {uploadingComida ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UtensilsCrossed className="h-4 w-4" />}
              {uploadingComida ? 'Procesando...' : 'Cargar Comida'}
            </Button>
            <input
              ref={facialFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFacialUpload}
              className="hidden"
            />
            <Button variant="outline" size="sm" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50" disabled={uploadingFacial} onClick={() => facialFileRef.current?.click()}>
              {uploadingFacial ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
              {uploadingFacial ? 'Procesando...' : 'Cargar Facial'}
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
            <TabsTrigger value="desayuno" className="gap-2">
              <Coffee className="h-4 w-4" />
              Exceso Desayuno
              {breakfastExcess.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{breakfastExcess.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="break-tn" className="gap-2">
              <Moon className="h-4 w-4" />
              Break TN
              {tnBreakExcess.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{tnBreakExcess.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="comida" className="gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              Horario Comida
            </TabsTrigger>
            <TabsTrigger value="facial" className="gap-2">
              <ScanFace className="h-4 w-4" />
              Horario Facial
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
                        <TableHead className="text-right hidden md:table-cell">Descuento</TableHead>
                        <TableHead className="text-right">Tiempo Neto</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Salidas</TableHead>
                        <TableHead className="text-right hidden lg:table-cell">Promedio</TableHead>
                        <TableHead className="hidden xl:table-cell">Turno</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <TableCell key={j}>
                                <div className="h-4 bg-slate-200 animate-pulse rounded" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : ranking.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-slate-500">
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
                            <TableCell className="text-right font-mono text-sm">
                              {formatHHMMSS(item.totalMinutos)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-orange-600 hidden md:table-cell">
                              {formatHHMMSS(item.descuentoMinutos || 0)}
                            </TableCell>
                            <TableCell className="text-right font-semibold font-mono text-sm text-red-600">
                              {formatHHMMSS(item.netoMinutos)}
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
                            className={m.tipo === 'Facial Entrada' || m.tipo === 'Facial Salida' ? 'bg-sky-100/70' : m.tipo === 'Comida TK' ? 'bg-emerald-100/70' : m.tipo === 'Salida Depo' ? 'bg-red-50/50' : 'bg-green-50/50'}
                          >
                            <TableCell>
                              {m.tipo === 'Facial Entrada' ? (
                                <Badge className="text-xs bg-sky-600 hover:bg-sky-700 text-white">Facial Ingreso</Badge>
                              ) : m.tipo === 'Facial Salida' ? (
                                <Badge className="text-xs bg-sky-600 hover:bg-sky-700 text-white">Facial Egreso</Badge>
                              ) : m.tipo === 'Comida TK' ? (
                                <Badge className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white">Comida TK</Badge>
                              ) : (
                                <Badge variant={m.tipo === 'Salida Depo' ? 'destructive' : 'default'} className="text-xs">
                                  {m.tipo === 'Salida Depo' ? 'Egreso' : 'Ingreso'}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{m.legajo || '-'}</TableCell>
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

          {/* Exceso de Desayuno */}
          <TabsContent value="desayuno">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Coffee className="h-5 w-5 text-amber-600" />
                      Exceso de Desayuno
                    </CardTitle>
                    <CardDescription>
                      Diferencias superiores a 25 minutos entre las 06:30 y 10:30 hs
                      {breakfastExcess.length > 0 && ` — ${breakfastExcess.length} registro(s)`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchBreakfastExcess()} disabled={breakfastLoading}>
                      <RefreshCw className={`h-4 w-4 ${breakfastLoading ? 'animate-spin' : ''}`} />
                      Actualizar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-20">Legajo</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead className="w-20 text-center">H. Salida</TableHead>
                        <TableHead className="w-20 text-center">H. Entrada</TableHead>
                        <TableHead className="text-right">Duración Total</TableHead>
                        <TableHead className="text-right">Exceso</TableHead>
                        <TableHead className="hidden lg:table-cell">Turno</TableHead>
                        <TableHead className="hidden md:table-cell">Sector</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakfastLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <TableCell key={j}>
                                <div className="h-4 bg-slate-200 animate-pulse rounded" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : breakfastExcess.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                            No hay excesos de desayuno registrados
                          </TableCell>
                        </TableRow>
                      ) : (
                        breakfastExcess.map((b, idx) => (
                          <TableRow key={`${b.legajo}-${b.fecha}-${b.horaSalida}-${idx}`} className="hover:bg-amber-50/50 transition-colors">
                            <TableCell className="font-mono text-sm">{b.legajo}</TableCell>
                            <TableCell className="font-medium text-sm">{b.nombre}</TableCell>
                            <TableCell className="text-sm">{formatDateDisplay(b.fecha)}</TableCell>
                            <TableCell className="text-center font-mono text-sm">{b.horaSalida}</TableCell>
                            <TableCell className="text-center font-mono text-sm">{b.horaEntrada}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatHHMMSS(b.duracionTotal)}</TableCell>
                            <TableCell className="text-right font-semibold font-mono text-sm text-red-600">
                              +{formatHHMMSS(b.excesoMinutos)}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-slate-500">{b.turno}</TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-slate-500">{b.sector}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Break TN */}
          <TabsContent value="break-tn">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Moon className="h-5 w-5 text-indigo-600" />
                      Break TN
                    </CardTitle>
                    <CardDescription>
                      Diferencias superiores a 15 minutos entre las 02:45 y 03:45 hs
                      {tnBreakExcess.length > 0 && ` — ${tnBreakExcess.length} registro(s)`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchTnBreakExcess()} disabled={tnBreakLoading}>
                      <RefreshCw className={`h-4 w-4 ${tnBreakLoading ? 'animate-spin' : ''}`} />
                      Actualizar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-20">Legajo</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead className="w-20 text-center">H. Salida</TableHead>
                        <TableHead className="w-20 text-center">H. Entrada</TableHead>
                        <TableHead className="text-right">Duración Total</TableHead>
                        <TableHead className="text-right">Exceso</TableHead>
                        <TableHead className="hidden lg:table-cell">Turno</TableHead>
                        <TableHead className="hidden md:table-cell">Sector</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tnBreakLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <TableCell key={j}>
                                <div className="h-4 bg-slate-200 animate-pulse rounded" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : tnBreakExcess.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                            No hay excesos de break TN registrados
                          </TableCell>
                        </TableRow>
                      ) : (
                        tnBreakExcess.map((b, idx) => (
                          <TableRow key={`${b.legajo}-${b.fecha}-${b.horaSalida}-${idx}`} className="hover:bg-indigo-50/50 transition-colors">
                            <TableCell className="font-mono text-sm">{b.legajo}</TableCell>
                            <TableCell className="font-medium text-sm">{b.nombre}</TableCell>
                            <TableCell className="text-sm">{formatDateDisplay(b.fecha)}</TableCell>
                            <TableCell className="text-center font-mono text-sm">{b.horaSalida}</TableCell>
                            <TableCell className="text-center font-mono text-sm">{b.horaEntrada}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatHHMMSS(b.duracionTotal)}</TableCell>
                            <TableCell className="text-right font-semibold font-mono text-sm text-red-600">
                              +{formatHHMMSS(b.excesoMinutos)}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-slate-500">{b.turno}</TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-slate-500">{b.sector}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Horario Comida */}
          <TabsContent value="comida">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <UtensilsCrossed className="h-5 w-5 text-orange-600" />
                      Horario Comida
                    </CardTitle>
                    <CardDescription>
                      Registro de tickets de comida por trabajador
                      {comidaTotal > 0 && ` — ${comidaSummary.trabajadores} trabajadores, ${comidaSummary.dias} días, ${comidaTotal} registros`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Buscar nombre o DNI..."
                      value={comidaSearch}
                      onChange={(e) => { setComidaSearch(e.target.value); setComidaPage(1) }}
                      className="w-48 h-8 text-sm"
                    />
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchComidaData()} disabled={comidaLoading}>
                      <RefreshCw className={`h-4 w-4 ${comidaLoading ? 'animate-spin' : ''}`} />
                      Actualizar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-24">DNI</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead className="w-20 text-center">Horario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comidaLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 4 }).map((_, j) => (
                              <TableCell key={j}>
                                <div className="h-4 bg-slate-200 animate-pulse rounded" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : comidaData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12 text-slate-500">
                            No hay datos de comida cargados. Usá el botón "Cargar Comida" para subir el Excel.
                          </TableCell>
                        </TableRow>
                      ) : (
                        comidaData.map((c, idx) => (
                          <TableRow key={`${c.dni}-${c.fecha}-${c.horario}-${idx}`} className="hover:bg-orange-50/50 transition-colors">
                            <TableCell className="font-mono text-sm">{c.dni}</TableCell>
                            <TableCell className="font-medium text-sm">{c.nombre}</TableCell>
                            <TableCell className="text-sm">{formatDateDisplay(c.fecha)}</TableCell>
                            <TableCell className="text-center font-mono text-sm">{c.horario}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {comidaTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <span className="text-sm text-slate-500">{comidaTotal} registros</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={comidaPage <= 1} onClick={() => setComidaPage(p => p - 1)}>Anterior</Button>
                      <span className="text-sm">Pág. {comidaPage} de {comidaTotalPages}</span>
                      <Button size="sm" variant="outline" disabled={comidaPage >= comidaTotalPages} onClick={() => setComidaPage(p => p + 1)}>Siguiente</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Horario Facial */}
          <TabsContent value="facial">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ScanFace className="h-5 w-5 text-blue-600" />
                      Horario Facial
                    </CardTitle>
                    <CardDescription>
                      Registro de ingresos/egresos por reconocimiento facial
                      {facialTotal > 0 && ` — ${facialSummary.trabajadores} trabajadores, ${facialSummary.dias} días, ${facialTotal} registros`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Buscar nombre o DNI..."
                      value={facialSearch}
                      onChange={(e) => { setFacialSearch(e.target.value); setFacialPage(1) }}
                      className="w-48 h-8 text-sm"
                    />
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchFacialData()} disabled={facialLoading}>
                      <RefreshCw className={`h-4 w-4 ${facialLoading ? 'animate-spin' : ''}`} />
                      Actualizar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-24">DNI</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead className="w-20 text-center">Horario</TableHead>
                        <TableHead className="w-28 text-center">Zona</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {facialLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <TableCell key={j}>
                                <div className="h-4 bg-slate-200 animate-pulse rounded" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : facialData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                            No hay datos de facial cargados. Usá el botón "Cargar Facial" para subir el Excel.
                          </TableCell>
                        </TableRow>
                      ) : (
                        facialData.map((f, idx) => (
                          <TableRow key={`${f.dni}-${f.fecha}-${f.horario}-${f.zona}-${idx}`} className="hover:bg-sky-50/50 transition-colors">
                            <TableCell className="font-mono text-sm">{f.dni}</TableCell>
                            <TableCell className="font-medium text-sm">{f.nombre}</TableCell>
                            <TableCell className="text-sm">{formatDateDisplay(f.fecha)}</TableCell>
                            <TableCell className="text-center font-mono text-sm">{f.horario}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={f.zona.includes('Entrada') ? 'default' : 'destructive'} className="text-xs">
                                {f.zona.includes('Entrada') ? 'Ingreso' : 'Egreso'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {facialTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <span className="text-sm text-slate-500">{facialTotal} registros</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={facialPage <= 1} onClick={() => setFacialPage(p => p - 1)}>Anterior</Button>
                      <span className="text-sm">Pág. {facialPage} de {facialTotalPages}</span>
                      <Button size="sm" variant="outline" disabled={facialPage >= facialTotalPages} onClick={() => setFacialPage(p => p + 1)}>Siguiente</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}