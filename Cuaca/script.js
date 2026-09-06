'use strict';

/* =============================================
   Weather Dashboard — script.js
   API: Open-Meteo (no API key needed)
         + Open-Meteo Geocoding (no API key needed)
   Features:
   - Auto geolocation on load
   - Search by city name
   - Current weather + stats
   - 24-hour horizontal forecast
   - 7-day forecast with expandable details
   - °C / °F toggle
   - Dark / Light theme toggle
   - Auto-refresh every 1 hour
============================================= */

const WEATHER_BASE  = 'https://api.open-meteo.com/v1/forecast';
const GEO_BASE      = 'https://geocoding-api.open-meteo.com/v1/search';

/* ── WMO Weather Code → description + icon mapping ── */
// Open-Meteo pakai WMO code, bukan icon URL langsung
const WMO = {
  0:  { desc: 'Clear sky',            icon: '01d' },
  1:  { desc: 'Mainly clear',         icon: '01d' },
  2:  { desc: 'Partly cloudy',        icon: '02d' },
  3:  { desc: 'Overcast',             icon: '04d' },
  45: { desc: 'Foggy',                icon: '50d' },
  48: { desc: 'Icy fog',              icon: '50d' },
  51: { desc: 'Light drizzle',        icon: '09d' },
  53: { desc: 'Drizzle',              icon: '09d' },
  55: { desc: 'Heavy drizzle',        icon: '09d' },
  61: { desc: 'Slight rain',          icon: '10d' },
  63: { desc: 'Moderate rain',        icon: '10d' },
  65: { desc: 'Heavy rain',           icon: '10d' },
  71: { desc: 'Slight snow',          icon: '13d' },
  73: { desc: 'Moderate snow',        icon: '13d' },
  75: { desc: 'Heavy snow',           icon: '13d' },
  77: { desc: 'Snow grains',          icon: '13d' },
  80: { desc: 'Slight showers',       icon: '09d' },
  81: { desc: 'Moderate showers',     icon: '09d' },
  82: { desc: 'Violent showers',      icon: '09d' },
  85: { desc: 'Snow showers',         icon: '13d' },
  86: { desc: 'Heavy snow showers',   icon: '13d' },
  95: { desc: 'Thunderstorm',         icon: '11d' },
  96: { desc: 'Thunderstorm w/ hail', icon: '11d' },
  99: { desc: 'Thunderstorm w/ hail', icon: '11d' },
};

function getWmo(code) {
  return WMO[code] || { desc: 'Unknown', icon: '01d' };
}

function iconUrl(code) {
  return `https://openweathermap.org/img/wn/${code}@2x.png`;
}

/* ── DOM refs ─────────────────────────────── */
const loadingEl       = document.getElementById('loading');
const errorEl         = document.getElementById('error-msg');
const contentEl       = document.getElementById('weather-content');

const cityNameEl      = document.getElementById('city-name');
const countryEl       = document.getElementById('country-name');
const currentDateEl   = document.getElementById('current-date');
const weatherIconEl   = document.getElementById('weather-icon');
const weatherDescEl   = document.getElementById('weather-desc');
const temperatureEl   = document.getElementById('temperature');
const feelsLikeEl     = document.getElementById('feels-like');

const humidityEl      = document.getElementById('humidity');
const windEl          = document.getElementById('wind');
const cloudsEl        = document.getElementById('clouds');
const pressureEl      = document.getElementById('pressure');
const visibilityEl    = document.getElementById('visibility');

const hourlyContainer = document.getElementById('hourly-container');
const dailyContainer  = document.getElementById('daily-container');
const lastUpdatedEl   = document.getElementById('last-updated');

const searchInput     = document.getElementById('search-input');
const searchBtn       = document.getElementById('search-btn');
const locationBtn     = document.getElementById('location-btn');
const scrollLeftBtn   = document.getElementById('scroll-left');
const scrollRightBtn  = document.getElementById('scroll-right');
const hourlyScroll    = document.getElementById('hourly-scroll');
const unitCBtn        = document.getElementById('unit-c');
const unitFBtn        = document.getElementById('unit-f');
const hideAllBtn      = document.getElementById('hide-all-btn');
const showAllBtn      = document.getElementById('show-all-btn');
const themeToggleBtn  = document.getElementById('theme-toggle-btn');

/* ── State ────────────────────────────────── */
let currentUnit = 'celsius';  // 'celsius' | 'fahrenheit'
let lastLat     = null;
let lastLon     = null;
let lastCity    = '';
let lastCountry = '';
let refreshTimer = null;
let isDark = true;

