'use client'

import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { PassedApplicant, OpeningWithPassedCount } from '@/lib/types'

interface Props {
  passedApplicants: PassedApplicant[]
  openings: OpeningWithPassedCount[]
}

const tooltipStyle = {
  borderRadius: '8px',
  border: '1px solid #e4e4e7',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
  fontSize: '12px',
}

const PAGE_SIZE = 10

// Chart Series 8색 (image 2 기준)
const FIELD_COLORS = ['#3b82f6', '#06b6d4', '#f59e0b', '#8b5cf6', '#f43f5e', '#d946ef', '#f97316', '#14b8a6']

function getFieldColor(field: string): string {
  let hash = 0
  for (let i = 0; i < field.length; i++) hash = field.charCodeAt(i) + ((hash << 5) - hash)
  return FIELD_COLORS[Math.abs(hash) % FIELD_COLORS.length]
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function isInternal(referer: string | null): boolean {
  if (!referer) return false
  const lower = referer.toLowerCase().replace(/\s+/g, '')
  return lower.includes('사내추천') || lower.includes('내부추천') || lower === 'internal'
}

function isDirect(referer: string | null): boolean {
  if (!referer) return false
  const lower = referer.toLowerCase().replace(/\s+/g, '')
  return lower.includes('다이렉트') || lower.includes('direct') || lower.includes('소싱')
}

export default function FunnelTab({ passedApplicants, openings }: Props) {
  const [search, setSearch] = useState('')
  const [filterOpening, setFilterOpening] = useState('')
  const [filterChannel, setFilterChannel] = useState<'all' | 'internal' | 'direct'>('all')
  const [page, setPage] = useState(0)

  // 공고별 리드타임
  const openingLeadTime = openings
    .map((o) => {
      const applicants = passedApplicants.filter((a) => a.openingId === o.id && a.submitDate && a.passDate)
      const days = applicants
        .map((a) => Math.round((new Date(a.passDate).getTime() - new Date(a.submitDate).getTime()) / (1000 * 60 * 60 * 24)))
        .filter((d) => d >= 0)
      const avg = days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null
      return {
        name: o.title.length > 12 ? o.title.slice(0, 12) + '...' : o.title,
        fullName: o.title,
        avgDays: avg,
      }
    })
    .filter((o) => o.avgDays !== null)
    .sort((a, b) => (b.avgDays ?? 0) - (a.avgDays ?? 0))

  const allDays = passedApplicants
    .filter((a) => a.submitDate && a.passDate)
    .map((a) => Math.round((new Date(a.passDate).getTime() - new Date(a.submitDate).getTime()) / (1000 * 60 * 60 * 24)))
    .filter((d) => d >= 0)
  const overallAvgDays = allDays.length > 0 ? Math.round(allDays.reduce((a, b) => a + b, 0) / allDays.length) : null

  // 합격자 목록 필터
  const openingOptions = Array.from(
    new Map(passedApplicants.map((a) => [a.openingId, a.openingTitle])).entries(),
  )

  const filtered = useMemo(() => {
    return passedApplicants
      .filter((a) => {
        const matchSearch = search === '' || a.name.includes(search) || a.email.includes(search)
        const matchOpening = filterOpening === '' || String(a.openingId) === filterOpening
        const matchChannel =
          filterChannel === 'all' ||
          (filterChannel === 'internal' && isInternal(a.referer)) ||
          (filterChannel === 'direct' && isDirect(a.referer))
        return matchSearch && matchOpening && matchChannel
      })
      .sort((a, b) => new Date(b.passDate).getTime() - new Date(a.passDate).getTime())
  }, [passedApplicants, search, filterOpening, filterChannel])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleSearch = (v: string) => { setSearch(v); setPage(0) }
  const handleFilter = (v: string) => { setFilterOpening(v); setPage(0) }
  const handleChannel = (v: 'all' | 'internal' | 'direct') => { setFilterChannel(v); setPage(0) }

  return (
    <div className="space-y-6">
      {/* 리드타임 분석 */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">리드타임 분석</h3>
                <p className="text-sm text-zinc-500 mt-1">공고별 평균 채용 소요일</p>
              </div>
              {overallAvgDays !== null && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-zinc-900">{overallAvgDays}일</p>
                  <p className="text-xs text-zinc-400">전체 평균</p>
                </div>
              )}
            </div>
          </div>
          <div className="p-6 pt-2">
            {openingLeadTime.length === 0 ? (
              <p className="text-sm text-zinc-400 py-8 text-center">데이터가 없습니다</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, openingLeadTime.length * 44)}>
                <BarChart data={openingLeadTime} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} unit="일" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}일`, '평균 소요일']} />
                  <Bar dataKey="avgDays" name="평균 소요일" radius={[0, 4, 4, 0]} barSize={20}>
                    {openingLeadTime.map((entry, i) => (
                      <Cell key={i} fill={(entry.avgDays ?? 0) >= (overallAvgDays ?? 999) ? '#ef4444' : '#f59e0b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      {/* 합격자 목록 */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="p-6 pb-4">
          <h3 className="text-base font-semibold text-zinc-900">합격자 목록</h3>
          <p className="text-sm text-zinc-500 mt-1">총 {filtered.length}명</p>

          {/* 채널 탭 */}
          <div className="flex gap-1 mt-4 border-b border-zinc-100 pb-0">
            {([
              { key: 'all', label: '전체' },
              { key: 'internal', label: '사내추천' },
              { key: 'direct', label: '다이렉트 소싱' },
            ] as const).map((ch) => (
              <button
                key={ch.key}
                onClick={() => handleChannel(ch.key)}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  filterChannel === ch.key
                    ? 'border-[#40E2FF] text-zinc-900'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="이름 또는 이메일 검색..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 pl-8 py-1 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors"
              />
            </div>
            <select
              value={filterOpening}
              onChange={(e) => handleFilter(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            >
              <option value="">전체 공고</option>
              {openingOptions.map(([id, title]) => (
                <option key={id} value={String(id)}>{title}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="h-10 text-left font-medium text-zinc-500">이름</th>
                  <th className="h-10 text-left font-medium text-zinc-500">공고</th>
                  <th className="h-10 text-left font-medium text-zinc-500">합격일</th>
                  <th className="h-10 text-right font-medium text-zinc-500">소요일</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-zinc-400">
                      검색 결과가 없습니다
                    </td>
                  </tr>
                ) : (
                  paged.map((a) => {
                    const days = a.submitDate && a.passDate
                      ? Math.round((new Date(a.passDate).getTime() - new Date(a.submitDate).getTime()) / (1000 * 60 * 60 * 24))
                      : null
                    return (
                      <tr key={a.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600">
                              {a.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-zinc-800">{a.name}</p>
                              <p className="text-xs text-zinc-400 mt-0.5 truncate">{a.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="text-xs text-zinc-700 break-keep">{a.openingTitle}</span>
                            {(() => {
                              const field = a.desiredJobPositions.find((p) => p.priority === 1)?.field ?? a.desiredJobPositions[0]?.field
                              if (!field) return null
                              const color = getFieldColor(field)
                              return (
                                <span
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                                  style={{ backgroundColor: hexToRgba(color, 0.12), color, border: `1px solid ${hexToRgba(color, 0.3)}` }}
                                >
                                  {field}
                                </span>
                              )
                            })()}
                          </div>
                        </td>
                        <td className="py-3 text-zinc-500 whitespace-nowrap">
                          {new Date(a.passDate).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="py-3 text-right text-zinc-500">
                          {days !== null && days >= 0 ? `${days}일` : '-'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100">
              <p className="text-xs text-zinc-400">
                총 {filtered.length}명 중 {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)}명
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="h-8 px-3 rounded-md border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  이전
                </button>
                <span className="px-3 text-sm text-zinc-500">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="h-8 px-3 rounded-md border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
