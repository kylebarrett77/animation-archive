import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart
} from 'recharts';

// Data
const DATABASE_DATA = {
  films: 2178,
  queue: 3722,
  watchLinks: 1736,
  directors: 1158,
  studios: 803,
  sources: 85,
  series: 56,
  sessions: 206
};

const DELTA_DATA = {
  films: { current: 2178, previous: 1793, delta: 385, status: 'critical' },
  queue: { current: 3722, previous: 2813, delta: 909, status: 'positive' },
  watchLinks: { current: 1736, previous: 1736, delta: 0, status: 'critical' },
  directors: { current: 1158, previous: 1100, delta: 58, status: 'positive' },
  studios: { current: 803, previous: 781, delta: 22, status: 'positive' },
  series: { current: 56, previous: 56, delta: 0, status: 'warning' },
  sessions: { current: 206, previous: 206, delta: 0, status: 'warning' }
};

const FILMS_BY_COUNTRY = [
  { country: 'Japan', films: 815, percentage: 37.4 },
  { country: 'USA', films: 296, percentage: 13.6 },
  { country: 'China', films: 143, percentage: 6.6 },
  { country: 'USSR', films: 108, percentage: 5.0 },
  { country: 'France', films: 99, percentage: 4.5 },
  { country: 'Canada', films: 70, percentage: 3.2 },
  { country: 'UK', films: 68, percentage: 3.1 },
  { country: 'Yugoslavia', films: 67, percentage: 3.1 },
  { country: 'Czechoslovakia', films: 52, percentage: 2.4 },
  { country: 'South Korea', films: 45, percentage: 2.1 },
  { country: 'Poland', films: 42, percentage: 1.9 },
  { country: 'Hungary', films: 29, percentage: 1.3 },
  { country: 'Estonia', films: 24, percentage: 1.1 },
  { country: 'Russia', films: 22, percentage: 1.0 }
];

const CONFIDENCE_DATA = [
  { rating: '★★★★★', films: 646, percentage: 29.7, color: '#10b981' },
  { rating: '★★★★', films: 1042, percentage: 47.8, color: '#3b82f6' },
  { rating: '★★★', films: 441, percentage: 20.2, color: '#f59e0b' },
  { rating: '★★', films: 47, percentage: 2.2, color: '#ef4444' },
  { rating: '★', films: 2, percentage: 0.1, color: '#7f1d1d' }
];

const FORMAT_DATA = [
  { format: 'Series', count: 909, percentage: 41.7, color: '#f59e0b' },
  { format: 'Short', count: 705, percentage: 32.4, color: '#3b82f6' },
  { format: 'Feature', count: 545, percentage: 25.0, color: '#8b5cf6' },
  { format: 'Segment', count: 19, percentage: 0.9, color: '#ec4899' }
];

const WATCH_LINKS_STATUS = [
  { status: 'Unverified', links: 1040, percentage: 59.9, color: '#f59e0b' },
  { status: 'Verified', links: 635, percentage: 36.6, color: '#10b981' },
  { status: 'Dead', links: 46, percentage: 2.7, color: '#ef4444' },
  { status: 'Redirect', links: 15, percentage: 0.9, color: '#ec4899' }
];

const WATCH_LINKS_PLATFORM = [
  { platform: 'YouTube', links: 481 },
  { platform: 'Crunchyroll', links: 200 },
  { platform: 'Other', links: 160 },
  { platform: 'Netflix', links: 143 },
  { platform: 'Internet Archive', links: 135 },
  { platform: 'Tubi', links: 124 },
  { platform: 'Animatsiya.net', links: 77 },
  { platform: 'Amazon Prime', links: 58 },
  { platform: 'NFB', links: 50 },
  { platform: 'Disney+', links: 37 },
  { platform: 'Hulu', links: 37 },
  { platform: 'Kanopy', links: 30 },
  { platform: 'Apple TV', links: 29 },
  { platform: 'Vimeo', links: 26 },
  { platform: 'Plex', links: 22 }
];

const DIRECTORS_BY_NATIONALITY = [
  { country: 'Japan', directors: 327 },
  { country: 'USA', directors: 145 },
  { country: 'China', directors: 96 },
  { country: 'USSR', directors: 55 },
  { country: 'France', directors: 55 },
  { country: 'Canada', directors: 38 },
  { country: 'South Korea', directors: 28 },
  { country: 'UK', directors: 20 },
  { country: 'Mexico', directors: 20 },
  { country: 'Other', directors: 20 },
  { country: 'Spain', directors: 17 },
  { country: 'India', directors: 16 },
  { country: 'Poland', directors: 16 },
  { country: 'South Africa', directors: 14 },
  { country: 'Brazil', directors: 13 }
];

