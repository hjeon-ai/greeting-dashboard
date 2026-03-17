'use client'

import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts'
import type { AllSurveyData, SurveyStats } from '@/lib/types'

interface Props {
  data: AllSurveyData
}

const SUB_TABS = [
  { key: 'interview1' as const, label: '1차 면접' },
  { key: 'interview2' as const, label: '2차 면접' },
  { key: 'coffeechat' as const, label: '커피챗' },
]

type SubTabKey = 'interview1' | 'interview2' | 'coffeechat'

// 차트 공통 색상 팔레트 (파이차트와 동일)
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#FFD900', '#06b6d4']

// 분위기 태그 그라데이션: #FFF1A3(진함) → #FFFDE8(연함), n개 생성
function keyColorGradient(n: number): string[] {
  const s = { r: 0xFF, g: 0xF1, b: 0xA3 }
  const e = { r: 0xFF, g: 0xFD, b: 0xE8 }
  return Array.from({ length: n }, (_, i) => {
    const t = n <= 1 ? 0 : i / (n - 1)
    const r = Math.round(s.r + t * (e.r - s.r))
    const g = Math.round(s.g + t * (e.g - s.g))
    const b = Math.round(s.b + t * (e.b - s.b))
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
  })
}

const tooltipStyle = {
  borderRadius: '8px',
  border: '1px solid #e4e4e7',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
  fontSize: '12px',
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  )
}

