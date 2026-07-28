import type { DayWeather } from '../lib/weather'
import { weatherVisual } from '../../shared/weather'

const rain = Array.from({ length: 60 }, (_, index) => ({
  left: (index * 37 + 7) % 101,
  delay: -((index * 17) % 90) / 100,
  duration: 0.48 + ((index * 13) % 42) / 100,
  height: 7 + ((index * 11) % 13),
  opacity: 0.18 + ((index * 19) % 48) / 100,
}))

const snow = Array.from({ length: 34 }, (_, index) => ({
  left: (index * 43 + 5) % 101,
  delay: -((index * 29) % 480) / 100,
  duration: 2.7 + ((index * 31) % 240) / 100,
  size: 2 + ((index * 7) % 3),
  drift: ((index * 17) % 21) - 10,
}))

export default function WeatherScene({ weather }: { weather: DayWeather }) {
  const visual = weatherVisual(weather.code, weather.windMax)
  const count = visual.intensity === 'light' ? 28 : visual.intensity === 'medium' ? 44 : 60
  const snowCount = visual.intensity === 'light' ? 16 : visual.intensity === 'medium' ? 25 : 34

  return (
    <div className="weather-scene" data-kind={visual.kind} data-intensity={visual.intensity} aria-hidden>
      {visual.kind === 'sunny' && <div className="weather-sun"><i /></div>}
      {(visual.kind === 'cloudy' || visual.kind === 'rain') && (
        <div className="weather-clouds">
          <i /><i /><i /><i />
        </div>
      )}
      {visual.kind === 'rain' && (
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
      {visual.kind === 'wind' && (
        <svg className="weather-wind" viewBox="0 0 640 80" preserveAspectRatio="none">
          <path d="M-20 25 C90 0 170 48 290 20 S500 3 680 23" />
          <path d="M45 53 C145 29 235 73 350 49 S530 35 660 54" />
          <path d="M230 65 C315 47 390 74 500 61" />
          <circle cx="176" cy="31" r="2.2" />
          <circle cx="520" cy="47" r="2.6" />
        </svg>
      )}
    </div>
  )
}
