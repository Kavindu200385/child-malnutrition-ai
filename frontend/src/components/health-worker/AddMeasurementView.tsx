import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, CheckCircle, AlertTriangle, Brain, TrendingUp, Calendar, FileText } from 'lucide-react';
import { nutritionistAPI, midwifeAPI, mohAPI, childrenAPI } from '../../services/api';
import { validateMeasurementForm } from '../../utils/measurementValidation';
import { STATUS_HELPER_TEXT } from '../../utils/statusDisplay';

interface AddMeasurementViewProps {
  user?: { role?: string } | null;
  selectedChildId: string | null;
  onBack: () => void;
  onSuccess: (childId: string) => void;
}

interface AIResults {
  childName: string;
  childId: string;
  date: string;
  weight: number;
  height: number;
  muac: number | null;
  muacStatus?: string;
  edemaStatus?: string;
  weightForAge: number;
  heightForAge: number;
  weightForHeight: number;
  currentNutritionalStatus: string;
  underweightStatus: string;
  stuntingStatus: string;
  wastingStatus: string;
  recommendations: string[];
  nutritionalGuidance: string[];
  followUp: string;
  alerts: string[];
}

export function AddMeasurementView({ user, selectedChildId, onBack, onSuccess }: AddMeasurementViewProps) {
  const isNutritionist = user?.role === 'nutritionist';
  const isMoh = user?.role === 'moh' || user?.role === 'amoh';
  const [childId, setChildId] = useState(selectedChildId || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [muac, setMuac] = useState('');
  const [edema, setEdema] = useState('');
  const [measurementMethod, setMeasurementMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [aiResults, setAiResults] = useState<AIResults | null>(null);
  const [referredChildren, setReferredChildren] = useState<{ child: any }[]>([]);
  const [midwifeChildren, setMidwifeChildren] = useState<any[]>([]);
  const [nutLoading, setNutLoading] = useState(false);
  const [midwifeLoading, setMidwifeLoading] = useState(false);
  const [nutError, setNutError] = useState('');
  const [measurementWarnings, setMeasurementWarnings] = useState<string[]>([]);
  const [nutSuccess, setNutSuccess] = useState(false);

  // Searchable combobox state
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNutritionist) {
      nutritionistAPI.referredChildren()
        .then((res) => { if (res.data?.status === 'success') setReferredChildren(res.data.children || []); })
        .catch(() => setReferredChildren([]));
    } else if (isMoh) {
      childrenAPI.list({})
        .then((res) => {
          if (res.data?.status === 'success' && res.data?.children) {
            const onlyEscalated = (res.data.children as any[]).filter((c: any) => c.can_moh_add_measurement === true);
            setMidwifeChildren(onlyEscalated);
          }
        })
        .catch(() => setMidwifeChildren([]));
    } else {
      midwifeAPI.listChildren({})
        .then((res) => { if (res.data?.status === 'success') setMidwifeChildren(res.data.children || []); })
        .catch(() => setMidwifeChildren([]));
    }
  }, [isNutritionist, isMoh]);

  const selectedChild = isNutritionist
    ? referredChildren.find((r) => String(r.child?.id) === childId)?.child
    : isMoh
      ? midwifeChildren.find((c) => String(c.id) === String(childId) || String(c.child_id || c.child_unique_id) === String(childId))
      : midwifeChildren.find((c) => String(c.child_id || c.id) === String(childId));

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build flat child list for the combobox
  const allChildren: { id: string; name: string; childUniqueId: string; dob: string; gender: string; guardianName: string }[] = isNutritionist
    ? referredChildren.map((r) => ({
      id: String(r.child?.id ?? ''),
      name: r.child?.name || '',
      childUniqueId: String(r.child?.child_id || r.child?.child_unique_id || r.child?.id || ''),
      dob: r.child?.dob || '',
      gender: r.child?.gender || '',
      guardianName: r.child?.guardian_name || '',
    }))
    : midwifeChildren.map((c) => ({
      id: String(c.id ?? ''),
      name: c.name || '',
      childUniqueId: String(c.child_id || c.child_unique_id || c.id || ''),
      dob: c.dob || '',
      gender: c.gender || '',
      guardianName: c.guardian_name || '',
    }));

  const filteredChildren = searchQuery.trim()
    ? allChildren.filter((c) => {
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.childUniqueId.toLowerCase().includes(q) ||
        c.id.includes(q)
      );
    })
    : allChildren;

  const handleSelectChild = (c: typeof allChildren[0]) => {
    setChildId(c.id);
    setSearchQuery(`${c.name} — ${c.childUniqueId}`);
    setShowDropdown(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setChildId(''); // clear selection when user types again
    setShowDropdown(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateMeasurementForm({ childId, weight, height, muac, edema, measurementMethod, measurementDate: date });
    setMeasurementWarnings(validation.warnings);
    if (validation.errors.length > 0) {
      setNutError(validation.errors[0]);
      return;
    }

    const weightNum = validation.values.weightKg as number;
    const heightNum = validation.values.heightCm as number;
    const muacNum = validation.values.muacCm;

    if (isNutritionist) {
      setNutError('');
      setNutLoading(true);
      try {
        await nutritionistAPI.addMeasurement({
          child_id: Number(childId),
          weight_kg: weightNum,
          height_cm: heightNum,
          muac_cm: muacNum,
          edema: edema || undefined,
          measurement_method: measurementMethod || undefined,
          measurement_date: date,
          specialist_notes: notes || undefined,
        });
        setNutSuccess(true);
        setTimeout(() => onSuccess(childId), 1500);
      } catch (err: any) {
        setNutError(err.response?.data?.message || 'Failed to save measurement');
      } finally {
        setNutLoading(false);
      }
      return;
    }

    setMidwifeLoading(true);
    setNutError('');
    const numericChildId = selectedChild?.id ?? childId;
    const apiCall = isMoh ? mohAPI.addMeasurement : midwifeAPI.addMeasurement;
    let apiRes: any = null;
    try {
      apiRes = await apiCall({
        child_id: Number(numericChildId),
        weight_kg: weightNum,
        height_cm: heightNum,
        muac_cm: muacNum,
        edema: edema || undefined,
        measurement_method: measurementMethod || undefined,
        measurement_date: date,
        notes: notes || undefined,
      });
    } catch (err: any) {
      setNutError(err.response?.data?.message || 'Failed to save measurement');
      setMidwifeLoading(false);
      return;
    }
    setMidwifeLoading(false);

    // Use the server's WHO screening fields. Do not convert them into a clinical diagnosis in the client.
    const serverMeas = apiRes?.data?.measurement;
    const weightForAge = serverMeas?.z_score_wfa ?? 0;
    const heightForAge = serverMeas?.z_score_hfa ?? 0;
    const weightForHeight = serverMeas?.z_score_wfh ?? 0;

    const recommendations = ['Review the recorded WHO screening indicators with the responsible clinician and local clinical protocol.'];
    const nutritionalGuidance = ['Provide caregiver guidance only after an appropriate clinical assessment; this screen does not generate a treatment plan.'];
    const alerts: string[] = [];
    const followUp = 'Follow the locally approved schedule or clinician-directed review plan.';
    if (serverMeas?.clinical_action_required && serverMeas?.clinical_review_reason) {
      alerts.push(serverMeas.clinical_review_reason);
    }

    // Set assessment results
    setAiResults({
      childName: selectedChild?.name || '',
      childId: childId,
      date: date,
      weight: weightNum,
      height: heightNum,
      muac: muacNum ?? null,
      muacStatus: serverMeas?.muac_status,
      edemaStatus: serverMeas?.edema_status,
      weightForAge,
      heightForAge,
      weightForHeight,
      currentNutritionalStatus: serverMeas?.current_nutritional_status || 'NOT AVAILABLE',
      underweightStatus: serverMeas?.underweight_status || 'NOT AVAILABLE',
      stuntingStatus: serverMeas?.stunting_status || 'NOT AVAILABLE',
      wastingStatus: serverMeas?.wasting_status || 'NOT AVAILABLE',
      recommendations,
      nutritionalGuidance,
      followUp,
      alerts,
    });

    setShowResults(true);
  };

  const handleViewProfile = () => {
    onSuccess(childId);
  };

  const handleAddAnother = () => {
    setShowResults(false);
    setWeight('');
    setHeight('');
    setMuac('');
    setEdema('');
    setMeasurementMethod('');
    setNotes('');
    setMeasurementWarnings([]);
    setAiResults(null);
  };

  if (showResults && aiResults) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Measurement Saved Successfully</h2>
                <p className="text-gray-600">WHO anthropometric screening indicators recorded</p>
              </div>
            </div>
          </div>
        </div>

        {/* WHO assessment header */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg shadow-lg p-6 border-2 border-purple-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">WHO Anthropometric Screening</h3>
              <p className="text-sm text-gray-600">Screening indicators for {aiResults.childName}; clinical interpretation remains with the responsible clinician.</p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {aiResults.alerts.length > 0 && (
          <div className="rounded-lg p-6 border-2 bg-yellow-50 border-yellow-300">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-1 text-yellow-600" />
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-3 text-yellow-900">Clinical review notice</h3>
                <ul className="space-y-2">
                  {aiResults.alerts.map((alert, index) => (
                    <li
                      key={index}
                      className="text-sm font-medium text-yellow-800"
                    >
                      • {alert}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Assessment Results */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Independent WHO Screening Indicators</h3>

          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-sm leading-6 text-blue-900">{STATUS_HELPER_TEXT}</p>
          </div>

          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Recorded screening summary:</span>
              <span className="px-4 py-2 rounded-full text-sm font-bold text-slate-800 bg-slate-200">
                {aiResults.currentNutritionalStatus.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-600">This summary is not a clinical diagnosis. Review each indicator below independently.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="border-2 border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Weight-for-Age Z-score</p>
              <p
                className={`text-3xl font-bold ${aiResults.weightForAge < -2 ? 'text-red-600' : 'text-green-600'
                  }`}
              >
                {aiResults.weightForAge.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Screening result: {aiResults.underweightStatus.replace(/_/g, ' ')}
              </p>
            </div>

            <div className="border-2 border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Height-for-Age Z-score</p>
              <p
                className={`text-3xl font-bold ${aiResults.heightForAge < -2 ? 'text-red-600' : 'text-green-600'
                  }`}
              >
                {aiResults.heightForAge.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Screening result: {aiResults.stuntingStatus.replace(/_/g, ' ')}
              </p>
            </div>

            <div className="border-2 border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Weight-for-Height Z-score</p>
              <p
                className={`text-3xl font-bold ${aiResults.weightForHeight < -2 ? 'text-red-600' : 'text-green-600'
                  }`}
              >
                {aiResults.weightForHeight.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Screening result: {aiResults.wastingStatus.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">Recorded Measurements</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Weight:</span>
                <span className="ml-2 font-medium text-gray-900">{aiResults.weight} kg</span>
              </div>
              <div>
                <span className="text-gray-600">Height:</span>
                <span className="ml-2 font-medium text-gray-900">{aiResults.height} cm</span>
              </div>
              <div>
                <span className="text-gray-600">MUAC:</span>
                <span className="ml-2 font-medium text-gray-900">{aiResults.muac} cm</span>
              </div>
              <div>
                <span className="text-gray-600">Date:</span>
                <span className="ml-2 font-medium text-gray-900">{aiResults.date}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Clinical recommendations */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">Clinical Review</h3>
          </div>
          <ul className="space-y-3">
            {aiResults.recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-purple-600">{index + 1}</span>
                </div>
                <p className="text-sm text-gray-700">{rec}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Nutritional Guidance */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-bold text-gray-900">Caregiver Guidance</h3>
          </div>
          <ul className="space-y-3">
            {aiResults.nutritionalGuidance.map((guidance, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-green-600">✓</span>
                </div>
                <p className="text-sm text-gray-700">{guidance}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Follow-up Schedule */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Follow-up</h3>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900">{aiResults.followUp}</p>
            <p className="text-xs text-gray-600 mt-2">
              The application does not set a clinical follow-up interval from screening results alone.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleViewProfile}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            View Child Profile & Growth Charts
          </button>
          <button
            onClick={handleAddAnother}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            Add Another Measurement
          </button>
          <button
            onClick={onBack}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Add Measurement</h2>
          <p className="text-gray-600">Record new anthropometric measurements</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        {nutSuccess && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            Measurement recorded successfully. Redirecting...
          </div>
        )}
        {nutError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {nutError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Child Selection — searchable combobox (hidden when coming from a child profile) */}
          {!selectedChildId ? (
            <div>
              {isMoh && (
                <p className="text-sm text-gray-600 mb-2">Only children sent (escalated) by a midwife can be measured here.</p>
              )}
              <label htmlFor="child-search" className="block text-sm font-medium text-gray-700 mb-2">
                Select Child * &nbsp;<span className="text-xs text-gray-400 font-normal">(search by name or ID)</span>
              </label>
              <div ref={comboRef} className="relative">
                <input
                  id="child-search"
                  type="text"
                  autoComplete="off"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Type child name or ID number…"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {/* hidden real input that provides the value for form validation */}
                <input type="hidden" value={childId} required />

                {showDropdown && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {filteredChildren.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">No children found</div>
                    ) : (
                      filteredChildren.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleSelectChild(c); }}
                          className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between gap-4 border-b border-gray-100 last:border-0 ${c.id === childId ? 'bg-blue-50 font-semibold' : ''
                            }`}
                        >
                          <div>
                            <span className="text-sm text-gray-900 font-medium">{c.name || 'Unnamed'}</span>
                            <span className="ml-2 text-xs text-gray-500">{c.childUniqueId}</span>
                          </div>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">ID #{c.id}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {childId && !selectedChild && (
                <p className="mt-1 text-xs text-amber-600">⚠ Please select a child from the list</p>
              )}
            </div>
          ) : (
            /* Child is pre-selected from profile — just keep a hidden input for form logic */
            <input type="hidden" value={childId} />
          )}

          {selectedChild && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Child Information</h4>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                <p>
                  <span className="font-medium">Name:</span> {selectedChild.name || selectedChild.child_id || selectedChild.child_unique_id}
                </p>
                <p>
                  <span className="font-medium">DOB:</span> {selectedChild.dob ?? '—'}
                </p>
                <p>
                  <span className="font-medium">Gender:</span>{' '}
                  {selectedChild.gender === 'male' ? 'Male' : selectedChild.gender === 'female' ? 'Female' : '—'}
                </p>
                <p>
                  <span className="font-medium">Guardian:</span> {selectedChild.guardian_name ?? selectedChild.guardianName ?? '—'}
                </p>
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Measurement Date *
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Anthropometric Measurements */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-2">
                Weight (kg) *
              </label>
              <input
                id="weight"
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g., 10.5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Measure to 0.1 kg accuracy</p>
            </div>

            <div>
              <label htmlFor="height" className="block text-sm font-medium text-gray-700 mb-2">
                Height/Length (cm) *
              </label>
              <input
                id="height"
                type="number"
                step="0.1"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="e.g., 85.5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Measure to 0.1 cm accuracy</p>
            </div>

            <div>
              <label htmlFor="muac" className="block text-sm font-medium text-gray-700 mb-2">
                MUAC (cm){!isNutritionist ? ' *' : ''}
              </label>
              <input
                id="muac"
                type="number"
                step="0.1"
                value={muac}
                onChange={(e) => setMuac(e.target.value)}
                placeholder="e.g., 13.5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required={!isNutritionist}
              />
              <p className="mt-1 text-xs text-gray-500">Mid-Upper Arm Circumference</p>
            </div>
          </div>
          <div>
            <label htmlFor="measurement-method" className="block text-sm font-medium text-gray-700 mb-2">Measurement method *</label>
            <select id="measurement-method" value={measurementMethod} onChange={(e) => setMeasurementMethod(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg">
              <option value="">Select method</option>
              <option value="recumbent_length">Recumbent length (lying)</option>
              <option value="standing_height">Standing height</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Clinical Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Enter any relevant clinical observations, feeding patterns, or concerns..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Info Box */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Brain className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900 mb-2">WHO Assessment</h4>
                <p className="text-sm text-gray-700 mb-2">
                  After saving, the system will automatically:
                </p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>✓ Calculate WHO Z-scores for all growth indicators</li>
                  <li>✓ Record independent underweight, stunting and wasting screening indicators</li>
                  <li>✓ Store WHO Z-scores for clinical review</li>
                  <li>✓ Record any backend-provided clinical review notice</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={nutLoading || midwifeLoading || !childId || !weight || !height || !measurementMethod || (!isNutritionist && !muac)}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              {(nutLoading || midwifeLoading) ? 'Saving...' : 'Save measurement'}
            </button>
          </div>
        </form>
      </div>

      {/* Measurement Guidelines */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Measurement Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Weight Measurement</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Remove heavy clothing and shoes</li>
              <li>• Use calibrated digital scale</li>
              <li>• Record to nearest 0.1 kg</li>
              <li>• Ensure child is calm and still</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Height/Length Measurement</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Length for children &lt; 24 months (lying down)</li>
              <li>• Height for children ≥ 24 months (standing)</li>
              <li>• Record to nearest 0.1 cm</li>
              <li>• Ensure proper positioning</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">MUAC Measurement</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Measure mid-point of upper arm</li>
              <li>• Use standard MUAC tape</li>
              <li>• Arm should be relaxed</li>
              <li>• Record to nearest 0.1 cm</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Quality Assurance</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Calibrate equipment regularly</li>
              <li>• Take repeat measurements if unsure</li>
              <li>• Record immediately</li>
              <li>• Note any measurement difficulties</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
