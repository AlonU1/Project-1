// מחולל תוכנית קומה סכמטית לנתוני הדמו — SVG וקטורי, 1600×1100.

const room = (x: number, y: number, w: number, h: number, label: string, fs = 26) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#94a3b8" stroke-width="2"/>
  <text x="${x + w / 2}" y="${y + h / 2 + 9}" font-size="${fs}" fill="#64748b" text-anchor="middle" direction="rtl">${label}</text>`

function apartment(ox: number, oy: number, num: number, mirrorX: boolean): string {
  // דירה 460×420: סלון, מטבח, ממ"ד, חדר רחצה
  const W = 560, H = 430
  const inner = mirrorX
    ? room(ox, oy, 240, 250, 'סלון', 30) +
      room(ox + 240, oy, 160, 250, 'מטבח') +
      room(ox + 400, oy, 160, 250, 'ממ&quot;ד') +
      room(ox, oy + 250, 200, 180, 'חדר רחצה') +
      room(ox + 200, oy + 250, 360, 180, 'חדר שינה')
    : room(ox + 320, oy, 240, 250, 'סלון', 30) +
      room(ox + 160, oy, 160, 250, 'מטבח') +
      room(ox, oy, 160, 250, 'ממ&quot;ד') +
      room(ox + 360, oy + 250, 200, 180, 'חדר רחצה') +
      room(ox, oy + 250, 360, 180, 'חדר שינה')
  return `
  <g>
    <rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="#ffffff" stroke="#334155" stroke-width="5"/>
    ${inner}
    <text x="${ox + W / 2}" y="${oy + (oy < 300 ? -14 : H + 40)}" font-size="34" font-weight="bold" fill="#1e3a5f" text-anchor="middle" direction="rtl">דירה ${num}</text>
  </g>`
}

export function typicalFloorSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1100" font-family="Heebo, Arial, sans-serif">
  <rect width="1600" height="1100" fill="#f6f5f0"/>
  <rect x="60" y="70" width="1480" height="960" fill="#fdfdfb" stroke="#1e293b" stroke-width="10"/>

  ${apartment(120, 130, 1, false)}
  ${apartment(920, 130, 2, true)}
  ${apartment(120, 540, 3, false)}
  ${apartment(920, 540, 4, true)}

  <g>
    <rect x="700" y="430" width="200" height="240" fill="#e2e8f0" stroke="#334155" stroke-width="5"/>
    <text x="800" y="530" font-size="26" fill="#475569" text-anchor="middle" direction="rtl">מדרגות</text>
    <text x="800" y="600" font-size="26" fill="#475569" text-anchor="middle" direction="rtl">מעלית</text>
  </g>
  <text x="800" y="120" font-size="24" fill="#94a3b8" text-anchor="middle" direction="rtl">לובי קומתי</text>

  <g direction="rtl">
    <text x="1500" y="1075" font-size="24" fill="#94a3b8" text-anchor="end">A-101 · קומה טיפוסית · BuildFlow (דמו)</text>
  </g>
</svg>`
  return svg
}

export function photoPlaceholderSvg(label: string, hue: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" font-family="Heebo, Arial, sans-serif">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},25%,78%)"/><stop offset="1" stop-color="hsl(${hue},20%,55%)"/>
  </linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-width="10" opacity="0.85">
    <rect x="330" y="250" width="140" height="100" rx="14"/>
    <circle cx="400" cy="300" r="30"/>
    <rect x="360" y="232" width="40" height="18" rx="6" fill="#ffffff" stroke="none"/>
  </g>
  <text x="400" y="430" font-size="34" fill="#ffffff" text-anchor="middle" direction="rtl">${label}</text>
  <text x="400" y="478" font-size="24" fill="#ffffff" opacity="0.8" text-anchor="middle" direction="rtl">תמונת הדגמה</text>
</svg>`
}

export const svgBlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml' })
