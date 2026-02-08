import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface GrowthChartProps {
  data: Array<{
    ageMonths: number;
    value: number;
  }>;
  title: string;
  yAxisLabel: string;
  color: string;
}

export function GrowthChart({ data, title, yAxisLabel, color }: GrowthChartProps) {
  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
      <h3 className="text-gray-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="ageMonths" 
            label={{ value: 'Age (months)', position: 'insideBottom', offset: -5, style: { fill: '#374151' } }}
            stroke="#6b7280"
            tick={{ fill: '#374151' }}
          />
          <YAxis 
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', style: { fill: '#374151' } }}
            stroke="#6b7280"
            domain={[-4, 3]}
            tick={{ fill: '#374151' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'white', 
              border: '2px solid #e5e7eb',
              borderRadius: '0.75rem',
              padding: '0.75rem'
            }}
            labelStyle={{ color: '#111827', fontWeight: 500 }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '1rem' }}
          />
          
          {/* WHO Reference Lines */}
          <ReferenceLine 
            y={-3} 
            stroke="#E74C3C" 
            strokeWidth={2}
            strokeDasharray="5 5" 
            label={{ value: '-3 SD (Severe)', position: 'right', fill: '#E74C3C' }} 
          />
          <ReferenceLine 
            y={-2} 
            stroke="#F1C40F" 
            strokeWidth={2}
            strokeDasharray="5 5" 
            label={{ value: '-2 SD (Moderate)', position: 'right', fill: '#F1C40F' }} 
          />
          <ReferenceLine 
            y={0} 
            stroke="#2ECC71" 
            strokeWidth={2}
            strokeDasharray="3 3" 
            label={{ value: 'Median (Normal)', position: 'right', fill: '#2ECC71' }} 
          />
          <ReferenceLine 
            y={2} 
            stroke="#3B82F6" 
            strokeWidth={1}
            strokeDasharray="5 5" 
            label={{ value: '+2 SD', position: 'right', fill: '#3B82F6' }} 
          />
          
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={4}
            dot={{ fill: color, r: 6, strokeWidth: 2, stroke: 'white' }}
            name="Child Z-Score"
            activeDot={{ r: 8 }}
          />
        </LineChart>
      </ResponsiveContainer>
      
      {/* Legend */}
      <div className="mt-6 pt-4 border-t-2 border-gray-200">
        <p className="text-gray-600 text-sm mb-3">WHO Standard Reference Lines:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-1 bg-[#E74C3C] rounded"></div>
            <span className="text-gray-700">-3 SD: Severe</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-1 bg-[#F1C40F] rounded"></div>
            <span className="text-gray-700">-2 SD: Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-1 bg-[#2ECC71] rounded"></div>
            <span className="text-gray-700">0 SD: Normal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-1 bg-[#3B82F6] rounded"></div>
            <span className="text-gray-700">+2 SD: Above</span>
          </div>
        </div>
      </div>
    </div>
  );
}