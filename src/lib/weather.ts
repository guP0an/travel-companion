// 真实天气预报：Open-Meteo（免费、免 key）。绝不让模型编天气。
// 流程：城市名 → 经纬度(geocoding) → 按日期区间拉每日预报。
// 预报窗口约未来 16 天；超出窗口的日期拿不到，前端按"超出预报范围"处理。

export interface DayWeather {
  date: string // YYYY-MM-DD
  tMax: number
  tMin: number
  code: number // WMO weather code
  pop: number // 降水概率 %（可能为 0）
  icon: string
  text: string
}

// WMO weather code → emoji + 中文
function describe(code: number): { icon: string; text: string } {
  if (code === 0) return { icon: '☀️', text: '晴' }
  if (code === 1 || code === 2) return { icon: '⛅', text: '多云' }
  if (code === 3) return { icon: '☁️', text: '阴' }
  if (code === 45 || code === 48) return { icon: '🌫️', text: '雾' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', text: '毛毛雨' }
  if (code >= 61 && code <= 67) return { icon: '🌧️', text: '有雨' }
  if (code >= 71 && code <= 77) return { icon: '🌨️', text: '有雪' }
  if (code >= 80 && code <= 82) return { icon: '🌦️', text: '阵雨' }
  if (code === 85 || code === 86) return { icon: '🌨️', text: '阵雪' }
  if (code >= 95) return { icon: '⛈️', text: '雷雨' }
  return { icon: '🌡️', text: '' }
}

async function geocode(city: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`
  const r = await fetch(url)
  if (!r.ok) return null
  const d = (await r.json()) as any
  const hit = d.results?.[0]
  return hit ? { lat: hit.latitude, lon: hit.longitude } : null
}

// 给目的地 + 一组日期，返回 date → DayWeather（拿不到的日期不在 map 里）。
export async function fetchWeather(city: string, dates: string[]): Promise<Record<string, DayWeather>> {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  if (!city || valid.length === 0) return {}
  const geo = await geocode(city)
  if (!geo) return {}
  const start = valid[0]
  const end = valid[valid.length - 1]
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&start_date=${start}&end_date=${end}`
  const r = await fetch(url)
  if (!r.ok) return {}
  const d = (await r.json()) as any
  const days: string[] = d.daily?.time || []
  const out: Record<string, DayWeather> = {}
  days.forEach((date: string, i: number) => {
    const code = d.daily.weather_code?.[i] ?? 0
    const tMax = Math.round(d.daily.temperature_2m_max?.[i])
    const tMin = Math.round(d.daily.temperature_2m_min?.[i])
    if (Number.isNaN(tMax) || Number.isNaN(tMin)) return
    const { icon, text } = describe(code)
    out[date] = { date, tMax, tMin, code, pop: d.daily.precipitation_probability_max?.[i] ?? 0, icon, text }
  })
  return out
}
