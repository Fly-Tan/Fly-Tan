// Regenerates the animated contribution heatmap from live GitHub data.
// Used by scripts/generate-contributions.mjs and .github/workflows/update-contributions.yml
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error('GH_TOKEN / GITHUB_TOKEN is required');

const LOGIN = 'Fly-Tan';
const QUERY = `query {
  user(login: "${LOGIN}") {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: QUERY }),
});
const json = await res.json();
if (json.errors) throw new Error('GraphQL error: ' + json.errors.map((e) => e.message).join('; '));
const cal = json.data.user.contributionsCollection.contributionCalendar;
const weeks = cal.weeks;
const total = cal.totalContributions;
const days = weeks.flatMap((w) => w.contributionDays);
const peak = Math.max(...days.map((d) => d.contributionCount), 1);

const W = 1180, H = 330;
const x0 = 68, y0 = 92, pitch = 20, cell = 15;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function hsl(h, s, l) {
  h /= 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
function cellColor(count, wi) {
  if (count === 0) return '#1b2233';
  const hue = 175 + (wi / 52) * 160;
  const light = 0.3 + (Math.min(count / peak, 1) * 0.34);
  return hsl(hue, 0.88, light);
}

// month labels: first week whose first day starts a new month
const labels = [];
let prev = null;
for (let wi = 0; wi < weeks.length; wi++) {
  const dt = new Date(weeks[wi].contributionDays[0].date + 'T00:00:00Z');
  const m = dt.getUTCMonth();
  if (prev === null || m !== prev) {
    labels.push([wi, dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })]);
    prev = m;
  }
}

const cells = [];
for (let wi = 0; wi < weeks.length; wi++) {
  const x = x0 + wi * pitch;
  for (let ri = 0; ri < weeks[wi].contributionDays.length; ri++) {
    const y = y0 + ri * pitch;
    const day = weeks[wi].contributionDays[ri];
    const c = day.contributionCount;
    const col = cellColor(c, wi);
    const stroke = c === 0 ? '' : ` stroke="${col}" stroke-opacity="0.35"`;
    cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${col}"${stroke}><title>${day.date}: ${c} contributions</title></rect>`);
  }
}
const levels = [cellColor(0, 0), cellColor(1, 7), cellColor(4, 18), cellColor(9, 32), cellColor(peak, 52)];
const swatches = levels.map((c, i) => `<rect x="${x0 + i * 22}" y="262" width="15" height="15" rx="3" fill="${c}"/>`).join('');
const mlabels = labels.map(([wi, m]) => `<text x="${x0 + wi * pitch}" y="84" class="mono" font-size="11" letter-spacing="1" fill="#64748B">${esc(m)}</text>`).join('');
const daylabels = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([ri, n]) => `<text x="58" y="${y0 + ri * pitch + 11.5}" text-anchor="end" class="mono" font-size="10" fill="#64748B">${n}</text>`).join('');
const firstDate = days[0].date.slice(0, 4);
const lastDate = days[days.length - 1].date.slice(0, 4);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
<title id="title">Fly Tan contribution heatmap</title>
<desc id="desc">An animated neon heatmap of ${total} GitHub contributions over ${weeks.length} weeks.</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#020617"/><stop offset="1" stop-color="#0f1230"/></linearGradient>
  <linearGradient id="bd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22D3EE"/><stop offset="0.5" stop-color="#A855F7"/><stop offset="1" stop-color="#F472B6"/></linearGradient>
  <linearGradient id="scan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22D3EE" stop-opacity="0"/><stop offset="0.5" stop-color="#22D3EE" stop-opacity="0.16"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></linearGradient>
  <mask id="reveal"><rect x="0" y="0" width="0" height="${H}" fill="white"><animate attributeName="width" from="0" to="${W}" dur="2.2s" begin="0.2s" fill="freeze"/></rect></mask>
  <clipPath id="gridclip"><rect x="${x0 - 4}" y="${y0 - 4}" width="${(weeks.length - 1) * pitch + cell + 8}" height="${7 * pitch + 8}" rx="6"/></clipPath>
  <style>.mono { font-family: 'Courier New', Consolas, monospace; }</style>
</defs>
<rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
<rect x="14" y="14" width="1152" height="38" rx="11" fill="#0B1220" fill-opacity="0.9" stroke="url(#bd)" stroke-opacity="0.35"/>
<circle cx="35" cy="33" r="5" fill="#EF4444"/><circle cx="53" cy="33" r="5" fill="#F59E0B"/><circle cx="71" cy="33" r="5" fill="#10B981"/>
<text x="92" y="38" class="mono" font-size="12" letter-spacing="1" fill="#94A3B8">Fly-Tan@profile ~ % ./contributions --live</text>
<text x="1150" y="38" text-anchor="end" class="mono" font-size="12" letter-spacing="1" fill="#22D3EE">${total} CONTRIBUTIONS</text>
${mlabels}
${daylabels}
<g mask="url(#reveal)"><g clip-path="url(#gridclip)">${cells.join('')}</g>
<rect x="0" y="${y0 - 4}" width="90" height="${7 * pitch + 8}" fill="url(#scan)" style="mix-blend-mode:screen"><animateTransform attributeName="transform" type="translate" from="-90 0" to="${W} 0" dur="5.5s" repeatCount="indefinite"/></rect>
</g>
<text x="56" y="277" text-anchor="end" class="mono" font-size="10" fill="#64748B">Less</text>
${swatches}
<text x="${x0 + 5 * 22 + 8}" y="277" class="mono" font-size="10" fill="#64748B">More</text>
<text x="1124" y="277" text-anchor="end" class="mono" font-size="10" letter-spacing="1" fill="#64748B">${firstDate} — ${lastDate}  /  ${weeks.length} WEEKS  /  PEAK ${peak}/DAY</text>
<rect x="2" y="2" width="1176" height="326" rx="16" fill="none" stroke="url(#bd)" stroke-width="2" opacity="0.7"><animate attributeName="opacity" values="0.45;0.9;0.45" dur="4s" repeatCount="indefinite"/></rect>
</svg>`;

const hash = crypto.createHash('md5').update(svg).digest('hex').slice(0, 8);
const name = `contributions-${hash}.svg`;
const dir = path.resolve('.');
const target = path.join(dir, name);
fs.writeFileSync(target, svg);

// remove previous generated files
for (const f of fs.readdirSync(dir)) {
  if (/^contributions-[0-9a-f]{8}\.svg$/.test(f) && f !== name) fs.unlinkSync(path.join(dir, f));
}
if (fs.existsSync('contributions-neon.svg')) fs.unlinkSync('contributions-neon.svg');

// update README reference
const readme = path.join(dir, 'README.md');
let md = fs.readFileSync(readme, 'utf8');
const next = md.replace(/\.\/contributions-(?:neon|[0-9a-f]{8})\.svg/g, `./${name}`);
if (next !== md) fs.writeFileSync(readme, next);

console.log(`generated ${name} (${svg.length} bytes), ${total} contributions, ${weeks.length} weeks`);
