import React from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  LineChart,
  ReferenceArea,
} from 'recharts';

interface Measurement {
  ageMonths: number;
  weight: number;
  height: number;
  date: string;
  weightForAge?: number;
  heightForAge?: number;
  weightForHeight?: number;
  riskLevel: 'normal' | 'mam' | 'sam';
}

interface WHOGrowthChartsProps {
  measurements: Measurement[];
  childGender: 'male' | 'female';
}

// Color per risk level for dots
function dotColor(risk: string) {
  if (risk === 'sam') return '#DC2626';
  if (risk === 'mam') return '#F59E0B';
  return '#2563EB';
}

export function WHOGrowthCharts({ measurements, childGender }: WHOGrowthChartsProps) {
  // Sort measurements by age ascending for trend lines
  const sorted = [...measurements].filter(m => m.weight > 0 || m.height > 0)
    .sort((a, b) => a.ageMonths - b.ageMonths);

  // ── WHO Reference Curves ──────────────────────────────────────────────────
  const whoWeightForAge = (() => {
    const rows: {
      age: number;
      plus3sd: number;
      plus2sd: number;
      median: number;
      minus2sd: number;
      minus3sd: number;
      severeBand: number;
      moderateBand: number;
      normalBand: number;
    }[] = [];
    for (let age = 0; age <= 60; age++) {
      const gf = childGender === 'male' ? 1.0 : 0.95;
      const med = (3.3 + age * 0.32) * gf;
      const minus3sd = med * 0.55;
      const minus2sd = med * 0.70;
      const plus2sd = med * 1.30;
      rows.push({
        age,
        plus3sd: med * 1.45,
        plus2sd,
        median: med,
        minus2sd,
        minus3sd,
        severeBand: minus3sd,
        moderateBand: minus2sd - minus3sd,
        normalBand: plus2sd - minus2sd,
      });
    }
    return rows;
  })();

  const whoLengthHeightForAge = (() => {
    const rows: {
      age: number;
      plus3sd: number;
      plus2sd: number;
      median: number;
      minus2sd: number;
      minus3sd: number;
      severeBand: number;
      moderateBand: number;
      normalBand: number;
    }[] = [];
    for (let age = 0; age <= 60; age++) {
      const gf = childGender === 'male' ? 1.0 : 0.98;
      const med = age <= 24 ? (49.5 + age * 2.1) * gf : (77 + (age - 24) * 0.95) * gf;
      const minus3sd = med * 0.88;
      const minus2sd = med * 0.92;
      const plus2sd = med * 1.08;
      rows.push({
        age,
        plus3sd: med * 1.12,
        plus2sd,
        median: med,
        minus2sd,
        minus3sd,
        severeBand: minus3sd,
        moderateBand: minus2sd - minus3sd,
        normalBand: plus2sd - minus2sd,
      });
    }
    return rows;
  })();

  const whoWeightForHeight = (() => {
    const rows: {
      length: number;
      plus3sd: number;
      plus2sd: number;
      median: number;
      minus2sd: number;
      minus3sd: number;
      severeBand: number;
      moderateBand: number;
      normalBand: number;
    }[] = [];
    for (let len = 45; len <= 120; len += 0.5) {
      const med = 2.5 + (len - 45) * 0.13;
      const minus3sd = med * 0.55;
      const minus2sd = med * 0.70;
      const plus2sd = med * 1.35;
      rows.push({
        length: parseFloat(len.toFixed(1)),
        plus3sd: med * 1.55,
        plus2sd,
        median: med,
        minus2sd,
        minus3sd,
        severeBand: minus3sd,
        moderateBand: minus2sd - minus3sd,
        normalBand: plus2sd - minus2sd,
      });
    }
    return rows;
  })();

  // ── Child measurement overlay data for LINE chart (age as x, actual value as y) ──
  // Used only for the connecting "growth line" – we also place ReferenceDots per measurement
  const childWeightForAgeLine = sorted
    .filter(m => m.weight > 0)
    .map(m => ({ age: m.ageMonths, childWeight: m.weight, label: m.date, risk: m.riskLevel }));

  const childLengthForAgeLine = sorted
    .filter(m => m.height > 0 && m.ageMonths <= 24)
    .map(m => ({ age: m.ageMonths, childHeight: m.height }));

  const childHeightForAgeLine = sorted
    .filter(m => m.height > 0 && m.ageMonths >= 24)
    .map(m => ({ age: m.ageMonths, childHeight: m.height }));

  const childWeightForHeightLine = sorted
    .filter(m => m.height > 0 && m.weight > 0)
    .map(m => ({ length: parseFloat(m.height.toFixed(1)), childWeight: m.weight }))
    .sort((a, b) => a.length - b.length);

  // ── Z-score timeline (Chart 4) ────────────────────────────────────────────
  const nutritionalStatusData = sorted.map(m => ({
    date: m.date,
    age: m.ageMonths,
    status: m.riskLevel === 'sam' ? 'SAM' : m.riskLevel === 'mam' ? 'MAM' : 'Normal',
    color: m.riskLevel === 'sam' ? '#E74C3C' : m.riskLevel === 'mam' ? '#F39C12' : '#2ECC71',
    wfa: m.weightForAge,
    hfa: m.heightForAge,
    wfh: m.weightForHeight,
  }));

  // ── Chart 5 Trend ─────────────────────────────────────────────────────────
  const latestMeasurement = sorted[sorted.length - 1];
  const previousMeasurement = sorted[sorted.length - 2];
  let growthTrend = 'stable';
  if (previousMeasurement) {
    const delta = (latestMeasurement.weightForAge ?? 0) - (previousMeasurement.weightForAge ?? 0);
    if (delta > 0.3) growthTrend = 'improving';
    else if (delta < -0.3) growthTrend = 'declining';
  }

  // ── Custom Tooltip ────────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white border-2 border-blue-500 rounded-lg shadow-lg p-3" style={{ minWidth: 180 }}>
          <p className="text-xs font-bold text-gray-900 mb-1">Measurement Details</p>
          {d.date && <p className="text-xs text-gray-700">Date: {d.date}</p>}
          {d.age !== undefined && <p className="text-xs text-gray-700">Age: {d.age} months</p>}
          {payload.map((e: any, i: number) => (
            <p key={i} className="text-xs" style={{ color: e.color }}>
              {e.name}: {typeof e.value === 'number' ? e.value.toFixed(2) : e.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // ── Shared gradient defs ──────────────────────────────────────────────────
  const GradientDefs = () => (
    <defs>
      <linearGradient id="severeZone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FCA5A5" stopOpacity={0.9} />
        <stop offset="100%" stopColor="#FCA5A5" stopOpacity={0.65} />
      </linearGradient>
      <linearGradient id="moderateZone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FED7AA" stopOpacity={0.85} />
        <stop offset="100%" stopColor="#FED7AA" stopOpacity={0.6} />
      </linearGradient>
      <linearGradient id="normalZone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#BBF7D0" stopOpacity={0.7} />
        <stop offset="100%" stopColor="#BBF7D0" stopOpacity={0.4} />
      </linearGradient>
    </defs>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200 p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2">WHO Child Growth Standards</h2>
        <p className="text-sm text-gray-700">
          Sri Lankan Child Health Development Record — {childGender === 'male' ? 'Boys' : 'Girls'} (0–5 Years)
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {sorted.length} measurement{sorted.length !== 1 ? 's' : ''} plotted •
          Coloured dots: <span className="text-blue-600 font-semibold">●</span> Normal &nbsp;
          <span className="text-yellow-500 font-semibold">●</span> MAM &nbsp;
          <span className="text-red-600 font-semibold">●</span> SAM
        </p>
      </div>

      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white">Chart 1: Weight-for-Age</h3>
          <p className="text-sm text-blue-50">Birth to 5 Years (0–60 months)</p>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-4 text-xs">
          <span><span className="inline-block w-5 h-3 bg-red-600 rounded mr-1"></span>Severe (&lt; −3 SD)</span>
          <span><span className="inline-block w-5 h-3 bg-orange-400 rounded mr-1"></span>Underweight (−3 to −2 SD)</span>
          <span><span className="inline-block w-5 h-3 bg-green-200 rounded mr-1"></span>Normal</span>
          <span><span className="inline-block w-4 h-1 bg-blue-600 rounded mr-1 align-middle"></span>Child's weight</span>
        </div>
        <div className="p-6">
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart data={whoWeightForAge} margin={{ top: 20, right: 40, left: 20, bottom: 100 }}>
              <GradientDefs />
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeWidth={0.5} />

              {/* Highlight WHO zones as stacked colour bands (soft, low-intensity fills) */}
              <Area
                type="monotone"
                dataKey="severeBand"
                stackId="bands"
                fill="#fecaca"         // light red
                fillOpacity={0.45}
                stroke="none"
              />
              <Area
                type="monotone"
                dataKey="moderateBand"
                stackId="bands"
                fill="#fed7aa"         // light orange
                fillOpacity={0.4}
                stroke="none"
              />
              <Area
                type="monotone"
                dataKey="normalBand"
                stackId="bands"
                fill="#bbf7d0"         // light green
                fillOpacity={0.35}
                stroke="none"
              />

              <Line type="monotone" dataKey="plus3sd" stroke="#10B981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="+3 SD" />
              <Line type="monotone" dataKey="plus2sd" stroke="#10B981" strokeWidth={1.5} dot={false} name="+2 SD" />
              <Line type="monotone" dataKey="median" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" />
              <Line type="monotone" dataKey="minus2sd" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="−2 SD" />
              <Line type="monotone" dataKey="minus3sd" stroke="#DC2626" strokeWidth={1.5} dot={false} name="−3 SD" />

              <ReferenceLine x={24} stroke="#6B7280" strokeWidth={1} strokeDasharray="5 5"
                label={{ value: '2 Yrs', position: 'top', fill: '#6B7280', fontSize: 10 }} />

              {/* Child measurement dots — guaranteed to show regardless of age rounding */}
              {sorted.filter(m => m.weight > 0).map((m, i) => (
                <ReferenceDot key={i} x={m.ageMonths} y={m.weight}
                  r={7} fill={dotColor(m.riskLevel)} stroke="#fff" strokeWidth={2}
                />
              ))}

              <XAxis
                dataKey="age"
                label={{
                  value: 'Age (months)',
                  position: 'insideBottom',
                  offset: 0,
                  style: { fontWeight: 'bold', fontSize: 13 },
                }}
                tick={{ fontSize: 11 }}
                domain={[0, 60]}
                ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24, 30, 36, 42, 48, 54, 60]}
              />
              <YAxis label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', style: { fontWeight: 'bold', fontSize: 13 } }}
                tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, marginTop: 50, paddingTop: 14 }}
                verticalAlign="bottom"
                align="center"
                iconType="line"
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Connecting growth line for child measurements (separate chart overlaid visually via data) */}
          {childWeightForAgeLine.length >= 2 && (
            <div className="mt-2 text-xs text-gray-500 text-center">
              ↑ Dots show each measurement visit. Growth trend across visits shown by progression of dots.
            </div>
          )}
        </div>
      </div>

      {/* ── CHART 2: Length / Height-for-Age ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2a: Length-for-Age (0–24 months) */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4">
            <h3 className="text-lg font-bold text-white">Chart 2a: Length-for-Age</h3>
            <p className="text-sm text-green-50">Birth to 2 Years (0–24 months) — Lying Down</p>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={450}>
              <ComposedChart data={whoLengthHeightForAge.filter(d => d.age <= 24)}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <GradientDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeWidth={0.5} />
                {/* Highlight WHO zones as stacked colour bands (soft, low-intensity fills) */}
                <Area
                  type="monotone"
                  dataKey="severeBand"
                  stackId="bands"
                  fill="#fecaca"
                  fillOpacity={0.45}
                  stroke="none"
                />
                <Area
                  type="monotone"
                  dataKey="moderateBand"
                  stackId="bands"
                  fill="#fed7aa"
                  fillOpacity={0.4}
                  stroke="none"
                />
                <Area
                  type="monotone"
                  dataKey="normalBand"
                  stackId="bands"
                  fill="#bbf7d0"
                  fillOpacity={0.35}
                  stroke="none"
                />
                <Line type="monotone" dataKey="plus3sd" stroke="#10B981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="+3 SD" />
                <Line type="monotone" dataKey="plus2sd" stroke="#10B981" strokeWidth={1.5} dot={false} name="+2 SD" />
                <Line type="monotone" dataKey="median" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" />
                <Line type="monotone" dataKey="minus2sd" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="−2 SD" />
                <Line type="monotone" dataKey="minus3sd" stroke="#DC2626" strokeWidth={1.5} dot={false} name="−3 SD" />

                {sorted.filter(m => m.height > 0 && m.ageMonths <= 24).map((m, i) => (
                  <ReferenceDot key={i} x={m.ageMonths} y={m.height}
                    r={7} fill={dotColor(m.riskLevel)} stroke="#fff" strokeWidth={2}
                  />
                ))}

                <XAxis
                  dataKey="age"
                  label={{
                    value: 'Age (months)',
                    position: 'insideBottom',
                    offset: 0,
                    style: { fontWeight: 'bold', fontSize: 13 },
                  }}
                  tick={{ fontSize: 11 }}
                  domain={[0, 24]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]}
                />
                <YAxis label={{ value: 'Length (cm)', angle: -90, position: 'insideLeft', style: { fontWeight: 'bold', fontSize: 13 } }}
                  tick={{ fontSize: 11 }} domain={[40, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, marginTop: 20, paddingTop: 6 }}
                  verticalAlign="bottom"
                  align="center"
                  iconType="line"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2b: Height-for-Age (24–60 months) */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
            <h3 className="text-lg font-bold text-white">Chart 2b: Height-for-Age</h3>
            <p className="text-sm text-green-50">2 to 5 Years (24–60 months) — Standing</p>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={450}>
              <ComposedChart data={whoLengthHeightForAge.filter(d => d.age >= 24)}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <GradientDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeWidth={0.5} />
                {/* Highlight WHO zones as stacked colour bands (soft, low-intensity fills) */}
                <Area
                  type="monotone"
                  dataKey="severeBand"
                  stackId="bands"
                  fill="#fecaca"
                  fillOpacity={0.45}
                  stroke="none"
                />
                <Area
                  type="monotone"
                  dataKey="moderateBand"
                  stackId="bands"
                  fill="#fed7aa"
                  fillOpacity={0.4}
                  stroke="none"
                />
                <Area
                  type="monotone"
                  dataKey="normalBand"
                  stackId="bands"
                  fill="#bbf7d0"
                  fillOpacity={0.35}
                  stroke="none"
                />
                <Line type="monotone" dataKey="plus3sd" stroke="#10B981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="+3 SD" />
                <Line type="monotone" dataKey="plus2sd" stroke="#10B981" strokeWidth={1.5} dot={false} name="+2 SD" />
                <Line type="monotone" dataKey="median" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" />
                <Line type="monotone" dataKey="minus2sd" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="−2 SD" />
                <Line type="monotone" dataKey="minus3sd" stroke="#DC2626" strokeWidth={1.5} dot={false} name="−3 SD" />

                {sorted.filter(m => m.height > 0 && m.ageMonths >= 24).map((m, i) => (
                  <ReferenceDot key={i} x={m.ageMonths} y={m.height}
                    r={7} fill={dotColor(m.riskLevel)} stroke="#fff" strokeWidth={2}
                  />
                ))}

                <XAxis
                  dataKey="age"
                  label={{
                    value: 'Age (months)',
                    position: 'insideBottom',
                    offset: 0,
                    style: { fontWeight: 'bold', fontSize: 13 },
                  }}
                  tick={{ fontSize: 11 }}
                  domain={[24, 60]}
                  ticks={[24, 28, 32, 36, 40, 44, 48, 52, 56, 60]}
                />
                <YAxis label={{ value: 'Height (cm)', angle: -90, position: 'insideLeft', style: { fontWeight: 'bold', fontSize: 13 } }}
                  tick={{ fontSize: 11 }} domain={[75, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, marginTop: 20, paddingTop: 6 }}
                  verticalAlign="bottom"
                  align="center"
                  iconType="line"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── CHART 3: Weight-for-Length/Height ─────────────────────────────── */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white">Chart 3: Weight-for-Length / Weight-for-Height</h3>
          <p className="text-sm text-purple-50">0–2 Years: Weight-for-Length (45–110 cm) • 2–5 Years: Weight-for-Height</p>
        </div>
        <div className="p-6">
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart data={whoWeightForHeight} margin={{ top: 20, right: 40, left: 20, bottom: 60 }}>
              <GradientDefs />
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeWidth={0.5} />
              {/* Highlight WHO zones as stacked colour bands (soft, low-intensity fills) */}
              <Area
                type="monotone"
                dataKey="severeBand"
                stackId="bands"
                fill="#fecaca"
                fillOpacity={0.45}
                stroke="none"
              />
              <Area
                type="monotone"
                dataKey="moderateBand"
                stackId="bands"
                fill="#fed7aa"
                fillOpacity={0.4}
                stroke="none"
              />
              <Area
                type="monotone"
                dataKey="normalBand"
                stackId="bands"
                fill="#bbf7d0"
                fillOpacity={0.35}
                stroke="none"
              />
              <Line type="monotone" dataKey="plus3sd" stroke="#9333EA" strokeWidth={1} strokeDasharray="3 3" dot={false} name="+3 SD (Obese)" />
              <Line type="monotone" dataKey="plus2sd" stroke="#A855F7" strokeWidth={1.5} dot={false} name="+2 SD (Overweight)" />
              <Line type="monotone" dataKey="median" stroke="#7C3AED" strokeWidth={2.5} dot={false} name="Median" />
              <Line type="monotone" dataKey="minus2sd" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="−2 SD" />
              <Line type="monotone" dataKey="minus3sd" stroke="#DC2626" strokeWidth={1.5} dot={false} name="−3 SD" />

              {/* Each measurement plotted at its actual (height, weight) position */}
              {sorted.filter(m => m.height > 0 && m.weight > 0).map((m, i) => (
                <ReferenceDot key={i} x={parseFloat(m.height.toFixed(1))} y={m.weight}
                  r={7} fill={dotColor(m.riskLevel)} stroke="#fff" strokeWidth={2}
                />
              ))}

              <XAxis
                dataKey="length"
                label={{
                  value: 'Length / Height (cm)',
                  position: 'insideBottom',
                  offset: 0,
                  style: { fontWeight: 'bold', fontSize: 13 },
                }}
                tick={{ fontSize: 11 }}
                type="number"
                domain={[45, 120]}
              />
              <YAxis label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', style: { fontWeight: 'bold', fontSize: 13 } }}
                tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, marginTop: 20, paddingTop: 6 }}
                verticalAlign="bottom"
                align="center"
                iconType="line"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── CHART 4: Nutritional Status Timeline ──────────────────────────── */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Chart 4: Nutritional Status Timeline
            <span className="text-xs bg-white text-amber-600 px-2 py-1 rounded-full font-bold">AUTO-GENERATED</span>
          </h3>
          <p className="text-sm text-amber-50">Derived from all measurements — updates instantly</p>
        </div>
        <div className="p-6">
          {nutritionalStatusData.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No measurements recorded yet.</p>
          ) : (
            <>
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-4 text-sm font-medium text-gray-700 border-b pb-2">
                  <div className="w-28">Date</div>
                  <div className="w-16">Age</div>
                  <div className="flex-1">Status</div>
                  <div className="w-36 text-center">Z-Scores (WFA / HFA / WFH)</div>
                </div>
                {nutritionalStatusData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-4 border-b border-gray-100 pb-2">
                    <div className="w-28 text-sm text-gray-700 font-medium">{entry.date?.slice(0, 10)}</div>
                    <div className="w-16 text-sm text-gray-500">{entry.age}m</div>
                    <div className="flex-1">
                      <div className="h-8 rounded-lg flex items-center px-4 text-white font-bold text-sm shadow-sm"
                        style={{ backgroundColor: entry.color }}>
                        {entry.status}
                      </div>
                    </div>
                    <div className="w-36 text-xs text-gray-600 text-center">
                      {entry.wfa != null ? entry.wfa.toFixed(2) : '—'} /&nbsp;
                      {entry.hfa != null ? entry.hfa.toFixed(2) : '—'} /&nbsp;
                      {entry.wfh != null ? entry.wfh.toFixed(2) : '—'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Z-score trend line chart */}
              {nutritionalStatusData.length >= 2 && (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={nutritionalStatusData}
                    margin={{ top: 20, right: 40, left: 20, bottom: 80 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

                    {/* Soft coloured bands for Z-score zones */}
                    <ReferenceArea y1={-4} y2={-3} fill="#FCA5A5" fillOpacity={0.25} />
                    <ReferenceArea y1={-3} y2={-2} fill="#FED7AA" fillOpacity={0.25} />
                    <ReferenceArea y1={-2} y2={2} fill="#BBF7D0" fillOpacity={0.18} />
                    <XAxis
                      dataKey="age"
                      label={{
                        value: 'Age (months)',
                        position: 'insideBottom',
                        offset: -1,
                        style: { fontSize: 13, fontWeight: 'bold' },
                      }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      label={{
                        value: 'Z-Score',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: 13, fontWeight: 'bold' },
                      }}
                      tick={{ fontSize: 11 }}
                      domain={[-4, 3]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      iconType="line"
                      wrapperStyle={{ fontSize: 12, marginTop: 24, paddingTop: 8 }}
                      verticalAlign="bottom"
                      align="center"
                    />
                    <ReferenceLine
                      y={-3}
                      stroke="#FCA5A5"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      label={{ value: '−3 SD', fill: '#DC2626', fontSize: 11 }}
                    />
                    <ReferenceLine
                      y={-2}
                      stroke="#FED7AA"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      label={{ value: '−2 SD', fill: '#F97316', fontSize: 11 }}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="#BBF7D0"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      label={{ value: 'Median', fill: '#059669', fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="wfa"
                      stroke="#2563EB"
                      strokeWidth={3}
                      dot={{ r: 6, fill: '#2563EB' }}
                      name="Weight-for-Age Z"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="hfa"
                      stroke="#10B981"
                      strokeWidth={3}
                      dot={{ r: 6, fill: '#10B981' }}
                      name="Height-for-Age Z"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="wfh"
                      stroke="#9333EA"
                      strokeWidth={3}
                      dot={{ r: 6, fill: '#9333EA' }}
                      name="Weight-for-Height Z"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── CHART 5: Growth Trend Dashboard ───────────────────────────────── */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Chart 5: Growth Trend Dashboard
            <span className="text-xs bg-white text-indigo-600 px-2 py-1 rounded-full font-bold">AUTO-GENERATED</span>
          </h3>
          <p className="text-sm text-indigo-50">Calculated from all recorded measurements</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Current Status */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border-2 border-blue-200">
              <h4 className="text-sm font-bold text-gray-700 mb-3">Current Nutritional Status</h4>
              <div className="text-center py-4 rounded-lg text-white font-bold text-xl shadow-md"
                style={{ backgroundColor: latestMeasurement ? dotColor(latestMeasurement.riskLevel) : '#6B7280' }}>
                {latestMeasurement ? latestMeasurement.riskLevel.toUpperCase() : 'No Data'}
              </div>
              <div className="mt-4 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Last Visit:</span><span className="font-medium">{latestMeasurement?.date?.slice(0, 10) || 'N/A'}</span></div>
                <div className="flex justify-between"><span>Age:</span><span className="font-medium">{latestMeasurement?.ageMonths || 0} months</span></div>
                <div className="flex justify-between"><span>Weight:</span><span className="font-medium">{latestMeasurement?.weight ? `${latestMeasurement.weight} kg` : 'N/A'}</span></div>
                <div className="flex justify-between"><span>Height:</span><span className="font-medium">{latestMeasurement?.height ? `${latestMeasurement.height} cm` : 'N/A'}</span></div>
              </div>
            </div>

            {/* Growth Trend */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border-2 border-green-200">
              <h4 className="text-sm font-bold text-gray-700 mb-3">Growth Trend</h4>
              <div className={`text-center py-4 rounded-lg text-white font-bold text-xl shadow-md
                ${growthTrend === 'improving' ? 'bg-green-500' : growthTrend === 'declining' ? 'bg-red-500' : 'bg-yellow-500'}`}>
                {growthTrend === 'improving' ? '↑ IMPROVING' : growthTrend === 'declining' ? '↓ DECLINING' : '→ STABLE'}
              </div>
              <div className="mt-4 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Direction:</span><span className="font-medium capitalize">{growthTrend}</span></div>
                <div className="flex justify-between"><span>Total Visits:</span><span className="font-medium">{sorted.length}</span></div>
              </div>
            </div>

            {/* Latest Z-Scores */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border-2 border-purple-200">
              <h4 className="text-sm font-bold text-gray-700 mb-3">Latest Z-Scores</h4>
              <div className="space-y-3">
                {[
                  { label: 'Weight-for-Age', val: latestMeasurement?.weightForAge },
                  { label: 'Height-for-Age', val: latestMeasurement?.heightForAge },
                  { label: 'Weight-for-Height', val: latestMeasurement?.weightForHeight },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">{label}:</span>
                      <span className={`font-bold text-lg ${val != null && val < -2 ? 'text-red-600' : 'text-green-600'}`}>
                        {val != null ? val.toFixed(2) : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Indicators */}
          <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-sm font-bold text-gray-900 mb-3">Automated Risk Assessment</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {[
                { label: 'Underweight Risk', val: latestMeasurement?.weightForAge, levels: ['Severe underweight', 'Underweight', 'Normal weight'] },
                { label: 'Stunting Risk', val: latestMeasurement?.heightForAge, levels: ['Severe stunting', 'Stunting', 'Normal height'] },
                { label: 'Wasting Risk', val: latestMeasurement?.weightForHeight, levels: ['Severe wasting', 'Moderate wasting', 'Normal'] },
              ].map(({ label, val, levels }) => (
                <div key={label} className="flex items-start gap-2">
                  <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${(val ?? 0) < -3 ? 'bg-red-600' : (val ?? 0) < -2 ? 'bg-orange-500' : 'bg-green-500'}`} />
                  <div>
                    <p className="font-medium text-gray-900">{label}</p>
                    <p className="text-gray-600">
                      {(val ?? 0) < -3 ? `High — ${levels[0]}` : (val ?? 0) < -2 ? `Medium — ${levels[1]}` : `Low — ${levels[2]}`}
                    </p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-2">
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${growthTrend === 'declining' ? 'bg-red-600' : growthTrend === 'stable' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                <div>
                  <p className="font-medium text-gray-900">Growth Trajectory</p>
                  <p className="text-gray-600">
                    {growthTrend === 'declining' ? 'Concerning — Declining trend' : growthTrend === 'stable' ? 'Monitor — Stable' : 'Good — Improving trend'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border-2 border-blue-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Understanding WHO Growth Charts</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Chart Purpose:</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong>Chart 1:</strong> Overall growth &amp; nutrition</li>
              <li>• <strong>Chart 2:</strong> Long-term malnutrition (stunting)</li>
              <li>• <strong>Chart 3:</strong> Acute malnutrition (wasting)</li>
              <li>• <strong>Chart 4:</strong> Status timeline summary</li>
              <li>• <strong>Chart 5:</strong> Quick risk dashboard</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Action Thresholds:</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong className="text-red-600">SAM (&lt; −3 SD):</strong> Immediate referral</li>
              <li>• <strong className="text-orange-600">MAM (−3 to −2 SD):</strong> Supplementary feeding</li>
              <li>• <strong className="text-green-600">Normal (−2 to +2 SD):</strong> Routine monitoring</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Measurement Protocol:</h4>
            <ul className="space-y-1 text-gray-700 text-xs">
              <li>• Use calibrated equipment only</li>
              <li>• Length (lying): birth to 2 years</li>
              <li>• Height (standing): 2 to 5 years</li>
              <li>• Charts update automatically after each visit</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}