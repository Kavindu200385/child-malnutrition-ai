import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, LineChart } from 'recharts';

interface Measurement {
  ageMonths: number;
  weight: number;
  height: number;
  date: string;
  weightForAge: number;
  heightForAge: number;
  weightForHeight: number;
  riskLevel: 'normal' | 'mam' | 'sam';
}

interface WHOGrowthChartsProps {
  measurements: Measurement[];
  childGender: 'male' | 'female';
}

export function WHOGrowthCharts({ measurements, childGender }: WHOGrowthChartsProps) {
  // Sort measurements by age (oldest to newest)
  const sortedMeasurements = [...measurements].sort((a, b) => a.ageMonths - b.ageMonths);

  // Generate WHO standard reference curves using simplified approximations
  // In production, use actual WHO LMS tables
  const generateWHOWeightForAge = () => {
    const data = [];
    for (let age = 0; age <= 60; age += 1) {
      // Simplified WHO curves - different for boys/girls
      const genderFactor = childGender === 'male' ? 1.0 : 0.95;
      const median = (3.3 + (age * 0.32)) * genderFactor;
      data.push({
        age,
        plus3sd: median * 1.45,
        plus2sd: median * 1.30,
        plus1sd: median * 1.15,
        median,
        minus1sd: median * 0.85,
        minus2sd: median * 0.70,
        minus3sd: median * 0.55,
      });
    }
    return data;
  };

  const generateWHOLengthHeightForAge = () => {
    const data = [];
    for (let age = 0; age <= 60; age += 1) {
      const genderFactor = childGender === 'male' ? 1.0 : 0.98;
      const median = age <= 24 
        ? (49.5 + (age * 2.1)) * genderFactor  // Length (lying)
        : (77 + ((age - 24) * 0.95)) * genderFactor;  // Height (standing)
      
      data.push({
        age,
        plus3sd: median * 1.12,
        plus2sd: median * 1.08,
        plus1sd: median * 1.04,
        median,
        minus1sd: median * 0.96,
        minus2sd: median * 0.92,
        minus3sd: median * 0.88,
      });
    }
    return data;
  };

  const generateWHOWeightForLengthHeight = () => {
    const data = [];
    // Birth to 2 years: Length 45-110 cm
    // 2 to 5 years: Height 65-120 cm
    for (let length = 45; length <= 120; length += 0.5) {
      const median = 2.5 + ((length - 45) * 0.13);
      data.push({
        length: parseFloat(length.toFixed(1)),
        plus3sd: median * 1.55,
        plus2sd: median * 1.35,
        plus1sd: median * 1.15,
        median,
        minus1sd: median * 0.85,
        minus2sd: median * 0.70,
        minus3sd: median * 0.55,
      });
    }
    return data;
  };

  // Merge child's measurements with WHO curves
  const weightForAgeData = generateWHOWeightForAge().map(point => {
    const measurement = sortedMeasurements.find(m => Math.abs(m.ageMonths - point.age) < 0.5);
    return {
      ...point,
      childWeight: measurement?.weight,
      date: measurement?.date,
    };
  });

  // Split length and height data for separate charts
  const lengthForAgeData = generateWHOLengthHeightForAge()
    .filter(point => point.age <= 24)
    .map(point => {
      const measurement = sortedMeasurements.find(m => m.ageMonths <= 24 && Math.abs(m.ageMonths - point.age) < 0.5);
      return {
        ...point,
        childHeight: measurement?.height,
        date: measurement?.date,
      };
    });

  const heightForAgeData = generateWHOLengthHeightForAge()
    .filter(point => point.age >= 24)
    .map(point => {
      const measurement = sortedMeasurements.find(m => m.ageMonths >= 24 && Math.abs(m.ageMonths - point.age) < 0.5);
      return {
        ...point,
        childHeight: measurement?.height,
        date: measurement?.date,
      };
    });

  const weightForLengthHeightData = generateWHOWeightForLengthHeight().map(point => {
    const measurement = sortedMeasurements.find(m => 
      Math.abs(m.height - point.length) < 1
    );
    return {
      ...point,
      childWeight: measurement?.weight,
      date: measurement?.date,
    };
  });

  // Chart 4: Nutritional Status Timeline - Auto-generated from measurements
  const nutritionalStatusData = sortedMeasurements.map(m => ({
    date: m.date,
    age: m.ageMonths,
    status: m.riskLevel === 'sam' ? 'SAM' : m.riskLevel === 'mam' ? 'MAM' : 'Normal',
    color: m.riskLevel === 'sam' ? '#E74C3C' : m.riskLevel === 'mam' ? '#F39C12' : '#2ECC71',
    wfa: m.weightForAge,
    hfa: m.heightForAge,
    wfh: m.weightForHeight,
  }));

  // Chart 5: Growth Trend - Auto-calculated
  const latestMeasurement = sortedMeasurements[sortedMeasurements.length - 1];
  const previousMeasurement = sortedMeasurements[sortedMeasurements.length - 2];
  
  let growthTrend = 'stable';
  if (previousMeasurement) {
    const wfaChange = latestMeasurement.weightForAge - previousMeasurement.weightForAge;
    if (wfaChange > 0.3) growthTrend = 'improving';
    else if (wfaChange < -0.3) growthTrend = 'declining';
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border-2 border-blue-500 rounded-lg shadow-lg p-3" style={{ minWidth: '180px' }}>
          <p className="text-xs font-bold text-gray-900 mb-1">Measurement Details</p>
          {data.date && <p className="text-xs text-gray-700">Date: {data.date}</p>}
          {data.age !== undefined && <p className="text-xs text-gray-700">Age: {data.age} months</p>}
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200 p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2">WHO Child Growth Standards</h2>
        <p className="text-sm text-gray-700">
          Following Sri Lankan Child Health Development Record - {childGender === 'male' ? 'Boys' : 'Girls'} (0-5 Years)
        </p>
        <p className="text-xs text-gray-600 mt-1">
          All charts automatically update when new measurements are added • Charts 4 & 5 are auto-generated
        </p>
      </div>

      {/* CHART 1: Weight-for-Age (Birth to 5 Years - Single Combined Chart) */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white">Chart 1: Weight-for-Age</h3>
          <p className="text-sm text-blue-50">Birth to 5 Years (0-60 months) - Combined Standards</p>
        </div>
        
        {/* Legend */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-red-600 border border-red-700"></div>
              <span className="font-medium">Severe Underweight (&lt; -3 SD)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-orange-500 border border-orange-600"></div>
              <span className="font-medium">Underweight (-3 to -2 SD)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-green-100 border border-green-300"></div>
              <span className="font-medium">Normal (-2 to +2 SD)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-1 bg-blue-600"></div>
              <span className="font-bold text-blue-600">Child's Growth</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart data={weightForAgeData} margin={{ top: 20, right: 40, left: 20, bottom: 60 }}>
              {/* Fine grid lines matching WHO cards */}
              <CartesianGrid strokeDasharray="0" stroke="#d1d5db" strokeWidth={0.5} />
              
              {/* Colored zones - gradients for smooth transition */}
              <defs>
                <linearGradient id="severeZone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#DC2626" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#DC2626" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="moderateZone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F97316" stopOpacity={0.25} />
                </linearGradient>
                <linearGradient id="normalZone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#86EFAC" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#86EFAC" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              
              {/* Fill zones */}
              <Area type="monotone" dataKey="minus3sd" fill="url(#severeZone)" stroke="none" />
              <Area type="monotone" dataKey="minus2sd" fill="url(#moderateZone)" stroke="none" />
              <Area type="monotone" dataKey="plus2sd" fill="url(#normalZone)" stroke="none" />
              
              {/* WHO Reference Lines - thin and professional */}
              <Line type="monotone" dataKey="plus3sd" stroke="#10B981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="+3 SD" />
              <Line type="monotone" dataKey="plus2sd" stroke="#10B981" strokeWidth={1.5} dot={false} name="+2 SD" />
              <Line type="monotone" dataKey="median" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" />
              <Line type="monotone" dataKey="minus2sd" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="-2 SD" />
              <Line type="monotone" dataKey="minus3sd" stroke="#DC2626" strokeWidth={1.5} dot={false} name="-3 SD" />
              
              {/* Child's actual measurements - bold blue line with dots */}
              <Line 
                type="monotone" 
                dataKey="childWeight" 
                stroke="#2563EB" 
                strokeWidth={3} 
                dot={{ fill: '#2563EB', r: 6, strokeWidth: 2, stroke: '#1E40AF' }} 
                name="Child's Weight (kg)" 
                connectNulls 
              />
              
              {/* Age marker at 24 months */}
              <ReferenceLine x={24} stroke="#6B7280" strokeWidth={1} strokeDasharray="5 5" label={{ value: '2 Years', position: 'top', fill: '#6B7280', fontSize: 11 }} />
              
              <XAxis 
                dataKey="age" 
                label={{ value: 'Age (months)', position: 'insideBottom', offset: -15, style: { fontWeight: 'bold', fontSize: 13 } }}
                tick={{ fontSize: 11 }}
                domain={[0, 60]}
                ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24, 30, 36, 42, 48, 54, 60]}
              />
              <YAxis 
                label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', style: { fontWeight: 'bold', fontSize: 13 } }}
                tick={{ fontSize: 11 }}
                domain={[0, 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
                iconType="line"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CHART 2: Length/Height-for-Age (Two Separate Charts Side by Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 2a: Length-for-Age (Birth to 2 Years) */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4">
            <h3 className="text-lg font-bold text-white">Chart 2a: Length-for-Age</h3>
            <p className="text-sm text-green-50">Birth to 2 Years (0-24 months) - Lying Down</p>
          </div>
          
          {/* Legend */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-600 border border-red-700"></div>
                <span className="font-medium">Severe Stunting</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 border border-orange-600"></div>
                <span className="font-medium">Stunting</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 border border-green-300"></div>
                <span className="font-medium">Normal</span>
              </div>
            </div>
          </div>

          <div className="p-6">
            <ResponsiveContainer width="100%" height={450}>
              <ComposedChart data={lengthForAgeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="0" stroke="#d1d5db" strokeWidth={0.5} />
                
                {/* Colored zones */}
                <Area type="monotone" dataKey="minus3sd" fill="url(#severeZone)" stroke="none" />
                <Area type="monotone" dataKey="minus2sd" fill="url(#moderateZone)" stroke="none" />
                <Area type="monotone" dataKey="plus2sd" fill="url(#normalZone)" stroke="none" />
                
                {/* WHO Reference Lines */}
                <Line type="monotone" dataKey="plus3sd" stroke="#10B981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="+3 SD" />
                <Line type="monotone" dataKey="plus2sd" stroke="#10B981" strokeWidth={1.5} dot={false} name="+2 SD" />
                <Line type="monotone" dataKey="median" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" />
                <Line type="monotone" dataKey="minus2sd" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="-2 SD" />
                <Line type="monotone" dataKey="minus3sd" stroke="#DC2626" strokeWidth={1.5} dot={false} name="-3 SD" />
                
                {/* Child's measurements - simple line with dots */}
                <Line 
                  type="monotone" 
                  dataKey="childHeight" 
                  stroke="#10B981" 
                  strokeWidth={3} 
                  dot={{ fill: '#10B981', r: 6, strokeWidth: 2, stroke: '#059669' }} 
                  name="Child's Length (cm)" 
                  connectNulls 
                />
                
                <XAxis 
                  dataKey="age" 
                  label={{ value: 'Age (months)', position: 'insideBottom', offset: -15, style: { fontWeight: 'bold', fontSize: 13 } }}
                  tick={{ fontSize: 11 }}
                  domain={[0, 24]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]}
                />
                <YAxis 
                  label={{ value: 'Length (cm)', angle: -90, position: 'insideLeft', style: { fontWeight: 'bold', fontSize: 13 } }}
                  tick={{ fontSize: 11 }}
                  domain={[40, 100]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }} iconType="line" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2b: Height-for-Age (2 to 5 Years) */}
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
            <h3 className="text-lg font-bold text-white">Chart 2b: Height-for-Age</h3>
            <p className="text-sm text-green-50">2 to 5 Years (24-60 months) - Standing</p>
          </div>
          
          {/* Legend */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-600 border border-red-700"></div>
                <span className="font-medium">Severe Stunting</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 border border-orange-600"></div>
                <span className="font-medium">Stunting</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 border border-green-300"></div>
                <span className="font-medium">Normal</span>
              </div>
            </div>
          </div>

          <div className="p-6">
            <ResponsiveContainer width="100%" height={450}>
              <ComposedChart data={heightForAgeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="0" stroke="#d1d5db" strokeWidth={0.5} />
                
                {/* Colored zones */}
                <Area type="monotone" dataKey="minus3sd" fill="url(#severeZone)" stroke="none" />
                <Area type="monotone" dataKey="minus2sd" fill="url(#moderateZone)" stroke="none" />
                <Area type="monotone" dataKey="plus2sd" fill="url(#normalZone)" stroke="none" />
                
                {/* WHO Reference Lines */}
                <Line type="monotone" dataKey="plus3sd" stroke="#10B981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="+3 SD" />
                <Line type="monotone" dataKey="plus2sd" stroke="#10B981" strokeWidth={1.5} dot={false} name="+2 SD" />
                <Line type="monotone" dataKey="median" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" />
                <Line type="monotone" dataKey="minus2sd" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="-2 SD" />
                <Line type="monotone" dataKey="minus3sd" stroke="#DC2626" strokeWidth={1.5} dot={false} name="-3 SD" />
                
                {/* Child's measurements - simple line with dots */}
                <Line 
                  type="monotone" 
                  dataKey="childHeight" 
                  stroke="#10B981" 
                  strokeWidth={3} 
                  dot={{ fill: '#10B981', r: 6, strokeWidth: 2, stroke: '#059669' }} 
                  name="Child's Height (cm)" 
                  connectNulls 
                />
                
                <XAxis 
                  dataKey="age" 
                  label={{ value: 'Age (months)', position: 'insideBottom', offset: -15, style: { fontWeight: 'bold', fontSize: 13 } }}
                  tick={{ fontSize: 11 }}
                  domain={[24, 60]}
                  ticks={[24, 28, 32, 36, 40, 44, 48, 52, 56, 60]}
                />
                <YAxis 
                  label={{ value: 'Height (cm)', angle: -90, position: 'insideLeft', style: { fontWeight: 'bold', fontSize: 13 } }}
                  tick={{ fontSize: 11 }}
                  domain={[75, 120]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }} iconType="line" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CHART 3: Weight-for-Length/Height (Combined Chart) */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white">Chart 3: Weight-for-Length / Weight-for-Height</h3>
          <p className="text-sm text-purple-50">
            0-2 Years: Weight-for-Length (45-110 cm) • 2-5 Years: Weight-for-Height (65-120 cm)
          </p>
        </div>
        
        {/* Legend */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-red-600 border border-red-700"></div>
              <span className="font-medium">Severe Wasting (&lt; -3 SD)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-orange-500 border border-orange-600"></div>
              <span className="font-medium">Moderate Wasting (-3 to -2 SD)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-green-100 border border-green-300"></div>
              <span className="font-medium">Normal (-2 to +2 SD)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-purple-200 border border-purple-400"></div>
              <span className="font-medium">Overweight (&gt; +2 SD)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-1 bg-purple-600"></div>
              <span className="font-bold text-purple-600">Child's Measurements</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart data={weightForLengthHeightData} margin={{ top: 20, right: 40, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="0" stroke="#d1d5db" strokeWidth={0.5} />
              
              {/* Colored zones */}
              <Area type="monotone" dataKey="minus3sd" fill="url(#severeZone)" stroke="none" />
              <Area type="monotone" dataKey="minus2sd" fill="url(#moderateZone)" stroke="none" />
              <Area type="monotone" dataKey="plus2sd" fill="url(#normalZone)" stroke="none" />
              
              {/* WHO Reference Lines */}
              <Line type="monotone" dataKey="plus3sd" stroke="#9333EA" strokeWidth={1} strokeDasharray="3 3" dot={false} name="+3 SD (Obese)" />
              <Line type="monotone" dataKey="plus2sd" stroke="#A855F7" strokeWidth={1.5} dot={false} name="+2 SD (Overweight)" />
              <Line type="monotone" dataKey="median" stroke="#7C3AED" strokeWidth={2.5} dot={false} name="Median" />
              <Line type="monotone" dataKey="minus2sd" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="-2 SD" />
              <Line type="monotone" dataKey="minus3sd" stroke="#DC2626" strokeWidth={1.5} dot={false} name="-3 SD" />
              
              {/* Child's measurements */}
              <Line 
                type="monotone" 
                dataKey="childWeight" 
                stroke="#9333EA" 
                strokeWidth={3} 
                dot={{ fill: '#9333EA', r: 6, strokeWidth: 2, stroke: '#7C3AED' }} 
                name="Child's Weight (kg)" 
                connectNulls 
              />
              
              <XAxis 
                dataKey="length" 
                label={{ value: 'Length / Height (cm)', position: 'insideBottom', offset: -15, style: { fontWeight: 'bold', fontSize: 13 } }}
                tick={{ fontSize: 11 }}
                type="number"
                domain={[45, 120]}
              />
              <YAxis 
                label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', style: { fontWeight: 'bold', fontSize: 13 } }}
                tick={{ fontSize: 11 }}
                domain={[0, 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} iconType="line" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CHART 4: Nutritional Status Summary Timeline (Auto-Generated) */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Chart 4: Nutritional Status Summary Timeline
            <span className="text-xs bg-white text-amber-600 px-2 py-1 rounded-full font-bold">AUTO-GENERATED</span>
          </h3>
          <p className="text-sm text-amber-50">
            Automatically derived from Charts 1, 2, and 3 • No manual input required
          </p>
        </div>

        <div className="p-6">
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>How it works:</strong> This timeline is automatically calculated using WHO Z-scores from Weight-for-Age, 
              Length/Height-for-Age, and Weight-for-Length/Height measurements. The nutritional classification updates 
              instantly when new measurements are added.
            </p>
          </div>

          {/* Timeline visualization */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm font-medium text-gray-700 border-b pb-2">
              <div className="w-24">Date</div>
              <div className="w-20">Age</div>
              <div className="flex-1">Nutritional Status</div>
              <div className="w-32 text-center">Z-Scores</div>
            </div>

            {nutritionalStatusData.map((entry, index) => (
              <div key={index} className="flex items-center gap-4 border-b border-gray-100 pb-3">
                <div className="w-24 text-sm text-gray-900 font-medium">{entry.date}</div>
                <div className="w-20 text-sm text-gray-600">{entry.age}m</div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-full h-8 rounded-lg flex items-center px-4 text-white font-bold text-sm shadow-sm"
                      style={{ backgroundColor: entry.color }}
                    >
                      {entry.status}
                    </div>
                  </div>
                </div>
                <div className="w-32 text-xs text-gray-600 space-y-0.5">
                  <div>WFA: {entry.wfa != null ? entry.wfa.toFixed(2) : '—'}</div>
                  <div>HFA: {entry.hfa != null ? entry.hfa.toFixed(2) : '—'}</div>
                  <div>WFH: {entry.wfh != null ? entry.wfh.toFixed(2) : '—'}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary chart */}
          <div className="mt-8">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={nutritionalStatusData} margin={{ top: 10, right: 40, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="age" 
                  label={{ value: 'Age (months)', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
                  tick={{ fontSize: 10 }}
                />
                <YAxis 
                  label={{ value: 'Z-Score', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                  tick={{ fontSize: 10 }}
                  domain={[-4, 3]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="line" wrapperStyle={{ fontSize: '11px' }} />
                
                {/* Reference lines for thresholds */}
                <ReferenceLine y={-3} stroke="#DC2626" strokeWidth={1.5} strokeDasharray="5 5" label={{ value: '-3 SD', fill: '#DC2626', fontSize: 10 }} />
                <ReferenceLine y={-2} stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="5 5" label={{ value: '-2 SD', fill: '#F59E0B', fontSize: 10 }} />
                <ReferenceLine y={0} stroke="#059669" strokeWidth={1.5} label={{ value: 'Median', fill: '#059669', fontSize: 10 }} />
                
                <Line type="monotone" dataKey="wfa" stroke="#2563EB" strokeWidth={2} dot={{ r: 4 }} name="Weight-for-Age" />
                <Line type="monotone" dataKey="hfa" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} name="Height-for-Age" />
                <Line type="monotone" dataKey="wfh" stroke="#9333EA" strokeWidth={2} dot={{ r: 4 }} name="Weight-for-Height" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CHART 5: Growth Trend Overview (Auto-Generated Dashboard) */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Chart 5: Growth Trend Overview & Risk Dashboard
            <span className="text-xs bg-white text-indigo-600 px-2 py-1 rounded-full font-bold">AUTO-GENERATED</span>
          </h3>
          <p className="text-sm text-indigo-50">
            Fully calculated from Charts 1-3 • Read-only summary of child's growth trajectory
          </p>
        </div>

        <div className="p-6">
          <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>Automatic Analysis:</strong> This dashboard provides a quick overview of the child's growth status, 
              trends, and risk indicators. All data is automatically calculated from anthropometric measurements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Current Status */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border-2 border-blue-200">
              <h4 className="text-sm font-bold text-gray-700 mb-3">Current Nutritional Status</h4>
              <div 
                className="text-center py-4 rounded-lg text-white font-bold text-xl shadow-md"
                style={{ backgroundColor: latestMeasurement ? 
                  (latestMeasurement.riskLevel === 'sam' ? '#E74C3C' : 
                   latestMeasurement.riskLevel === 'mam' ? '#F39C12' : '#2ECC71') : '#6B7280'
                }}
              >
                {latestMeasurement ? 
                  (latestMeasurement.riskLevel === 'sam' ? 'SAM' : 
                   latestMeasurement.riskLevel === 'mam' ? 'MAM' : 'NORMAL') : 'No Data'
                }
              </div>
              <div className="mt-4 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Last Visit:</span>
                  <span className="font-medium">{latestMeasurement?.date || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Age:</span>
                  <span className="font-medium">{latestMeasurement?.ageMonths || 0} months</span>
                </div>
              </div>
            </div>

            {/* Growth Trend */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border-2 border-green-200">
              <h4 className="text-sm font-bold text-gray-700 mb-3">Growth Trend</h4>
              <div className={`text-center py-4 rounded-lg text-white font-bold text-xl shadow-md ${
                growthTrend === 'improving' ? 'bg-green-500' : 
                growthTrend === 'declining' ? 'bg-red-500' : 'bg-yellow-500'
              }`}>
                {growthTrend === 'improving' ? '↑ IMPROVING' : 
                 growthTrend === 'declining' ? '↓ DECLINING' : '→ STABLE'}
              </div>
              <div className="mt-4 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Direction:</span>
                  <span className="font-medium capitalize">{growthTrend}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Visits:</span>
                  <span className="font-medium">{sortedMeasurements.length}</span>
                </div>
              </div>
            </div>

            {/* Latest Z-Scores */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border-2 border-purple-200">
              <h4 className="text-sm font-bold text-gray-700 mb-3">Latest Z-Scores</h4>
              <div className="space-y-3">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Weight-for-Age:</span>
                    <span className={`font-bold text-lg ${
                      latestMeasurement && latestMeasurement.weightForAge < -2 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {latestMeasurement?.weightForAge.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Height-for-Age:</span>
                    <span className={`font-bold text-lg ${
                      latestMeasurement && latestMeasurement.heightForAge < -2 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {latestMeasurement?.heightForAge.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Weight-for-Height:</span>
                    <span className={`font-bold text-lg ${
                      latestMeasurement && latestMeasurement.weightForHeight < -2 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {latestMeasurement?.weightForHeight.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Indicators */}
          <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-sm font-bold text-gray-900 mb-3">Automated Risk Assessment</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="flex items-start gap-2">
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${
                  latestMeasurement && latestMeasurement.weightForAge < -3 ? 'bg-red-600' :
                  latestMeasurement && latestMeasurement.weightForAge < -2 ? 'bg-orange-500' : 'bg-green-500'
                }`}></div>
                <div>
                  <p className="font-medium text-gray-900">Underweight Risk</p>
                  <p className="text-gray-600">
                    {latestMeasurement && latestMeasurement.weightForAge < -3 ? 'High - Severe underweight' :
                     latestMeasurement && latestMeasurement.weightForAge < -2 ? 'Medium - Underweight' : 'Low - Normal weight'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${
                  latestMeasurement && latestMeasurement.heightForAge < -3 ? 'bg-red-600' :
                  latestMeasurement && latestMeasurement.heightForAge < -2 ? 'bg-orange-500' : 'bg-green-500'
                }`}></div>
                <div>
                  <p className="font-medium text-gray-900">Stunting Risk</p>
                  <p className="text-gray-600">
                    {latestMeasurement && latestMeasurement.heightForAge < -3 ? 'High - Severe stunting' :
                     latestMeasurement && latestMeasurement.heightForAge < -2 ? 'Medium - Stunting' : 'Low - Normal height'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${
                  latestMeasurement && latestMeasurement.weightForHeight < -3 ? 'bg-red-600' :
                  latestMeasurement && latestMeasurement.weightForHeight < -2 ? 'bg-orange-500' : 'bg-green-500'
                }`}></div>
                <div>
                  <p className="font-medium text-gray-900">Wasting Risk</p>
                  <p className="text-gray-600">
                    {latestMeasurement && latestMeasurement.weightForHeight < -3 ? 'High - Severe wasting' :
                     latestMeasurement && latestMeasurement.weightForHeight < -2 ? 'Medium - Moderate wasting' : 'Low - Normal'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${
                  growthTrend === 'declining' ? 'bg-red-600' :
                  growthTrend === 'stable' ? 'bg-yellow-500' : 'bg-green-500'
                }`}></div>
                <div>
                  <p className="font-medium text-gray-900">Growth Trajectory</p>
                  <p className="text-gray-600">
                    {growthTrend === 'declining' ? 'Concerning - Declining trend' :
                     growthTrend === 'stable' ? 'Monitor - Stable but watch' : 'Good - Improving trend'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Educational Footer */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border-2 border-blue-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Understanding WHO Growth Charts - Sri Lankan Standards</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Chart Purpose:</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong>Chart 1:</strong> Overall growth & nutrition</li>
              <li>• <strong>Chart 2:</strong> Long-term malnutrition (stunting)</li>
              <li>• <strong>Chart 3:</strong> Acute malnutrition (wasting)</li>
              <li>• <strong>Chart 4:</strong> Status timeline summary</li>
              <li>• <strong>Chart 5:</strong> Quick risk dashboard</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Action Thresholds:</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong className="text-red-600">SAM (&lt; -3 SD):</strong> Immediate referral</li>
              <li>• <strong className="text-orange-600">MAM (-3 to -2 SD):</strong> Supplementary feeding</li>
              <li>• <strong className="text-green-600">Normal (-2 to +2 SD):</strong> Routine monitoring</li>
              <li>• <strong className="text-purple-600">Overweight (&gt; +2 SD):</strong> Diet counseling</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Measurement Protocol:</h4>
            <ul className="space-y-1 text-gray-700 text-xs">
              <li>• Use calibrated equipment only</li>
              <li>• Length (lying): birth to 2 years</li>
              <li>• Height (standing): 2 to 5 years</li>
              <li>• Plot immediately after measurement</li>
              <li>• Charts 4 & 5 update automatically</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}