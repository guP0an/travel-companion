import type { DayWeather } from '../lib/weather'
import { weatherVisual } from '../../shared/weather'

const rain = Array.from({ length: 60 }, (_, index) => ({
  left: (index * 37 + 7) % 101,
  delay: -((index * 17) % 90) / 100,
  duration: 0.48 + ((index * 13) % 42) / 100,
  height: 7 + ((index * 11) % 13),
  opacity: 0.18 + ((index * 19) % 48) / 100,
}))

const snow = Array.from({ length: 64 }, (_, index) => ({
  left: (index * 43 + 5) % 101,
  delay: -((index * 59) % 1100) / 100,
  duration: 7 + ((index * 31) % 500) / 100,
  size: index % 3 === 0 ? 4 : 11 + ((index * 7) % 6),
  drift: ((index * 17) % 65) - 32,
}))

export default function WeatherScene({ weather }: { weather: DayWeather }) {
  const visual = weatherVisual(weather.code, weather.windMax)
  const count = visual.intensity === 'light' ? 28 : visual.intensity === 'medium' ? 44 : 60
  const snowCount = visual.intensity === 'light' ? 22 : visual.intensity === 'medium' ? 42 : 64

  return (
    <div className="weather-scene" data-kind={visual.kind} data-intensity={visual.intensity} aria-hidden>
      {visual.kind === 'sunny' && <div className="weather-sun"><i /></div>}
      {(visual.kind === 'cloudy' || visual.kind === 'rain' || visual.kind === 'thunder') && (
        <div className="weather-clouds">
          <i /><i /><i /><i />
        </div>
      )}
      {(visual.kind === 'rain' || visual.kind === 'thunder') && (
        <div className="weather-rain">
          {rain.slice(0, count).map((drop, index) => (
            <i key={index} style={{
              left: `${drop.left}%`,
              height: `${drop.height}px`,
              opacity: drop.opacity,
              animationDelay: `${drop.delay}s`,
              animationDuration: `${drop.duration}s`,
            }} />
          ))}
        </div>
      )}
      {visual.kind === 'snow' && (
        <div className="weather-snow">
          {snow.slice(0, snowCount).map((flake, index) => (
            <i key={index} style={{
              left: `${flake.left}%`,
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              animationDelay: `${flake.delay}s`,
              animationDuration: `${flake.duration}s`,
              ['--snow-drift' as string]: `${flake.drift}px`,
            }} />
          ))}
        </div>
      )}
      {visual.kind === 'thunder' && <div className="weather-thunder-glow" />}
      {visual.kind === 'wind' && <svg className="weather-water" viewBox="0 0 400 80" preserveAspectRatio="none">
        <g><path d="M-80 18 Q-30 7 20 18 T120 18 T220 18 T320 18 T420 18 T520 18" /><path d="M-80 38 Q-30 27 20 38 T120 38 T220 38 T320 38 T420 38 T520 38" /><path d="M-80 60 Q-30 49 20 60 T120 60 T220 60 T320 60 T420 60 T520 60" /></g>
      </svg>}
      {visual.kind === 'wind' && (
        <div className="weather-leaves">
          {Array.from({ length: 9 }, (_, index) => (
            <svg key={index} viewBox="0 0 28 18" style={{
              top: `${8 + (index * 23) % 65}%`,
              width: `${14 + (index * 7) % 10}px`,
              animationDelay: `${-index * 1.7}s`,
              animationDuration: `${7 + index % 4}s`,
            }}>
              <path d="M2 15C1 4 13 0 25 3C24 15 13 20 2 15Z" />
              <path d="M0 17Q12 9 23 4" />
            </svg>
          ))}
        </div>
      )}
    </div>
  )
}
