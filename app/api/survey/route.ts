import { NextResponse } from 'next/server'
import { getAuthToken, fetchFormResponses, FORM_IDS } from '@/lib/greeting-survey-api'
import type { SurveyStats, AllSurveyData } from '@/lib/types'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

function isMockMode() {
  const email = process.env.GREETING_EMAIL
  const passwordHash = process.env.GREETING_PASSWORD_HASH
  return !email || !passwordHash || email === '여기에_이메일_입력'
}

// Question ID mappings
const Q_IDS = {
  interview1: {
    guidance: 12642,
    experience: 12634,
    difficulty: 12635,
    nps: 12638,
    culture: 12750,
    comment: 12645,
  },
  interview2: {
    guidance: 12648,
    experience: 12649,
    convenience: 12664,
    difficulty: 12650,
    nps: 12653,
    comment: 12665,
  },
  coffeechat: {
    guidance: 17145,
    experience: 17139,
    helpfulness: 17140,
    nps: 17144,
    satisfactionFactors: 17141,
    comment: 17143,
  },
}

type RawAnswer = { questionId: number; value: unknown }
type RawResponse = { name: string; jobTitle: string; submitDate: string; answers: RawAnswer[] }

function getNumericAnswer(answers: RawAnswer[], questionId: number): number | null {
  const a = answers.find((x) => x.questionId === questionId)
  if (!a) return null
  const v = a.value
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }
  return null
}

function getStringAnswer(answers: RawAnswer[], questionId: number): string {
  const a = answers.find((x) => x.questionId === questionId)
  if (!a || a.value == null) return ''
  return String(a.value).trim()
}

function getArrayAnswer(answers: RawAnswer[], questionId: number): string[] {
  const a = answers.find((x) => x.questionId === questionId)
  if (!a || !a.value) return []
  if (Array.isArray(a.value)) return (a.value as unknown[]).map(String).filter(Boolean)
  if (typeof a.value === 'string') return a.value.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null)
  if (valid.length === 0) return null
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
}

function scoreDistribution(nums: (number | null)[], min: number, max: number): number[] {
  const dist = Array(max - min + 1).fill(0)
  nums.forEach((n) => {
    if (n !== null && n >= min && n <= max) dist[n - min]++
  })
  return dist
}

function npsDistribution(nums: (number | null)[]): number[] {
  const dist = Array(11).fill(0)
  nums.forEach((n) => {
    if (n !== null && n >= 0 && n <= 10) dist[n]++
  })
  return dist
}

function monthlyCount(dates: string[]): { month: string; count: number }[] {
  const map: Record<string, number> = {}
  dates.forEach((d) => {
    const m = d.slice(0, 7) // YYYY-MM
    map[m] = (map[m] ?? 0) + 1
  })
  const sorted = Object.keys(map).sort()
  return sorted.map((m) => ({ month: m, count: map[m] }))
}

