# CLAUDE.md — Alon Urlainis Academic Website

## Project Overview

A static academic personal website for **Dr. Alon Urlainis**, Lecturer at the Department of Civil Engineering, Ariel University. The site presents his CV, research profile, publications, teaching activities, student supervision, and contact information.

## Repository Structure

```
Project-1/
├── index.html      # Single-page website (all sections)
├── style.css       # All styles (CSS custom properties, responsive layout)
└── CLAUDE.md       # This file
```

The project is intentionally **minimal** — a pure HTML/CSS static site with no build tools, no frameworks, and no dependencies. One inline `<script>` block in `index.html` handles the publication tab switching and the hero knowledge-graph canvas animation.

## Architecture

### Single-Page Layout
`index.html` is organized as a set of `<section>` elements, each with a unique `id` used for smooth-scroll navigation:

| Section ID    | Path chip | Content |
|---------------|-----------|---------|
| `#home`       | (console) | Hero: name, knowledge-graph canvas, seismogram SVG, monitor-style stat cards, contact links |
| `#about`      | ❯about | Education timeline + academic positions + impact metrics |
| `#research`   | ❯research | Four color-coded research-domain panels (BIM / AI / Risk / Construction Mgmt) |
| `#publications` | ❯publications | Tabbed list: journal articles / conference papers / technical reports / invited talks |
| `#teaching`   | ❯teaching | Cards per institution/role |
| `#students`   | ❯supervision | Ongoing and completed graduate students |
| `#awards`     | ❯awards | Awards and honors |
| `#contact`    | ❯contact | Contact info + address |

### Design Language
The visual identity is a "computational research workstation": a dark graphite-blue ground with
a fixed left-rail navigation on desktop (top bar on mobile), terminal-path section chips
(`.sheet-code`, rendered as `❯name`), an ambient knowledge-graph canvas animation behind the
hero (`.net`, drawn in the inline script), the seismic identity kept as a teal accelerogram
trace (`.seismo`) with an amber PGA annotation, and a build-manifest footer (`.titleblock`).
Metadata badges are luminous pill chips. Single committed dark theme.

### CSS Design System (`style.css`)
All design tokens are defined as CSS custom properties at the top of the file:

```css
:root {
  --bg, --bg-grid        /* graphite-blue night ground + faint grid */
  --surface, --surface-2 /* raised panels / hover state */
  --text, --muted        /* primary and secondary text */
  --edge                 /* hairline borders */
  --accent               /* computational teal (#46c2b0) — links, active states, trace */
  --amber                /* annotation amber (#e0a458) — years, PGA marker */
  --dom-bim, --dom-ai, --dom-risk, --dom-cm  /* luminous research-domain accents */
  --radius, --max-w, --rail
  --font-display         /* Sora (headings) */
  --font-body            /* IBM Plex Sans */
  --font-mono            /* IBM Plex Mono (paths, years, stats, badges) */
}
```

Fonts load from Google Fonts via a `<link>` in `index.html`. Layout uses CSS Grid and Flexbox;
the desktop sidebar is the fixed `nav` plus `margin-left: var(--rail)` on `section, footer`,
collapsing to a sticky top bar under 900px. No utility classes — layout is component-scoped.

### Responsive Breakpoints
- `≤ 768px`: single-column layouts, hamburger nav, smaller hero
- `≤ 480px`: reduced padding, single-column interest cards

## Key Conventions

### Updating Publications
Each publication is a `.pub-item` div inside one of four `#pub-*` containers:
- `#pub-journals` — journal articles (ordered newest-first; `pub-num` label reads "Journal N • YEAR")
- `#pub-conferences` — conference proceedings
- `#pub-reports` — technical reports
- `#pub-talks` — invited lectures/seminars without published proceedings

Badge classes for metadata (outlined "stamp" chips, colored by class):
- `.badge-q1` — Q1 CiteScore/quartile (green)
- `.badge-q2` — Q2 CiteScore/quartile (yellow)
- `.badge-cite` — citation count (blue)
- `.badge-jif` — journal impact factor + quartile (purple)

Journal items typically carry three badges: `badge-jif` ("JIF X.X · QN"), `badge-q1`/`badge-q2`
("CiteScore X.X · QN"), and `badge-cite` ("N citations").

The tab buttons in `.pub-tabs` show the count inline; update these when adding new entries.

### Publication Tab JavaScript
A single global function `showPubs(type)` is defined at the bottom of `index.html`. It hides all `.pub-list` divs, removes `.active` from all `.pub-tab` buttons, then activates the selected tab and list by their `id` (`pub-journals`, `pub-conferences`, `pub-reports`, `pub-talks`).

### Research Domains
The research section is a 2×2 grid of `.domain-card` panels, one per domain, each carrying a
modifier class that sets the accent via `--dc`: `.dom-bim` (B, blue), `.dom-ai` (A, purple),
`.dom-risk` (R, red), `.dom-cm` (C, green). Each card has a `.domain-code` letter chip,
a display-face `h3`, a description, and mono `.domain-tags` topic chips. The hero eyebrow
reuses the same modifier classes to color its keywords (`.kw.dom-*`).

### Adding Students
Students go inside `.students-grid > .student-group` divs. Degree badge classes (outlined chips):
- `.phd` — PhD candidate (amber)
- `.msc` — M.Sc. student (blue)
- `.comp` — Completed (green)

### Navigation
The sticky nav is hand-coded with anchor links. The hamburger menu uses a single `onclick` toggling `.open` on `.nav-links`. If new sections are added, add a corresponding `<li><a href="#sectionid">Label</a></li>` in the nav.

## Content Updates

When Dr. Urlainis's CV changes, the following sections need updating:

| CV Change | Where to edit |
|-----------|--------------|
| New journal article | Add `.pub-item` at top of `#pub-journals`; update count in tab button |
| New conference paper | Add `.pub-item` at top of `#pub-conferences`; update count |
| New student | Add `.student-card` in appropriate group |
| Student graduates | Move card to "Completed" group; change badge to `.comp` |
| Citation/H-index update | Update `.hero-stats` in hero section AND the "Impact Metrics" list in `#about` |
| New award | Add `.award-item` in `#awards` |
| New course | Add `<li>` in appropriate `.teaching-card` |

## Deployment

This is a fully static site. It can be served from:
- **GitHub Pages** — push to `gh-pages` branch or configure Pages to serve from `main`/root
- **Netlify / Vercel** — drag-and-drop the folder or connect the repo (no build command needed, publish directory: `.`)
- **Any web server** — copy `index.html` and `style.css` to the server root

No build step is required. No `npm install`.

## Owner / Subject

- **Name:** Alon Urlainis
- **Email:** alonu@ariel.ac.il
- **Phone:** +972-50-711-6951
- **Position:** Senior Lecturer, Department of Civil Engineering, Ariel University (2026–Present)
- **Google Scholar H-index:** 11 | **WoS H-index:** 10
- **Total citations (GS):** 428