/* ── Helpers ──────────────────────────────── */
function unitLabel() { return currentUnit === 'celsius' ? '°C' : '°F'; }
function windLabel() { return 'km/h'; }

function formatTemp(val) {
  return `${Math.round(val)}${unitLabel()}`;
}

function celsiusToFahrenheit(c) {
  return c * 9 / 5 + 32;
}

function convertTemp(val) {
  if (currentUnit === 'fahrenheit') return celsiusToFahrenheit(val);
  return val;
}

function showLoading() {
  loadingEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  contentEl.classList.add('hidden');
}

function showError(msg) {
  loadingEl.classList.add('hidden');
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
}

function showContent() {
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
}

function setLastUpdated() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  lastUpdatedEl.textContent = `Updated ${h}:${m}`;
}

function formatHour(isoString) {
  const date = new Date(isoString);
  const h    = date.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00${ampm}`;
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function formatFullDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDayLabel(isoDate, index) {
  if (index === 0) return 'Today';
  const d = new Date(isoDate + 'T00:00:00');
  return DAYS[d.getDay()];
}

/* ── Fetch Weather (Open-Meteo) ───────────── */
async function fetchWeather(lat, lon, cityName = '', country = '') {
  showLoading();
  lastLat     = lat;
  lastLon     = lon;
  lastCity    = cityName;
  lastCountry = country;

  const tempUnit = 'celsius'; // always fetch in celsius, convert in JS
  const url = `${WEATHER_BASE}?latitude=${lat}&longitude=${lon}`
    + `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weathercode,windspeed_10m,relativehumidity_2m,cloudcover,surface_pressure,visibility`
    + `&daily=weathercode,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,windspeed_10m_max,sunrise,sunset`
    + `&current_weather=true`
    + `&wind_speed_unit=kmh`
    + `&timezone=auto`
    + `&forecast_days=8`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch weather data.');
    const data = await res.json();

    renderCurrent(data, cityName, country);
    renderHourly(data);
    renderDaily(data);
    setLastUpdated();
    showContent();

    // Auto-refresh every 1 hour
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => fetchWeather(lat, lon, cityName, country), 60 * 60 * 1000);

  } catch (err) {
    showError('⚠️ ' + (err.message || 'Could not load weather data.'));
  }
}

/* ── Render: Current Weather ──────────────── */
function renderCurrent(data, cityName, country) {
  const cw      = data.current_weather;
  const hourly  = data.hourly;
  const tz      = data.timezone;

  // Find current hour index in hourly array
  const nowIso  = cw.time;
  const nowIdx  = hourly.time.findIndex(t => t === nowIso) || 0;

  const humidity   = hourly.relativehumidity_2m[nowIdx] ?? '--';
  const cloudcover = hourly.cloudcover[nowIdx] ?? '--';
  const pressure   = hourly.surface_pressure[nowIdx] ?? '--';
  const visRaw     = hourly.visibility[nowIdx];
  const feelsRaw   = hourly.apparent_temperature[nowIdx] ?? cw.temperature;

  const wmo = getWmo(cw.weathercode);

  cityNameEl.textContent    = cityName ? cityName.toUpperCase() : 'YOUR LOCATION';
  countryEl.textContent     = country || '';
  weatherDescEl.textContent = wmo.desc;
  weatherIconEl.src         = iconUrl(wmo.icon);
  weatherIconEl.alt         = wmo.desc;
  temperatureEl.textContent = Math.round(convertTemp(cw.temperature));

  document.querySelectorAll('.deg').forEach(el => el.textContent = unitLabel());

  feelsLikeEl.textContent = `Feels like ${formatTemp(convertTemp(feelsRaw))}`;

  humidityEl.textContent   = `${humidity}%`;
  windEl.textContent       = `${cw.windspeed} ${windLabel()}`;
  cloudsEl.textContent     = `${cloudcover}%`;
  pressureEl.textContent   = pressure !== '--' ? `${Math.round(pressure)} hPa` : '--';
  visibilityEl.textContent = visRaw != null
    ? `${(visRaw / 1000).toFixed(1)} km`
    : 'N/A';

  // Current date
  const today = new Date(nowIso);
  currentDateEl.textContent = `${DAYS[today.getDay()]}, ${today.getDate()} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`;
}

/* ── Render: Hourly (next 24h) ────────────── */
function renderHourly(data) {
  hourlyContainer.innerHTML = '';

  const hourly  = data.hourly;
  const cwTime  = data.current_weather.time;

  // Find index of current hour
  let startIdx = hourly.time.findIndex(t => t === cwTime);
  if (startIdx < 0) startIdx = 0;

  // Take next 8 slots = 24 jam (setiap slot = 1 jam)
  const items = hourly.time.slice(startIdx, startIdx + 8);

  items.forEach((timeStr, i) => {
    const idx     = startIdx + i;
    const temp    = hourly.temperature_2m[idx];
    const code    = hourly.weathercode[idx];
    const rainPct = hourly.precipitation_probability[idx] || 0;
    const wmo     = getWmo(code);

    const div = document.createElement('div');
    div.className = 'hourly-item' + (i === 0 ? ' current-hour' : '');

    const time = document.createElement('span');
    time.className   = 'hourly-time';
    time.textContent = i === 0 ? 'Now' : formatHour(timeStr);

    const icon = document.createElement('img');
    icon.src    = `https://openweathermap.org/img/wn/${wmo.icon.replace('d','d')}.png`;
    icon.alt    = wmo.desc;
    icon.width  = 32;
    icon.height = 32;

    const tempEl = document.createElement('span');
    tempEl.className   = 'hourly-temp';
    tempEl.textContent = formatTemp(convertTemp(temp));

    div.appendChild(time);
    div.appendChild(icon);
    div.appendChild(tempEl);

    if (rainPct > 0) {
      const rain = document.createElement('span');
      rain.className   = 'hourly-rain';
      rain.textContent = `💧${rainPct}%`;
      div.appendChild(rain);
    }

    hourlyContainer.appendChild(div);
  });
}

