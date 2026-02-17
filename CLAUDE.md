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

The project is intentionally **minimal** — a pure HTML/CSS static site with no build tools, no frameworks, and no dependencies. One small inline `<script>` block in `index.html` handles the publication tab switching.

## Architecture

### Single-Page Layout
`index.html` is organized as a set of `<section>` elements, each with a unique `id` used for smooth-scroll navigation:

| Section ID    | Content |
|---------------|---------|
| `#home`       | Hero: name, title, stats, contact links |
| `#about`      | Education timeline + academic positions + impact metrics |
| `#research`   | Six research-interest cards |
| `#publications` | Tabbed list: journal articles / conference papers / technical reports |
| `#teaching`   | Cards per institution/role |
| `#students`   | Ongoing and completed graduate students |
| `#awards`     | Awards and honors |
| `#contact`    | Contact info + address |

### CSS Design System (`style.css`)
All design tokens are defined as CSS custom properties at the top of the file:

```css
:root {
  --navy, --navy-dark   /* primary dark blues */
  --blue, --blue-lt     /* interactive blue */
  --accent              /* orange accent (#e67e22) */
  --bg, --bg-card       /* backgrounds */
  --text, --text-muted  /* typography */
  --border, --shadow, --radius, --max-w
}
```

Layout uses CSS Grid and Flexbox throughout. No utility classes — layout is component-scoped.

### Responsive Breakpoints
- `≤ 768px`: single-column layouts, hamburger nav, smaller hero
- `≤ 480px`: reduced padding, single-column interest cards

## Key Conventions

### Updating Publications
Each publication is a `.pub-item` div inside one of three `#pub-*` containers:
- `#pub-journals` — journal articles (ordered newest-first; `pub-num` label reads "Journal N • YEAR")
- `#pub-conferences` — conference proceedings
- `#pub-reports` — technical reports

Badge classes for metadata:
- `.badge-q1` — Q1 ranking (green)
- `.badge-q2` — Q2 ranking (yellow)
- `.badge-cite` — citation count (blue)
- `.badge-jif` — journal impact factor (purple)

The tab buttons in `.pub-tabs` show the count inline; update these when adding new entries.

### Publication Tab JavaScript
A single global function `showPubs(type)` is defined at the bottom of `index.html`. It hides all `.pub-list` divs, removes `.active` from all `.pub-tab` buttons, then activates the selected tab and list by their `id` (`pub-journals`, `pub-conferences`, `pub-reports`).

### Adding Students
Students go inside `.students-grid > .student-group` divs. Degree badge classes:
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
- **Position:** Lecturer, Department of Civil Engineering, Ariel University (2020–Present)
- **Google Scholar H-index:** 11 | **WoS H-index:** 8
- **Total citations (GS):** 323+
