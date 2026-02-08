import React from 'react';
import { User, MapPin, Calendar, AlertTriangle, TrendingUp, Activity, Download, Printer } from 'lucide-react';
import { ChildData } from '../App';
import { RiskBadge } from './RiskBadge';
import { GrowthChart } from './GrowthChart';

interface ChildProfileProps {
  child: ChildData;
}

export function ChildProfile({ child }: ChildProfileProps) {
  const wfaData = child.measurements.map(m => ({
    ageMonths: m.ageMonths,
    value: m.wfa
  })).reverse();

  const hfaData = child.measurements.map(m => ({
    ageMonths: m.ageMonths,
    value: m.hfa
  })).reverse();

  const wfhData = child.measurements.map(m => ({
    ageMonths: m.ageMonths,
    value: m.wfh
  })).reverse();

  const handleDownloadReport = () => {
    window.print();
  };

  const handleExportData = () => {
    // Create CSV data
    const csvData = [
      ['Child Health Record Export'],
      [''],
      ['Child Information'],
      ['Child ID', child.id],
      ['Name', child.name],
      ['Age', `${child.age.years} Years : ${child.age.months} Months`],
      ['Sex', child.sex],
      ['Clinic', child.clinic],
      ['Area', child.area],
      [''],
      ['Current Status'],
      ['Classification', child.currentStatus.classification],
      ['Confidence', `${child.currentStatus.confidence}%`],
      ['Underweight', child.currentStatus.underweight ? 'Yes' : 'No'],
      ['Stunting', child.currentStatus.stunting ? 'Yes' : 'No'],
      ['Wasting', child.currentStatus.wasting ? 'Yes' : 'No'],
      [''],
      ['Measurement History'],
      ['Date', 'Age (Months)', 'Weight (kg)', 'Height (cm)', 'WFA Z-Score', 'HFA Z-Score', 'WFH Z-Score', 'Decision'],
      ...child.measurements.map(m => [
        m.date,
        m.ageMonths,
        m.weight,
        m.height,
        m.wfa.toFixed(2),
        m.hfa.toFixed(2),
        m.wfh.toFixed(2),
        m.decision
      ])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${child.id}_health_record_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with Download Buttons - Hidden in print */}
      <div className="mb-6 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-gray-900 mb-1">Child Profile</h1>
            <p className="text-gray-600">Child Health ID: {child.id}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadReport}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors border-2 border-blue-700"
            >
              <Download className="w-5 h-5" />
              <span>Download Health Record</span>
            </button>
            <button
              onClick={handleExportData}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors border-2 border-green-700"
            >
              <Download className="w-5 h-5" />
              <span>Export Data (CSV)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Print Header - Only visible in print */}
      <div className="hidden print:block mb-8">
        <div className="text-center border-b-4 border-blue-600 pb-6 mb-6">
          <h1 className="text-gray-900 mb-2">DIGITAL HEALTH RECORD</h1>
          <h2 className="text-gray-700 mb-1">Child Nutrition Risk Assessment System</h2>
          <p className="text-gray-600">Ministry of Health - Sri Lanka</p>
          <p className="text-gray-500 text-sm mt-2">Generated: {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* Basic Details Card */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-6 print:border-4">
        <h2 className="text-gray-900 mb-5">Child Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <User className="w-5 h-5 print:hidden" />
              <span>Name</span>
            </div>
            <p className="text-gray-900">{child.name}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Calendar className="w-5 h-5 print:hidden" />
              <span>Age</span>
            </div>
            <p className="text-gray-900">{child.age.years} Years : {child.age.months} Months</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <User className="w-5 h-5 print:hidden" />
              <span>Sex</span>
            </div>
            <p className="text-gray-900">{child.sex}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <MapPin className="w-5 h-5 print:hidden" />
              <span>Clinic / Area</span>
            </div>
            <p className="text-gray-900">{child.clinic}</p>
            <p className="text-gray-600">{child.area}</p>
          </div>
        </div>
      </div>

      {/* VERY PROMINENT Current Risk Status Card */}
      <div className={`rounded-xl p-8 mb-6 border-4 ${
        child.currentStatus.classification === 'SAM' 
          ? 'bg-[#E74C3C]/5 border-[#E74C3C]' 
          : child.currentStatus.classification === 'MAM'
          ? 'bg-[#F1C40F]/5 border-[#F1C40F]'
          : 'bg-[#2ECC71]/5 border-[#2ECC71]'
      }`}>
        <div className="mb-6">
          <h2 className="text-gray-900 mb-4">Current Nutritional Status</h2>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
            <RiskBadge classification={child.currentStatus.classification} size="large" />
            <div>
              <p className="text-gray-700">
                AI Model Confidence: <span className="text-gray-900">{child.currentStatus.confidence}%</span>
              </p>
            </div>
          </div>
        </div>

        {/* Risk Details */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-6">
          <h3 className="text-gray-900 mb-4">Risk Indicators</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-700">Underweight (WFA)</span>
              <span className={`px-3 py-1 rounded-lg ${child.currentStatus.underweight ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                {child.currentStatus.underweight ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-700">Stunting (HFA)</span>
              <span className={`px-3 py-1 rounded-lg ${child.currentStatus.stunting ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                {child.currentStatus.stunting ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-700">Wasting (WFH)</span>
              <span className={`px-3 py-1 rounded-lg ${child.currentStatus.wasting ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                {child.currentStatus.wasting ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Required Messages */}
        {child.currentStatus.classification === 'SAM' && (
          <div className="bg-[#E74C3C] text-white p-6 rounded-xl flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 flex-shrink-0 mt-1 print:hidden" />
            <div>
              <p className="mb-2">⚠️ IMMEDIATE REFERRAL REQUIRED</p>
              <p className="text-sm opacity-90">
                This child has Severe Acute Malnutrition (SAM). Immediate referral to a specialized nutrition treatment facility is mandatory. Initiate SAM management protocol and emergency nutritional support immediately.
              </p>
            </div>
          </div>
        )}

        {child.currentStatus.classification === 'MAM' && (
          <div className="bg-[#F1C40F] text-gray-900 p-6 rounded-xl flex items-start gap-4">
            <TrendingUp className="w-8 h-8 flex-shrink-0 mt-1 print:hidden" />
            <div>
              <p className="mb-2">⚠️ NUTRITION COUNSELLING RECOMMENDED</p>
              <p className="text-sm opacity-90">
                This child has Moderate Acute Malnutrition (MAM). Provide comprehensive nutritional counseling to caregivers, initiate supplementary feeding program, and schedule follow-up assessment within 2 weeks.
              </p>
            </div>
          </div>
        )}

        {child.currentStatus.classification === 'Normal' && (
          <div className="bg-[#2ECC71] text-white p-6 rounded-xl flex items-start gap-4">
            <Activity className="w-8 h-8 flex-shrink-0 mt-1 print:hidden" />
            <div>
              <p className="mb-2">✓ NORMAL NUTRITIONAL STATUS</p>
              <p className="text-sm opacity-90">
                This child has normal nutritional status. Continue routine monitoring and growth tracking. Next scheduled visit in 1 month. Encourage continued healthy feeding practices.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Growth Charts Section - Optimized for print */}
      <div className="mb-6 print:page-break-before">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-7 h-7 text-gray-700 print:hidden" />
          <h2 className="text-gray-900">WHO Growth Standard Charts</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 print:gap-8">
          <GrowthChart 
            data={wfaData}
            title="Weight-for-Age (WFA) Z-Score"
            yAxisLabel="Z-Score"
            color="#3B82F6"
          />
          <div className="print:page-break-before">
            <GrowthChart 
              data={hfaData}
              title="Height-for-Age (HFA) Z-Score"
              yAxisLabel="Z-Score"
              color="#10B981"
            />
          </div>
          <div className="print:page-break-before">
            <GrowthChart 
              data={wfhData}
              title="Weight-for-Height (WFH) Z-Score"
              yAxisLabel="Z-Score"
              color="#8B5CF6"
            />
          </div>
        </div>
      </div>

      {/* Previous Records Table */}
      <div className="bg-white rounded-xl border-2 border-gray-200 print:page-break-before print:border-4">
        <div className="p-6 border-b-2 border-gray-200">
          <h2 className="text-gray-900">Clinic Visit History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">Date</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">Age (Y:M)</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">Weight (kg)</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">Height (cm)</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">WFA Z</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">HFA Z</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">WFH Z</th>
                <th className="px-6 py-4 text-left text-gray-900 border-b-2 border-gray-200">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-200">
              {child.measurements.map((measurement, index) => {
                const years = Math.floor(measurement.ageMonths / 12);
                const months = measurement.ageMonths % 12;
                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900">{measurement.date}</td>
                    <td className="px-6 py-4 text-gray-900">{years}:{months}</td>
                    <td className="px-6 py-4 text-gray-900">{measurement.weight}</td>
                    <td className="px-6 py-4 text-gray-900">{measurement.height}</td>
                    <td className={`px-6 py-4 ${
                      measurement.wfa < -2 ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {measurement.wfa.toFixed(1)}
                    </td>
                    <td className={`px-6 py-4 ${
                      measurement.hfa < -2 ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {measurement.hfa.toFixed(1)}
                    </td>
                    <td className={`px-6 py-4 ${
                      measurement.wfh < -2 ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {measurement.wfh.toFixed(1)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`${
                        measurement.decision.includes('SAM') 
                          ? 'text-[#E74C3C]' 
                          : measurement.decision.includes('MAM')
                          ? 'text-[#F1C40F]'
                          : 'text-[#2ECC71]'
                      }`}>
                        {measurement.decision}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Footer - Only visible in print */}
      <div className="hidden print:block mt-8 pt-6 border-t-2 border-gray-300">
        <div className="text-center text-gray-600 text-sm">
          <p>This is an official digital health record from the Child Nutrition Risk Assessment System</p>
          <p className="mt-1">Ministry of Health - Sri Lanka | PHM / MOH Clinic Network</p>
          <p className="mt-2 text-gray-500">Record ID: {child.id} | Generated: {new Date().toISOString()}</p>
        </div>
      </div>
    </div>
  );
}