/* ── Render: Daily (7 days) ───────────────── */
function renderDaily(data) {
  dailyContainer.innerHTML = '';

  const daily = data.daily;
  const days  = daily.time.slice(0, 7);

  days.forEach((dateStr, i) => {
    const code    = daily.weathercode[i];
    const tMax    = daily.temperature_2m_max[i];
    const tMin    = daily.temperature_2m_min[i];
    const feelsMax = daily.apparent_temperature_max[i];
    const rainPct  = daily.precipitation_probability_max[i] || 0;
    const wind     = daily.windspeed_10m_max[i];
    const sunrise  = daily.sunrise[i];
    const sunset   = daily.sunset[i];
    const wmo      = getWmo(code);

    const row = document.createElement('div');
    row.className = 'daily-row';

    // Main row
    const main = document.createElement('div');
    main.className = 'daily-main';
    main.setAttribute('role', 'button');
    main.setAttribute('aria-expanded', 'false');

    const dayLabel = document.createElement('span');
    dayLabel.className   = 'daily-day';
    dayLabel.textContent = formatDayLabel(dateStr, i);

    const iconWrap = document.createElement('div');
    iconWrap.className = 'daily-icon';

    const icon = document.createElement('img');
    icon.src    = `https://openweathermap.org/img/wn/${wmo.icon}.png`;
    icon.alt    = wmo.desc;
    icon.width  = 28;
    icon.height = 28;

    const desc = document.createElement('span');
    desc.className   = 'daily-icon-desc';
    desc.textContent = wmo.desc;

    iconWrap.appendChild(icon);
    iconWrap.appendChild(desc);

    const tempsWrap = document.createElement('div');
    tempsWrap.className = 'daily-temps';

    const tMaxEl = document.createElement('span');
    tMaxEl.className   = 'daily-temp-max';
    tMaxEl.textContent = formatTemp(convertTemp(tMax));

    const tMinEl = document.createElement('span');
    tMinEl.className   = 'daily-temp-min';
    tMinEl.textContent = formatTemp(convertTemp(tMin));

    tempsWrap.appendChild(tMaxEl);
    tempsWrap.appendChild(tMinEl);

    const chevron = document.createElement('span');
    chevron.className   = 'daily-chevron';
    chevron.textContent = '▼';

    main.appendChild(dayLabel);
    main.appendChild(iconWrap);
    main.appendChild(tempsWrap);
    main.appendChild(chevron);

    // Detail panel
    const detail = document.createElement('div');
    detail.className = 'daily-detail';

    // Format sunrise/sunset
    const sunriseTime = sunrise ? new Date(sunrise).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--';
    const sunsetTime  = sunset  ? new Date(sunset).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--';

    const detailItems = [
      { label: 'Feels Like Max', value: formatTemp(convertTemp(feelsMax)) },
      { label: 'Wind Max',       value: `${wind} ${windLabel()}` },
      { label: 'Rain Chance',    value: `${rainPct}%` },
      { label: 'Condition',      value: wmo.desc },
      { label: 'Sunrise',        value: sunriseTime },
      { label: 'Sunset',         value: sunsetTime },
    ];

    detailItems.forEach(({ label, value }) => {
      const item = document.createElement('div');
      item.className = 'detail-item';
      item.innerHTML = `
        <span class="detail-label">${label}</span>
        <span class="detail-value">${value}</span>
      `;
      detail.appendChild(item);
    });

    row.appendChild(main);
    row.appendChild(detail);
    dailyContainer.appendChild(row);

    main.addEventListener('click', () => {
      const isOpen = row.classList.toggle('open');
      main.setAttribute('aria-expanded', String(isOpen));
    });
  });
}