function ScoreBarChart({ data, title }: { data: number[]; title: string }) {
  const chartData = data.map((count, i) => ({ label: `${i + 1}점`, count }))
  // 높은 count 순으로 색상 순위 부여 (파랑→초록→주황...)
  const rankMap = new Map(
    [...chartData].sort((a, b) => b.count - a.count).map((item, rank) => [item.label, rank])
  )
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="p-5 pb-2">
        <h4 className="text-sm font-semibold text-zinc-800">{title}</h4>
      </div>
      <div className="p-5 pt-1">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={{ stroke: '#e4e4e7' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#71717a' }} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="응답 수" radius={[3, 3, 0, 0]}>
              {chartData.map((item) => (
                <Cell key={item.label} fill={CHART_COLORS[(rankMap.get(item.label) ?? 0) % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function NpsPieChart({ stats }: { stats: SurveyStats }) {
  const pieData = [
    { name: '추천', value: stats.promoters },
    { name: '중립', value: stats.passives },
    { name: '비추천', value: stats.detractors },
  ].filter((d) => d.value > 0)

  const COLORS: Record<string, string> = {
    추천: '#3b82f6',
    중립: '#f59e0b',
    비추천: '#ef4444',
  }

  if (pieData.length === 0) return null

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="p-5 pb-2">
        <h4 className="text-sm font-semibold text-zinc-800">추천 점수 분포</h4>
        <p className="text-xs text-zinc-400 mt-0.5">
          5점 척도: 1-2점 비추천 · 3점 중립 · 4-5점 추천&nbsp;&nbsp;|&nbsp;&nbsp;10점 척도: 0-6점 비추천 · 7-8점 중립 · 9-10점 추천
        </p>
      </div>
      <div className="p-5 pt-1">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="45%"
              outerRadius={75}
              fontSize={12}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}명`, '']} />
            <Legend
              iconSize={10}
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value, entry: any) => {
                const total = pieData.reduce((s, d) => s + d.value, 0)
                const pct = total > 0 ? Math.round((entry.payload.value / total) * 100) : 0
                return `${value} ${pct}% (${entry.payload.value}명)`
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function HorizontalBarChart({ data, title, useKeyColor = false }: {
  data: { label: string; count: number }[]
  title: string
  useKeyColor?: boolean
}) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.count), 1)
  const sliced = data.slice(0, 10)
  const colors = useKeyColor ? keyColorGradient(sliced.length) : null

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="p-5 pb-2">
        <h4 className="text-sm font-semibold text-zinc-800">{title}</h4>
      </div>
      <div className="px-5 pb-5 space-y-2.5">
        {sliced.map((item, i) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-zinc-600 truncate" title={item.label}>{item.label}</span>
            <div className="flex-1 h-5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(item.count / max) * 100}%`,
                  backgroundColor: colors ? colors[i] : CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
            </div>
            <span className="w-6 shrink-0 text-xs font-medium text-zinc-700 text-right">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommentsList({ comments }: { comments: SurveyStats['comments'] }) {
  if (comments.length === 0) return null

  function npsColor(nps: number | null) {
    if (nps === null) return 'bg-zinc-100 text-zinc-500'
    if (nps >= 9) return 'bg-emerald-50 text-emerald-700'
    if (nps >= 7) return 'bg-amber-50 text-amber-700'
    return 'bg-red-50 text-red-600'
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="p-5 pb-2">
        <h4 className="text-sm font-semibold text-zinc-800">자유 응답</h4>
        <p className="text-xs text-zinc-400 mt-0.5">{comments.length}건의 코멘트</p>
      </div>
      <div className="px-5 pb-5 space-y-3">
        {comments.map((c, i) => (
          <div key={i} className="rounded-md border border-zinc-100 bg-zinc-50 p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-zinc-700">{c.name}</span>
              <span className="text-xs text-zinc-400">{c.job}</span>
              {c.nps !== null && (
                <span className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${npsColor(c.nps)}`}>
                  NPS {c.nps}
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed">{c.comment}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SurveyPanel({ stats, type }: { stats: SurveyStats; type: SubTabKey }) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="총 응답 수" value={`${stats.totalCount}명`} />
        <KpiCard
          label="NPS"
          value={`${stats.nps > 0 ? '+' : ''}${stats.nps}`}
          sub="추천-비추천 (%p)"
        />
        <KpiCard
          label="평균 면접 경험"
          value={stats.avgExperience !== null ? `${stats.avgExperience}점` : '-'}
          sub="1-5점 척도"
        />
        <KpiCard
          label="평균 안내 충분성"
          value={stats.avgGuidance !== null ? `${stats.avgGuidance}점` : '-'}
          sub="1-5점 척도"
        />
        <KpiCard
          label={type === 'interview2' ? '평균 편의성' : '평균 난이도'}
          value={
            type === 'interview2'
              ? stats.avgConvenience !== null ? `${stats.avgConvenience}점` : '-'
              : stats.avgDifficulty !== null ? `${stats.avgDifficulty}점` : '-'
          }
          sub="1-5점 척도"
        />
      </div>

      {/* 추천 점수 분포 + 면접 경험 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NpsPieChart stats={stats} />
        <ScoreBarChart data={stats.experienceDistribution} title="면접 경험 분포" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ScoreBarChart data={stats.guidanceDistribution} title="안내 충분성 분포" />
        {type === 'interview2'
          ? <ScoreBarChart data={stats.difficultyDistribution} title="편의성 분포 (난이도 대체)" />
          : <ScoreBarChart data={stats.difficultyDistribution} title="난이도 분포" />
        }
      </div>

      {/* 태그 차트 (1차, 커피챗만) */}
      {type === 'interview1' && stats.cultureTags.length > 0 && (
        <HorizontalBarChart data={stats.cultureTags} title="분위기 태그" useKeyColor />
      )}
      {type === 'coffeechat' && stats.satisfactionFactors.length > 0 && (
        <HorizontalBarChart data={stats.satisfactionFactors} title="만족 요인" />
      )}

      {/* 코멘트 */}
      <CommentsList comments={stats.comments} />
    </div>
  )
}

export default function SurveyTab({ data }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('interview1')

  const stats = data[activeSubTab]

  return (
    <div className="space-y-5">
      {/* Sub-tab Navigation */}
      <div className="flex gap-1 border-b border-zinc-200">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeSubTab === tab.key
                ? 'border-[#40E2FF] text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SurveyPanel stats={stats} type={activeSubTab} />
    </div>
  )
}
