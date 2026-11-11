// Chart colors: USF Dons Green ramp for series, Dons Gold for the highlight.
export const COLORS = {
  green: '#00543C',
  gold: '#FDBB30',
  ink: '#151917',
  axis: '#5D6460',
  grid: '#E6E9E7',
}
// Station series: dark → light greens, grey for "other stations"
const STATION_RAMP = ['#00543C', '#2F7A5D', '#5E9C7E', '#93C0A8', '#C6DED1']
const OTHER_COLOR = '#BFC6C2'
export const stationColor = (name: string, i: number) => (name === 'other stations' ? OTHER_COLOR : STATION_RAMP[i % STATION_RAMP.length])