function counterArray(items: string[][]): { label: string; count: number }[] {
  const map: Record<string, number> = {}
  items.forEach((arr) => arr.forEach((s) => { map[s] = (map[s] ?? 0) + 1 }))
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

function computeStats(
  responses: RawResponse[],
  qIds: {
    guidance?: number
    experience?: number
    difficulty?: number
    convenience?: number
    nps?: number
    culture?: number
    satisfactionFactors?: number
    comment?: number
  }
): SurveyStats {
  const guidances = responses.map((r) => (qIds.guidance ? getNumericAnswer(r.answers, qIds.guidance) : null))
  const experiences = responses.map((r) => (qIds.experience ? getNumericAnswer(r.answers, qIds.experience) : null))
  const difficulties = responses.map((r) => (qIds.difficulty ? getNumericAnswer(r.answers, qIds.difficulty) : null))
  const conveniences = responses.map((r) => (qIds.convenience ? getNumericAnswer(r.answers, qIds.convenience) : null))
  // 2025-09-25 이전 응답은 5점 만점 척도 → 10점으로 변환 (×2)
  const NPS_SCALE_CUTOFF = '2025-09-25'
  const npsList = responses.map((r) => {
    if (!qIds.nps) return null
    let n = getNumericAnswer(r.answers, qIds.nps)
    if (n !== null && r.submitDate < NPS_SCALE_CUTOFF && n >= 1 && n <= 5) n = n * 2
    return n
  })

  const validNps = npsList.filter((n): n is number => n !== null)
  const promoters = validNps.filter((n) => n >= 9).length
  const passives = validNps.filter((n) => n >= 7 && n <= 8).length
  const detractors = validNps.filter((n) => n <= 6).length
  const npsScore = validNps.length > 0
    ? Math.round(((promoters - detractors) / validNps.length) * 100)
    : 0

  const cultureArrays = qIds.culture
    ? responses.map((r) => getArrayAnswer(r.answers, qIds.culture!))
    : []
  const satisfactionArrays = qIds.satisfactionFactors
    ? responses.map((r) => getArrayAnswer(r.answers, qIds.satisfactionFactors!))
    : []

  const comments = responses
    .map((r) => ({
      name: r.name,
      job: r.jobTitle,
      comment: qIds.comment ? getStringAnswer(r.answers, qIds.comment) : '',
      nps: (() => {
        if (!qIds.nps) return null
        let n = getNumericAnswer(r.answers, qIds.nps)
        if (n !== null && r.submitDate < NPS_SCALE_CUTOFF && n >= 1 && n <= 5) n = n * 2
        return n
      })(),
      submitDate: r.submitDate,
    }))
    .filter((c) => c.comment.length > 0)
    .sort((a, b) => new Date(b.submitDate).getTime() - new Date(a.submitDate).getTime())

  const avgNps = validNps.length > 0
    ? Math.round((validNps.reduce((a, b) => a + b, 0) / validNps.length) * 10) / 10
    : null

  return {
    totalCount: responses.length,
    avgGuidance: avg(guidances),
    avgExperience: avg(experiences),
    avgDifficulty: avg(difficulties),
    avgConvenience: avg(conveniences),
    nps: npsScore,
    avgNps,
    promoters,
    passives,
    detractors,
    npsDistribution: npsDistribution(npsList),
    guidanceDistribution: scoreDistribution(guidances, 1, 5),
    experienceDistribution: scoreDistribution(experiences, 1, 5),
    difficultyDistribution: scoreDistribution(difficulties, 1, 5),
    cultureTags: counterArray(cultureArrays),
    satisfactionFactors: counterArray(satisfactionArrays),
    monthly: monthlyCount(responses.map((r) => r.submitDate)),
    comments,
  }
}

function getMockData(): AllSurveyData {
  const mockResponses1: RawResponse[] = [
    { name: '김민수', jobTitle: '개발자', submitDate: '2025-01-15', answers: [
      { questionId: 12642, value: 4 }, { questionId: 12634, value: 5 }, { questionId: 12635, value: 3 },
      { questionId: 12638, value: 9 }, { questionId: 12750, value: ['체계적', '친절함'] }, { questionId: 12645, value: '전반적으로 만족스러운 면접이었습니다.' },
    ]},
    { name: '이서연', jobTitle: 'PM', submitDate: '2025-02-10', answers: [
      { questionId: 12642, value: 5 }, { questionId: 12634, value: 4 }, { questionId: 12635, value: 2 },
      { questionId: 12638, value: 10 }, { questionId: 12750, value: ['편안함', '전문적'] }, { questionId: 12645, value: '안내가 충분하고 면접관이 친절했어요.' },
    ]},
    { name: '박지훈', jobTitle: '디자이너', submitDate: '2025-02-20', answers: [
      { questionId: 12642, value: 3 }, { questionId: 12634, value: 4 }, { questionId: 12635, value: 4 },
      { questionId: 12638, value: 7 }, { questionId: 12750, value: ['체계적'] }, { questionId: 12645, value: '' },
    ]},
    { name: '최영희', jobTitle: '마케터', submitDate: '2025-03-05', answers: [
      { questionId: 12642, value: 4 }, { questionId: 12634, value: 3 }, { questionId: 12635, value: 3 },
      { questionId: 12638, value: 8 }, { questionId: 12750, value: ['친절함', '편안함'] }, { questionId: 12645, value: '좀 더 상세한 안내가 있으면 좋겠어요.' },
    ]},
    { name: '정하늘', jobTitle: '개발자', submitDate: '2025-03-15', answers: [
      { questionId: 12642, value: 5 }, { questionId: 12634, value: 5 }, { questionId: 12635, value: 2 },
      { questionId: 12638, value: 10 }, { questionId: 12750, value: ['전문적', '체계적', '친절함'] }, { questionId: 12645, value: '역대 가장 좋은 면접 경험이었습니다!' },
    ]},
  ]

  const mockResponses2: RawResponse[] = [
    { name: '김민수', jobTitle: '개발자', submitDate: '2025-01-20', answers: [
      { questionId: 12648, value: 4 }, { questionId: 12649, value: 4 }, { questionId: 12664, value: 4 },
      { questionId: 12650, value: 3 }, { questionId: 12653, value: 8 }, { questionId: 12665, value: '2차도 좋은 경험이었습니다.' },
    ]},
    { name: '이서연', jobTitle: 'PM', submitDate: '2025-02-15', answers: [
      { questionId: 12648, value: 5 }, { questionId: 12649, value: 5 }, { questionId: 12664, value: 5 },
      { questionId: 12650, value: 2 }, { questionId: 12653, value: 9 }, { questionId: 12665, value: '온라인 면접이 편리했어요.' },
    ]},
    { name: '박지훈', jobTitle: '디자이너', submitDate: '2025-02-25', answers: [
      { questionId: 12648, value: 3 }, { questionId: 12649, value: 4 }, { questionId: 12664, value: 3 },
      { questionId: 12650, value: 4 }, { questionId: 12653, value: 6 }, { questionId: 12665, value: '일정 조율이 어려웠습니다.' },
    ]},
  ]

  const mockResponsesCoffee: RawResponse[] = [
    { name: '정하늘', jobTitle: '개발자', submitDate: '2025-03-10', answers: [
      { questionId: 17145, value: 5 }, { questionId: 17139, value: 5 }, { questionId: 17140, value: 5 },
      { questionId: 17144, value: 10 }, { questionId: 17141, value: ['문화 이해', '팀 분위기'] }, { questionId: 17143, value: '회사 분위기를 잘 파악할 수 있었어요.' },
    ]},
    { name: '최영희', jobTitle: '마케터', submitDate: '2025-03-12', answers: [
      { questionId: 17145, value: 4 }, { questionId: 17139, value: 4 }, { questionId: 17140, value: 4 },
      { questionId: 17144, value: 9 }, { questionId: 17141, value: ['업무 이해', '팀원 소통'] }, { questionId: 17143, value: '실무자와 직접 대화할 수 있어서 좋았습니다.' },
    ]},
  ]

  return {
    interview1: computeStats(mockResponses1, Q_IDS.interview1),
    interview2: computeStats(mockResponses2, Q_IDS.interview2),
    coffeechat: computeStats(mockResponsesCoffee, Q_IDS.coffeechat),
  }
}

type RawApiAnswer = { question: { id: number }; answers: { content: unknown }[] }

function normalizeResponses(items: { name: string; jobTitle: string; submitDate: string; answers: RawApiAnswer[] }[]): RawResponse[] {
  return items.map((item) => ({
    name: item.name,
    jobTitle: item.jobTitle,
    submitDate: item.submitDate,
    answers: item.answers.map((a) => {
      const contents = (a.answers || []).map((x) => x.content).filter(Boolean)
      const value = contents.length === 1 ? contents[0] : contents.length > 1 ? contents : null
      return { questionId: a.question?.id, value }
    }),
  }))
}

function buildResult(r1: RawResponse[], r2: RawResponse[], rc: RawResponse[]): AllSurveyData {
  return {
    interview1: computeStats(r1, Q_IDS.interview1),
    interview2: computeStats(r2, Q_IDS.interview2),
    coffeechat: computeStats(rc, Q_IDS.coffeechat),
  }
}

export async function GET() {
  const dataFile = path.join(process.cwd(), 'data', 'survey-raw.json')

  // 라이브 API 시도
  try {
    const token = await getAuthToken()
    const [r1, r2, rc] = await Promise.all([
      fetchFormResponses(token, FORM_IDS.interview1),
      fetchFormResponses(token, FORM_IDS.interview2),
      fetchFormResponses(token, FORM_IDS.coffeechat),
    ])
    // 라이브 API가 빈 데이터를 반환하면 파일로 폴백
    if (r1.length === 0 && r2.length === 0 && rc.length === 0) throw new Error('empty')
    return NextResponse.json(buildResult(normalizeResponses(r1), normalizeResponses(r2), normalizeResponses(rc)))
  } catch {
    // 저장된 파일로 폴백
    if (fs.existsSync(dataFile)) {
      const raw = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
      return NextResponse.json(buildResult(
        normalizeResponses(raw.interview1 || []),
        normalizeResponses(raw.interview2 || []),
        normalizeResponses(raw.coffeechat || []),
      ))
    }
    return NextResponse.json(getMockData())
  }
}