const NETWORK_METRICS = {
  directorFilmRatio: 1.88,
  studioFilmRatio: 2.71,
  watchLinksPerFilm: 0.80,
  queueConversionRate: 58.5,
  seriesLinked: 7.3
};

const GAP_METRICS = {
  filmsMissingDirector: 309,
  filmsMissingWatchLinks: 592,
  filmsMissingStudio: 36,
  watchLinksMissingCompleteness: 823,
  queueNew: 593,
  queueResearching: 162,
  deadWatchLinks: 61
};

const PRIORITY_MATRIX_DATA = [
  { name: 'Missing Watch Links (592 films)', urgency: 95, impact: 90, size: 592 },
  { name: 'Unverified Links (1040)', urgency: 75, impact: 70, size: 1040 },
  { name: 'Missing Director Links (309)', urgency: 80, impact: 65, size: 309 },
  { name: 'Queue Backlog (593 new)', urgency: 85, impact: 60, size: 593 },
  { name: 'Dead/Redirect Links (61)', urgency: 60, impact: 40, size: 61 },
  { name: 'Completeness Issues (823)', urgency: 70, impact: 75, size: 823 }
];

// Overview Panel Component
const OverviewPanel = () => {
  const items = [
    { label: 'Films', current: DATABASE_DATA.films, previous: DELTA_DATA.films.previous },
    { label: 'Queue', current: DATABASE_DATA.queue, previous: DELTA_DATA.queue.previous },
    { label: 'Watch Links', current: DATABASE_DATA.watchLinks, previous: DELTA_DATA.watchLinks.previous },
    { label: 'Directors', current: DATABASE_DATA.directors, previous: DELTA_DATA.directors.previous },
    { label: 'Studios', current: DATABASE_DATA.studios, previous: DELTA_DATA.studios.previous }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
      {items.map((item) => {
        const deltaInfo = DELTA_DATA[item.label.toLowerCase().replace(' ', '')];
        const delta = item.current - item.previous;
        const isPositive = delta > 0;
        const isCritical = deltaInfo?.status === 'critical';

        return (
          <div
            key={item.label}
            className={`rounded-lg p-6 border-2 ${
              isCritical
                ? 'bg-red-950 border-red-700'
                : 'bg-slate-800 border-slate-700'
            } shadow-lg`}
          >
            <div className="text-sm font-semibold text-slate-300 mb-2">
              {item.label}
            </div>
            <div className="text-3xl font-bold text-white mb-3">
              {item.current.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              {isPositive ? (
                <span className="text-green-400 text-lg">▲</span>
              ) : delta < 0 ? (
                <span className="text-red-400 text-lg">▼</span>
              ) : (
                <span className="text-amber-400 text-lg">→</span>
              )}
              <span
                className={`text-sm font-semibold ${
                  isPositive
                    ? 'text-green-400'
                    : delta < 0
                    ? 'text-red-400'
                    : 'text-amber-400'
                }`}
              >
                {isPositive ? '+' : ''}{delta}
              </span>
              <span className="text-xs text-slate-400">
                ({item.previous} prev)
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Health Scorecard Component
const HealthScorecard = () => {
  const scores = [
    {
      name: 'Films Coverage',
      score: 85,
      issues: `${GAP_METRICS.filmsMissingWatchLinks} missing watch links`,
      color: 'amber'
    },
    {
      name: 'Watch Links Status',
      score: 37,
      issues: `${WATCH_LINKS_STATUS[0].links} unverified, ${GAP_METRICS.deadWatchLinks} dead`,
      color: 'red'
    },
    {
      name: 'Director Linking',
      score: 82,
      issues: `${GAP_METRICS.filmsMissingDirector} films without director`,
      color: 'amber'
    },
    {
      name: 'Data Completeness',
      score: 75,
      issues: `${GAP_METRICS.watchLinksMissingCompleteness} incomplete records`,
      color: 'amber'
    },
    {
      name: 'Data Quality (Confidence)',
      score: 98,
      issues: `${CONFIDENCE_DATA[0].films} films ★★★★★ rated`,
      color: 'green'
    },
    {
      name: 'Queue Processing',
      score: 59,
      issues: `${GAP_METRICS.queueNew} new, ${GAP_METRICS.queueResearching} researching`,
      color: 'red'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {scores.map((item) => {
        const colorClass =
          item.color === 'green'
            ? 'text-green-400 bg-green-950'
            : item.color === 'amber'
            ? 'text-amber-400 bg-amber-950'
            : 'text-red-400 bg-red-950';

        return (
          <div key={item.name} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex justify-between items-start mb-3">
              <div className="text-sm font-semibold text-slate-300">{item.name}</div>
              <div className={`text-2xl font-bold ${colorClass} px-3 py-1 rounded`}>
                {item.score}%
              </div>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 mb-3">
              <div
                className={`h-2 rounded-full transition-all ${
                  item.color === 'green'
                    ? 'bg-green-500'
                    : item.color === 'amber'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${item.score}%` }}
              />
            </div>
            <div className="text-xs text-slate-400">{item.issues}</div>
          </div>
        );
      })}
    </div>
  );
};

// Network Graph Component
const NetworkGraph = () => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    svg.innerHTML = '';

    const width = svg.clientWidth;
    const height = svg.clientHeight;

    // Simple force simulation mock data
    const nodes = [
      { id: 'Films (2178)', type: 'films', x: width / 2, y: height / 2, r: 40 },
      { id: 'Directors (1158)', type: 'node', x: width / 4, y: height / 4, r: 30 },
      { id: 'Studios (803)', type: 'node', x: (3 * width) / 4, y: height / 4, r: 28 },
      { id: 'Series (56)', type: 'node', x: width / 4, y: (3 * height) / 4, r: 20 },
      { id: 'Sources (85)', type: 'node', x: (3 * width) / 4, y: (3 * height) / 4, r: 22 }
    ];

    const links = [
      { source: 0, target: 1 },
      { source: 0, target: 2 },
      { source: 0, target: 3 },
      { source: 1, target: 2 },
      { source: 2, target: 4 }
    ];

    // Draw links
    links.forEach((link) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', nodes[link.source].x);
      line.setAttribute('y1', nodes[link.source].y);
      line.setAttribute('x2', nodes[link.target].x);
      line.setAttribute('y2', nodes[link.target].y);
      line.setAttribute('stroke', '#475569');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('opacity', '0.5');
      svg.appendChild(line);
    });

    // Draw nodes
    nodes.forEach((node) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', node.r);
      circle.setAttribute(
        'fill',
        node.type === 'films' ? '#f59e0b' : '#3b82f6'
      );
      circle.setAttribute('opacity', '0.8');
      circle.setAttribute('class', 'hover:opacity-100 transition-opacity cursor-pointer');
      svg.appendChild(circle);

      // Add text
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', node.x);
      text.setAttribute('y', node.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', '0.3em');
      text.setAttribute('fill', 'white');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('pointer-events', 'none');
      text.textContent = node.id;
      svg.appendChild(text);
    });
  }, []);

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-lg font-bold text-amber-400 mb-4">Network Architecture</h3>
      <svg
        ref={svgRef}
        className="w-full border border-slate-600 rounded bg-slate-900"
        style={{ minHeight: '400px' }}
      />
      <div className="mt-4 text-xs text-slate-400">
        <p>Network nodes: Films (central hub) connected to Directors, Studios, Series, and Sources</p>
        <p>Director→Film ratio: {NETWORK_METRICS.directorFilmRatio.toFixed(2)} | Studio→Film ratio: {NETWORK_METRICS.studioFilmRatio.toFixed(2)}</p>
      </div>
    </div>
  );
};

// Centrality Analysis Component
const CentralityAnalysis = () => {
  const densityData = [
    { country: 'Japan', filmCount: 815, directorCount: 327, density: 2.49, studioCount: 178, studioDensity: 4.58 },
    { country: 'USA', filmCount: 296, directorCount: 145, density: 2.04, studioCount: 45, studioDensity: 6.58 },
    { country: 'China', filmCount: 143, directorCount: 96, density: 1.49, studioCount: 22, studioDensity: 6.50 },
    { country: 'USSR', filmCount: 108, directorCount: 55, density: 1.96, studioCount: 18, studioDensity: 6.00 },
    { country: 'France', filmCount: 99, directorCount: 55, density: 1.80, studioCount: 15, studioDensity: 6.60 }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-bold text-amber-400 mb-4">Films by Country (Top 14)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={FILMS_BY_COUNTRY}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="country"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
              labelStyle={{ color: '#f59e0b' }}
            />
            <Bar dataKey="films" fill="#f59e0b" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-amber-400 mb-4">Director Density by Country</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={densityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis
                dataKey="country"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#3b82f6' }}
              />
              <Bar dataKey="density" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-amber-400 mb-4">Studio Density by Country</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={densityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis
                dataKey="country"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#8b5cf6' }}
              />
              <Bar dataKey="studioDensity" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-bold text-amber-400 mb-4">Directors by Nationality (Top 15)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={DIRECTORS_BY_NATIONALITY} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis dataKey="country" type="category" tick={{ fill: '#94a3b8', fontSize: 12 }} width={100} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
              labelStyle={{ color: '#10b981' }}
            />
            <Bar dataKey="directors" fill="#10b981" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Gap Analysis Component
const GapAnalysis = () => {
  const gapData = [
    { name: 'Missing Watch Links', value: GAP_METRICS.filmsMissingWatchLinks, color: '#ef4444', severity: 'critical' },
    { name: 'Unverified Links', value: WATCH_LINKS_STATUS[0].links, color: '#f59e0b', severity: 'high' },
    { name: 'Completeness Issues', value: GAP_METRICS.watchLinksMissingCompleteness, color: '#f59e0b', severity: 'high' },
    { name: 'Queue Backlog', value: GAP_METRICS.queueNew, color: '#f97316', severity: 'medium' },
    { name: 'Missing Director Links', value: GAP_METRICS.filmsMissingDirector, color: '#f97316', severity: 'medium' },
    { name: 'Dead/Redirect Links', value: GAP_METRICS.deadWatchLinks, color: '#ef4444', severity: 'critical' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-bold text-amber-400 mb-4">Gap Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {gapData.map((gap) => (
            <div key={gap.name} className="bg-slate-700 rounded p-4 border border-slate-600">
              <div className="text-xs font-semibold text-slate-400 mb-2">{gap.name}</div>
              <div style={{ color: gap.color }} className="text-2xl font-bold">
                {gap.value.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500 mt-2">
                <span
                  className={`inline-block px-2 py-1 rounded ${
                    gap.severity === 'critical'
                      ? 'bg-red-950 text-red-400'
                      : gap.severity === 'high'
                      ? 'bg-amber-950 text-amber-400'
                      : 'bg-orange-950 text-orange-400'
                  }`}
                >
                  {gap.severity.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-amber-400 mb-4">Watch Links Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={WATCH_LINKS_STATUS}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ status, percentage }) => `${status} ${percentage}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="links"
              >
                {WATCH_LINKS_STATUS.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#f59e0b' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-amber-400 mb-4">Film Confidence Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={CONFIDENCE_DATA}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ rating, percentage }) => `${rating} ${percentage}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="films"
              >
                {CONFIDENCE_DATA.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#f59e0b' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-amber-400 mb-4">Film Format Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={FORMAT_DATA}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ format, percentage }) => `${format} ${percentage}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {FORMAT_DATA.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#f59e0b' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-amber-400 mb-4">Top Watch Link Platforms</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={WATCH_LINKS_PLATFORM.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis
                dataKey="platform"
                type="category"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                width={120}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#f59e0b' }}
              />
              <Bar dataKey="links" fill="#f59e0b" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// Priority Matrix Component
const PriorityMatrix = () => {
  const quadrants = [
    { label: 'High Urgency / High Impact', x: [50, 100], y: [50, 100], color: 'bg-red-950' },
    { label: 'Low Urgency / High Impact', x: [0, 50], y: [50, 100], color: 'bg-amber-950' },
    { label: 'High Urgency / Low Impact', x: [50, 100], y: [0, 50], color: 'bg-yellow-950' },
    { label: 'Low Urgency / Low Impact', x: [0, 50], y: [0, 50], color: 'bg-slate-700' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-bold text-amber-400 mb-4">Priority Matrix</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            data={PRIORITY_MATRIX_DATA}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              type="number"
              dataKey="urgency"
              name="Urgency"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              label={{ value: 'Urgency →', position: 'insideBottomRight', offset: -5, fill: '#f59e0b' }}
            />
            <YAxis
              type="number"
              dataKey="impact"
              name="Impact"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              label={{ value: '← Impact', angle: -90, position: 'insideLeft', fill: '#f59e0b' }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
              labelStyle={{ color: '#f59e0b' }}
              formatter={(value, name) => {
                if (name === 'size') return `${value} items`;
                return value;
              }}
            />
            <Scatter name="Issues" data={PRIORITY_MATRIX_DATA} fill="#f59e0b" shape="circle" />
            <Legend wrapperStyle={{ color: '#94a3b8' }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-amber-400 mb-4">Critical Issues (High Urgency)</h3>
          <div className="space-y-3">
            <div className="bg-red-950 border border-red-700 rounded p-3">
              <div className="font-semibold text-red-400">Missing Watch Links (592 films)</div>
              <div className="text-xs text-slate-300 mt-1">385 new films added with no associated watch links</div>
            </div>
            <div className="bg-red-950 border border-red-700 rounded p-3">
              <div className="font-semibold text-red-400">Dead/Redirect Links (61 total)</div>
              <div className="text-xs text-slate-300 mt-1">46 dead, 15 redirect — need cleanup and replacement</div>
            </div>
            <div className="bg-amber-950 border border-amber-700 rounded p-3">
              <div className="font-semibold text-amber-400">Unverified Links (1040)</div>
              <div className="text-xs text-slate-300 mt-1">60% of links need verification before public release</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-bold text-amber-400 mb-4">High Impact Issues</h3>
          <div className="space-y-3">
            <div className="bg-amber-950 border border-amber-700 rounded p-3">
              <div className="font-semibold text-amber-400">Completeness (823 records)</div>
              <div className="text-xs text-slate-300 mt-1">Watch links missing required metadata fields</div>
            </div>
            <div className="bg-orange-950 border border-orange-700 rounded p-3">
              <div className="font-semibold text-orange-400">Queue Backlog (593 new)</div>
              <div className="text-xs text-slate-300 mt-1">New entries in queue awaiting initial processing</div>
            </div>
            <div className="bg-orange-950 border border-orange-700 rounded p-3">
              <div className="font-semibold text-orange-400">Missing Director Links (309)</div>
              <div className="text-xs text-slate-300 mt-1">Films not linked to director records</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component
export default function AnimationArchiveDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'health', label: 'Health', icon: '❤️' },
    { id: 'network', label: 'Network', icon: '🔗' },
    { id: 'centrality', label: 'Centrality', icon: '📍' },
    { id: 'gaps', label: 'Gaps', icon: '⚠️' },
    { id: 'priority', label: 'Priority', icon: '🎯' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-amber-400 mb-2">
          Animation Archive Audit Dashboard
        </h1>
        <p className="text-slate-400">
          Integrative cross-system analysis | Network architecture | Centrality insights
        </p>
        <p className="text-xs text-slate-500 mt-2">Last updated: April 13, 2026</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-700 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content Panels */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <>
            <OverviewPanel />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-amber-400 mb-4">Key Metrics</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Director→Film Ratio</span>
                    <span className="text-amber-400 font-bold">{NETWORK_METRICS.directorFilmRatio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Studio→Film Ratio</span>
                    <span className="text-amber-400 font-bold">{NETWORK_METRICS.studioFilmRatio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Watch Links per Film</span>
                    <span className="text-red-400 font-bold">{NETWORK_METRICS.watchLinksPerFilm.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Queue→Film Conversion</span>
                    <span className="text-amber-400 font-bold">{NETWORK_METRICS.queueConversionRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Series Linked</span>
                    <span className="text-amber-400 font-bold">{NETWORK_METRICS.seriesLinked.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-amber-400 mb-4">Database Summary (Apr 13)</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-slate-400">Films</div>
                    <div className="text-2xl font-bold text-white">{DATABASE_DATA.films.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Directors</div>
                    <div className="text-2xl font-bold text-white">{DATABASE_DATA.directors.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Studios</div>
                    <div className="text-2xl font-bold text-white">{DATABASE_DATA.studios.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Watch Links</div>
                    <div className="text-2xl font-bold text-white">{DATABASE_DATA.watchLinks.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'health' && <HealthScorecard />}

        {activeTab === 'network' && <NetworkGraph />}

        {activeTab === 'centrality' && <CentralityAnalysis />}

        {activeTab === 'gaps' && <GapAnalysis />}

        {activeTab === 'priority' && <PriorityMatrix />}
      </div>

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-slate-700 text-xs text-slate-500">
        <p>Database audit powered by Animation Archive system | Data as of April 13, 2026</p>
        <p className="mt-2">Critical alerts: 592 missing watch links | 1040 unverified links | 593 queue backlog</p>
      </div>
    </div>
  );
}