/* ── Geocoding (search kota) ──────────────── */
async function fetchByCity(cityName) {
  showLoading();
  try {
    const res = await fetch(
      `${GEO_BASE}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`
    );
    if (!res.ok) throw new Error('Geocoding request failed.');
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      throw new Error(`City "${cityName}" not found.`);
    }

    const result = data.results[0];
    await fetchWeather(result.latitude, result.longitude, result.name, result.country_code);

  } catch (err) {
    showError('⚠️ ' + err.message);
  }
}

/* ── Theme Toggle ─────────────────────────── */
function applyTheme(dark) {
  isDark = dark;
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggleBtn.textContent = '☀️';
    themeToggleBtn.title = 'Switch to light mode';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    themeToggleBtn.textContent = '🌙';
    themeToggleBtn.title = 'Switch to dark mode';
  }
  localStorage.setItem('weather_theme', dark ? 'dark' : 'light');
}

themeToggleBtn.addEventListener('click', () => applyTheme(!isDark));

/* ── Unit Toggle (°C / °F) ────────────────── */
unitCBtn.addEventListener('click', () => {
  if (currentUnit === 'celsius') return;
  currentUnit = 'celsius';
  unitCBtn.classList.add('active');
  unitFBtn.classList.remove('active');
  if (lastLat !== null) fetchWeather(lastLat, lastLon, lastCity, lastCountry);
});

unitFBtn.addEventListener('click', () => {
  if (currentUnit === 'fahrenheit') return;
  currentUnit = 'fahrenheit';
  unitFBtn.classList.add('active');
  unitCBtn.classList.remove('active');
  if (lastLat !== null) fetchWeather(lastLat, lastLon, lastCity, lastCountry);
});

/* ── Search ───────────────────────────────── */
searchBtn.addEventListener('click', () => {
  const city = searchInput.value.trim();
  if (city) fetchByCity(city);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const city = searchInput.value.trim();
    if (city) fetchByCity(city);
  }
});

/* ── Location button ──────────────────────── */
locationBtn.addEventListener('click', getLocation);

/* ── Scroll buttons ───────────────────────── */
scrollLeftBtn.addEventListener('click', () => {
  hourlyScroll.scrollBy({ left: -200, behavior: 'smooth' });
});
scrollRightBtn.addEventListener('click', () => {
  hourlyScroll.scrollBy({ left: 200, behavior: 'smooth' });
});

/* ── Show / Hide all daily details ───────── */
hideAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.daily-row').forEach(row => {
    row.classList.add('open');
    row.querySelector('.daily-main')?.setAttribute('aria-expanded', 'true');
  });
});

showAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.daily-row').forEach(row => {
    row.classList.remove('open');
    row.querySelector('.daily-main')?.setAttribute('aria-expanded', 'false');
  });
});

/* ── Geolocation ──────────────────────────── */
function getLocation() {
  if (!navigator.geolocation) {
    showError('⚠️ Geolocation not supported. Search for a city manually.');
    return;
  }
  showLoading();
  navigator.geolocation.getCurrentPosition(
    (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
    (err) => {
      const msgs = {
        1: 'Location permission denied. Search for a city manually.',
        2: 'Location unavailable. Search for a city manually.',
        3: 'Location request timed out. Search for a city manually.',
      };
      showError('⚠️ ' + (msgs[err.code] || 'Could not get location.'));
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}

/* ── Init ─────────────────────────────────── */
window.addEventListener('load', () => {
  const savedTheme = localStorage.getItem('weather_theme') || 'dark';
  applyTheme(savedTheme === 'dark');
  getLocation();
});
