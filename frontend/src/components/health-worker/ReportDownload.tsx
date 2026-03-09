import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const data = [
  { age: 0, weight: 3.5 },
  { age: 1, weight: 4.5 },
  { age: 2, weight: 5.5 },
  { age: 3, weight: 6.5 },
  { age: 4, weight: 7.5 },
  { age: 5, weight: 8.5 },
  { age: 6, weight: 9.5 },
  { age: 7, weight: 10.5 },
  { age: 8, weight: 11.5 },
  { age: 9, weight: 12.5 },
  { age: 10, weight: 13.5 },
  { age: 11, weight: 14.5 },
  { age: 12, weight: 15.5 },
];

const WeightForAgeChart = () => {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={data}
        margin={{ top: 20, right: 40, left: 20, bottom: 100 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="age"
          label={{
            value: 'Age (months)',
            position: 'insideBottom',
            offset: -20,
            style: { fontWeight: 'bold', fontSize: 13 },
          }}
        />
        <YAxis />
        <Tooltip />
        <Legend
          wrapperStyle={{ fontSize: 12, marginTop: 50, paddingTop: 14 }}
          verticalAlign="bottom"
          align="center"
          iconType="line"
        />
        <Line type="monotone" dataKey="weight" stroke="#8884d8" activeDot={{ r: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default WeightForAgeChart;