// 真实天气预报：Open-Meteo（免费、免 key）。绝不让模型编天气。
// 流程：城市名 → 经纬度(geocoding) → 按日期区间拉每日预报。
// 预报窗口约未来 16 天；超出窗口的日期拿不到，前端按"超出预报范围"处理。

import { forecastableDates, weatherVisual } from '../../shared/weather'

export interface DayWeather {
  date: string // YYYY-MM-DD
  tMax: number
  tMin: number
  code: number // WMO weather code
  pop: number // 降水概率 %（可能为 0）
  icon: string
  text: string
  sunrise: string // 当地 HH:MM，可空 ""
  sunset: string // 当地 HH:MM，可空 ""
  clear: boolean // 天空通透（晴/多云，适合看落日/星空）
  windMax: number
  lat?: number
  lon?: number
}

// WMO weather code → emoji + 中文
function describe(code: number): { icon: string; text: string } {
  const visual = weatherVisual(code)
  const icon = visual.kind === 'sunny' ? '☀️' : visual.kind === 'cloudy' ? '☁️' : visual.kind === 'rain' ? '🌧️' : visual.kind === 'snow' ? '🌨️' : '🌬️'
  return { icon, text: visual.label }
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
  const now = new Date()
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
  const valid = forecastableDates(dates, today)
  if (!city || valid.length === 0) return {}
  const geo = await geocode(city)
  if (!geo) return {}
  const start = valid[0]
  const end = valid[valid.length - 1]
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max` +
    `&timezone=auto&start_date=${start}&end_date=${end}`
  const r = await fetch(url)
  if (!r.ok) return {}
  const d = (await r.json()) as any
  const days: string[] = d.daily?.time || []
  const out: Record<string, DayWeather> = {}
  const hhmm = (iso: string) => (iso && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '')
  days.forEach((date: string, i: number) => {
    const code = d.daily.weather_code?.[i] ?? 0
    const tMax = Math.round(d.daily.temperature_2m_max?.[i])
    const tMin = Math.round(d.daily.temperature_2m_min?.[i])
    if (Number.isNaN(tMax) || Number.isNaN(tMin)) return
    const windMax = Math.round(d.daily.wind_speed_10m_max?.[i] ?? 0)
    const visual = weatherVisual(code, windMax)
    const { icon } = describe(code)
    out[date] = {
      date, tMax, tMin, code, pop: d.daily.precipitation_probability_max?.[i] ?? 0, icon, text: visual.label,
      sunrise: hhmm(d.daily.sunrise?.[i] || ''),
      sunset: hhmm(d.daily.sunset?.[i] || ''),
      clear: code <= 2, // 0晴 1,2多云
      windMax,
      lat: geo.lat, lon: geo.lon,
    }
  })
  return out
}
