export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'wind' | 'thunder'
export type WeatherIntensity = 'light' | 'medium' | 'heavy'

export interface WeatherVisual {
  kind: WeatherKind
  intensity: WeatherIntensity
  label: string
}

const isoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function forecastableDates(dates: string[], today: string): string[] {
  if (!isoDate(today)) return []
  const last = addDays(today, 15)
  return [...new Set(dates)].filter((date) => isoDate(date) && date >= today && date <= last).sort()
}

export function weatherVisual(code: number, windMax = 0): WeatherVisual {
  if ([95, 96, 99].includes(code)) return { kind: 'thunder', intensity: 'heavy', label: code === 95 ? '雷雨' : '雷雨伴冰雹' }
  if (code >= 51 && code <= 57) {
    const intensity = code <= 51 ? 'light' : code <= 53 ? 'medium' : 'heavy'
    return { kind: 'rain', intensity, label: intensity === 'light' ? '小雨' : intensity === 'medium' ? '中雨' : '大雨' }
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) {
    const intensity = code === 61 || code === 80 ? 'light' : code === 63 || code === 81 ? 'medium' : 'heavy'
    return { kind: 'rain', intensity, label: intensity === 'light' ? '小雨' : intensity === 'medium' ? '中雨' : '大雨' }
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    const intensity = code === 71 || code === 85 ? 'light' : code === 73 ? 'medium' : 'heavy'
    return { kind: 'snow', intensity, label: intensity === 'light' ? '小雪' : intensity === 'medium' ? '中雪' : '大雪' }
  }
  if (windMax >= 38) return { kind: 'wind', intensity: 'heavy', label: '大风' }
  if (code === 0) return { kind: 'sunny', intensity: 'light', label: '晴' }
  return { kind: 'cloudy', intensity: code <= 2 ? 'medium' : 'heavy', label: code <= 2 ? '多云' : code === 45 || code === 48 ? '雾' : '阴' }
}

// Prefer the day's explicit arrival over the overall multi-city destination.
export function itineraryWeatherCity(destination: string, day: { theme: string; segments: { items: { name: string; area?: string }[] }[] }): string {
  const candidates = destination.split(/[（()）+＋、,，/·\s]+/).map(s => s.trim()).filter(Boolean)
  const arrival = day.theme.match(/(?:抵达|到达|前往|入住)\s*([\u4e00-\u9fff]{2,8}?)(?=[，,、·\s（(]|$)/)?.[1]
  if (arrival) return arrival.replace(/市$/, '')
  const content = [day.theme, ...day.segments.flatMap(s => s.items.flatMap(i => [i.name, i.area || '']))].join(' ')
  const matched = candidates.filter(c => content.includes(c)).sort((a,b) => content.indexOf(a) - content.indexOf(b))
  if (matched.length) return matched[0]
  return candidates.length === 1 ? candidates[0] : ''
}
