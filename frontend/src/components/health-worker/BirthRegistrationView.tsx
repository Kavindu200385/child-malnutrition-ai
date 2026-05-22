import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, AlertCircle, Save, Baby, ClipboardList, Heart } from 'lucide-react';
import api from '../../services/api';

interface BirthRegistrationViewProps {
  onBack: () => void;
  onSuccess: (childId: string) => void;
}

type Step = 1 | 2 | 3 | 'summary';

// Auto-generate an island-wide style MCH card number
function generateMchCardNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  // Example: MCH-2026-0221-123456
  return `MCH-${year}${month}${day}-${random}`;
}

export function BirthRegistrationView({ onBack, onSuccess }: BirthRegistrationViewProps) {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Registered hospitals from backend
  const [hospitals, setHospitals] = useState<{ id: number; name: string; code: string }[]>([]);
  const [customHospitalName, setCustomHospitalName] = useState('');

  useEffect(() => {
    api.get('/api/hospital/list')
      .then((res) => { if (res.data?.status === 'success') setHospitals(res.data.hospitals || []); })
      .catch(() => setHospitals([])); // fail silently — user can still type manually
  }, []);


  // Step 1: Basic Information & Identification
  const [step1Data, setStep1Data] = useState(() => ({
    mchCardNo: generateMchCardNo(),
    registrationDate: new Date().toISOString().split('T')[0],
    childName: '',
    childDOB: '',
    gender: '',
    motherName: '',
    motherNic: '',
    motherAge: '',
    address: '',
    totalLivingChildren: '',
  }));

  // Step 2: Birth Details & Measurements
  const [step2Data, setStep2Data] = useState({
    hospitalName: '',
    deliveryMethod: '',
    apgar1min: '',
    apgar5min: '',
    apgar10min: '',
    birthWeight: '',
    headCircumference: '',
    birthLength: '',
    dischargeWeight: '',
    vitaminKGiven: false,
  });

  // True when user picked "Other" from the dropdown
  const isOtherHospital = step2Data.hospitalName === '__other__';

  // Step 3: Care & Screening
  const [step3Data, setStep3Data] = useState({
    breastfeedingStartedWithinHour: false,
    breastfeedingPosition: '',
    breastfeedingAttachment: '',
    hypothyroidismScreened: false,
    hypothyroidismResult: '',
    specialCareReasons: {
      premature: false,
      lowBirthWeight: false,
      newbornProblems: false,
      brainDefects: false,
      thyroidDisorder: false,
      motherSevereIllness: false,
      bottleFeedingFirst6Months: false,
      growthRetardation: false,
      feedingProblems: false,
      parentDeath: false,
      parentForeignTravel: false,
      other: false,
    },
    otherReasonDetails: '',
  });

  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({});

  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!step1Data.childName.trim()) errors.childName = 'Child name is required';
    if (!step1Data.childDOB) errors.childDOB = 'Date of birth is required';
    if (!step1Data.gender) errors.gender = 'Gender is required';
    if (!step1Data.motherName.trim()) errors.motherName = 'Mother name is required';
    if (step1Data.motherName.trim() && !step1Data.motherNic.trim()) errors.motherNic = 'NIC is required when mother name is provided';
    if (!step1Data.address.trim()) errors.address = 'Address is required';
    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!step2Data.hospitalName.trim()) errors.hospitalName = 'Hospital name is required';
    if (!step2Data.deliveryMethod) errors.deliveryMethod = 'Delivery method is required';
    if (!step2Data.birthWeight) errors.birthWeight = 'Birth weight is required';
    if (!step2Data.birthLength) errors.birthLength = 'Birth length is required';
    setStep2Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (validateStep1()) {
        setCurrentStep(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (currentStep === 2) {
      if (validateStep2()) {
        setCurrentStep(3);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (currentStep === 3) {
      setCurrentStep('summary');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (currentStep === 'summary') {
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(1);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (isDraft: boolean) => {
    if (isDraft) {
      setIsSavingDraft(true);
    } else {
      setIsSubmitting(true);
    }
    setSubmitError('');

    // Generate child_id from hospital prefix (you can customize this)
    const childId = step1Data.mchCardNo || `BR-${Date.now()}`;

    // The actual hospital name to store (resolve "__other__" to custom name)
    const resolvedHospitalName = isOtherHospital ? customHospitalName : step2Data.hospitalName;

    try {
      // Prepare data for backend
      const registrationData = {
        child_id: childId,
        child_unique_id: childId,
        name: step1Data.childName,
        dob: step1Data.childDOB,
        gender: step1Data.gender,
        mother_name: step1Data.motherName,          // save as mother_name for PDF/profile display
        guardian_name: step1Data.motherName,         // also set as guardian (mother is primary caregiver at birth)
        guardian_nic: step1Data.motherNic || null,   // mother's NIC = guardian NIC at birth
        guardian_phone: null,
        address: step1Data.address,
        birth_weight_kg: step2Data.birthWeight ? parseFloat(step2Data.birthWeight) : null,
        birth_height_cm: step2Data.birthLength ? parseFloat(step2Data.birthLength) : null,
        is_draft: isDraft,
        // Additional birth registration data (stored as JSON in database)
        birth_registration: {
          // Step 1: Basic Information
          mchCardNo: step1Data.mchCardNo || null,
          registrationDate: step1Data.registrationDate,
          motherAge: step1Data.motherAge || null,
          totalLivingChildren: step1Data.totalLivingChildren || null,
          // Step 2: Birth Details
          hospitalName: resolvedHospitalName || null,
          deliveryMethod: step2Data.deliveryMethod || null,
          apgarScores: {
            '1min': step2Data.apgar1min || null,
            '5min': step2Data.apgar5min || null,
            '10min': step2Data.apgar10min || null,
          },
          birthWeight: step2Data.birthWeight || null,
          headCircumference: step2Data.headCircumference || null,
          birthLength: step2Data.birthLength || null,
          dischargeWeight: step2Data.dischargeWeight || null,
          vitaminKGiven: step2Data.vitaminKGiven,
          // Step 3: Care & Screening
          breastfeeding: {
            startedWithinHour: step3Data.breastfeedingStartedWithinHour,
            position: step3Data.breastfeedingPosition || null,
            attachment: step3Data.breastfeedingAttachment || null,
          },
          hypothyroidismScreened: step3Data.hypothyroidismScreened,
          hypothyroidismResult: step3Data.hypothyroidismResult || null,
          specialCareReasons: step3Data.specialCareReasons,
          otherReasonDetails: step3Data.otherReasonDetails || null,
        },
      };

      const response = await api.post('/api/children', registrationData);

      if (response.data.status === 'success') {
        onSuccess(childId);
      } else {
        setSubmitError(response.data.message || 'Failed to register child');
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        setSubmitError(error.response.data.message);
      } else if (error.response?.status === 409) {
        setSubmitError('Child ID already exists. Please use a different ID.');
      } else if (error.response?.status === 401) {
        setSubmitError('You are not authorized. Please login again.');
      } else {
        setSubmitError(error.message || 'Failed to save registration. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
      setIsSavingDraft(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
          <Baby className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Step 1: Basic Information</h3>
          <p className="text-sm text-gray-600">Child and mother identification details</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            M.C.H. Card No.
          </label>
          <input
            type="text"
            value={step1Data.mchCardNo}
            onChange={(e) => setStep1Data({ ...step1Data, mchCardNo: e.target.value })}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., D/136/525"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Registration Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={step1Data.registrationDate}
            onChange={(e) => setStep1Data({ ...step1Data, registrationDate: e.target.value })}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Child's Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={step1Data.childName}
          onChange={(e) => setStep1Data({ ...step1Data, childName: e.target.value })}
          className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step1Errors.childName ? 'border-red-300' : 'border-gray-300'
            }`}
          placeholder="Enter child's full name"
          required
        />
        {step1Errors.childName && (
          <p className="mt-1 text-sm text-red-600">{step1Errors.childName}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Date of Birth <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={step1Data.childDOB}
            onChange={(e) => setStep1Data({ ...step1Data, childDOB: e.target.value })}
            max={new Date().toISOString().split('T')[0]}
            className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step1Errors.childDOB ? 'border-red-300' : 'border-gray-300'
              }`}
            required
          />
          {step1Errors.childDOB && (
            <p className="mt-1 text-sm text-red-600">{step1Errors.childDOB}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Gender <span className="text-red-500">*</span>
          </label>
          <select
            value={step1Data.gender}
            onChange={(e) => setStep1Data({ ...step1Data, gender: e.target.value })}
            className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step1Errors.gender ? 'border-red-300' : 'border-gray-300'
              }`}
            required
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          {step1Errors.gender && (
            <p className="mt-1 text-sm text-red-600">{step1Errors.gender}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Total Living Children (including this child)
        </label>
        <input
          type="number"
          min="1"
          value={step1Data.totalLivingChildren}
          onChange={(e) => setStep1Data({ ...step1Data, totalLivingChildren: e.target.value })}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., 03"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Mother's Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={step1Data.motherName}
          onChange={(e) => setStep1Data({ ...step1Data, motherName: e.target.value })}
          className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step1Errors.motherName ? 'border-red-300' : 'border-gray-300'
            }`}
          placeholder="Enter mother's full name"
          required
        />
        {step1Errors.motherName && (
          <p className="mt-1 text-sm text-red-600">{step1Errors.motherName}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Mother's NIC {step1Data.motherName.trim() ? <span className="text-red-500">*</span> : <span className="text-gray-400 text-xs font-normal">(required when name is entered)</span>}
        </label>
        <input
          type="text"
          value={step1Data.motherNic}
          onChange={(e) => setStep1Data({ ...step1Data, motherNic: e.target.value })}
          className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step1Errors.motherNic ? 'border-red-300' : 'border-gray-300'
            }`}
          placeholder="e.g., 901234567V or 199012345678"
        />
        {step1Errors.motherNic && (
          <p className="mt-1 text-sm text-red-600">{step1Errors.motherNic}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Mother's Age
        </label>
        <input
          type="number"
          min="1"
          max="100"
          value={step1Data.motherAge}
          onChange={(e) => setStep1Data({ ...step1Data, motherAge: e.target.value })}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., 39"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Address <span className="text-red-500">*</span>
        </label>
        <textarea
          value={step1Data.address}
          onChange={(e) => setStep1Data({ ...step1Data, address: e.target.value })}
          rows={3}
          className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${step1Errors.address ? 'border-red-300' : 'border-gray-300'
            }`}
          placeholder="Enter full address"
          required
        />
        {step1Errors.address && (
          <p className="mt-1 text-sm text-red-600">{step1Errors.address}</p>
        )}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
          <ClipboardList className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Step 2: Birth Details & Measurements</h3>
          <p className="text-sm text-gray-600">Delivery information and newborn measurements</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Place of Birth (Hospital / Clinic / Home) <span className="text-red-500">*</span>
        </label>

        {/* Hospital dropdown */}
        <select
          value={step2Data.hospitalName}
          onChange={(e) => {
            setStep2Data({ ...step2Data, hospitalName: e.target.value });
            if (e.target.value !== '__other__') setCustomHospitalName('');
          }}
          className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step2Errors.hospitalName ? 'border-red-300' : 'border-gray-300'
            }`}
          required
        >
          <option value="">-- Select hospital --</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.name}>{h.name}</option>
          ))}
          <option value="Home">Home delivery</option>
          <option value="__other__">Other (enter manually)</option>
        </select>

        {/* Custom name input shown when "Other" is selected */}
        {isOtherHospital && (
          <input
            type="text"
            value={customHospitalName}
            onChange={(e) => setCustomHospitalName(e.target.value)}
            className="mt-2 w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter hospital / clinic name"
            autoFocus
            required
          />
        )}

        {step2Errors.hospitalName && (
          <p className="mt-1 text-sm text-red-600">{step2Errors.hospitalName}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Method of Delivery <span className="text-red-500">*</span>
        </label>
        <select
          value={step2Data.deliveryMethod}
          onChange={(e) => setStep2Data({ ...step2Data, deliveryMethod: e.target.value })}
          className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step2Errors.deliveryMethod ? 'border-red-300' : 'border-gray-300'
            }`}
          required
        >
          <option value="">Select delivery method</option>
          <option value="normal_vaginal">Normal Vaginal Delivery</option>
          <option value="assisted_forceps">Assisted Delivery (Forceps)</option>
          <option value="vacuum">Vacuum Extraction</option>
          <option value="caesarean">Caesarean Section</option>
        </select>
        {step2Errors.deliveryMethod && (
          <p className="mt-1 text-sm text-red-600">{step2Errors.deliveryMethod}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-3">Apgar Score</label>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">1 min</label>
            <input
              type="number"
              min="0"
              max="10"
              value={step2Data.apgar1min}
              onChange={(e) => setStep2Data({ ...step2Data, apgar1min: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 9"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">5 min</label>
            <input
              type="number"
              min="0"
              max="10"
              value={step2Data.apgar5min}
              onChange={(e) => setStep2Data({ ...step2Data, apgar5min: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 10"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">10 min</label>
            <input
              type="number"
              min="0"
              max="10"
              value={step2Data.apgar10min}
              onChange={(e) => setStep2Data({ ...step2Data, apgar10min: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 10"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Birth Weight (kg) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={step2Data.birthWeight}
            onChange={(e) => setStep2Data({ ...step2Data, birthWeight: e.target.value })}
            className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step2Errors.birthWeight ? 'border-red-300' : 'border-gray-300'
              }`}
            placeholder="e.g., 3.810"
            required
          />
          {step2Errors.birthWeight && (
            <p className="mt-1 text-sm text-red-600">{step2Errors.birthWeight}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Head Circumference at Birth (cm)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={step2Data.headCircumference}
            onChange={(e) => setStep2Data({ ...step2Data, headCircumference: e.target.value })}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 38"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Length at Birth (cm) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={step2Data.birthLength}
            onChange={(e) => setStep2Data({ ...step2Data, birthLength: e.target.value })}
            className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${step2Errors.birthLength ? 'border-red-300' : 'border-gray-300'
              }`}
            placeholder="e.g., 42"
            required
          />
          {step2Errors.birthLength && (
            <p className="mt-1 text-sm text-red-600">{step2Errors.birthLength}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Weight at Discharge (kg)
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={step2Data.dischargeWeight}
            onChange={(e) => setStep2Data({ ...step2Data, dischargeWeight: e.target.value })}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-3">Vitamin K</label>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="vitaminK"
              checked={step2Data.vitaminKGiven === true}
              onChange={() => setStep2Data({ ...step2Data, vitaminKGiven: true })}
              className="w-4 h-4 text-blue-600"
            />
            <span>Given</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="vitaminK"
              checked={step2Data.vitaminKGiven === false}
              onChange={() => setStep2Data({ ...step2Data, vitaminKGiven: false })}
              className="w-4 h-4 text-blue-600"
            />
            <span>Not Given</span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
          <Heart className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Step 3: Care & Screening</h3>
          <p className="text-sm text-gray-600">Breastfeeding, screening, and special care</p>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Breastfeeding</h4>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Was breastfeeding started within the first hour?
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="breastfeedingHour"
                checked={step3Data.breastfeedingStartedWithinHour === true}
                onChange={() => setStep3Data({ ...step3Data, breastfeedingStartedWithinHour: true })}
                className="w-4 h-4 text-blue-600"
              />
              <span>Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="breastfeedingHour"
                checked={step3Data.breastfeedingStartedWithinHour === false}
                onChange={() => setStep3Data({ ...step3Data, breastfeedingStartedWithinHour: false })}
                className="w-4 h-4 text-blue-600"
              />
              <span>No</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Position</label>
            <select
              value={step3Data.breastfeedingPosition}
              onChange={(e) => setStep3Data({ ...step3Data, breastfeedingPosition: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select</option>
              <option value="correct">Correct</option>
              <option value="incorrect">Incorrect</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Attachment</label>
            <select
              value={step3Data.breastfeedingAttachment}
              onChange={(e) => setStep3Data({ ...step3Data, breastfeedingAttachment: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select</option>
              <option value="correct">Correct</option>
              <option value="incorrect">Incorrect</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Newborn Screening</h4>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Was the newborn screened for congenital hypothyroidism?
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="hypothyroidismScreened"
                checked={step3Data.hypothyroidismScreened === true}
                onChange={() => setStep3Data({ ...step3Data, hypothyroidismScreened: true })}
                className="w-4 h-4 text-blue-600"
              />
              <span>Yes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="hypothyroidismScreened"
                checked={step3Data.hypothyroidismScreened === false}
                onChange={() => setStep3Data({ ...step3Data, hypothyroidismScreened: false })}
                className="w-4 h-4 text-blue-600"
              />
              <span>No</span>
            </label>
          </div>
        </div>

        {step3Data.hypothyroidismScreened && (
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Test Result</label>
            <input
              type="text"
              value={step3Data.hypothyroidismResult}
              onChange={(e) => setStep3Data({ ...step3Data, hypothyroidismResult: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter test result"
            />
          </div>
        )}
      </div>

      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Reasons for Special Care</h4>
        <div className="space-y-2">
          {Object.entries(step3Data.specialCareReasons).map(([key, value]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) =>
                  setStep3Data({
                    ...step3Data,
                    specialCareReasons: {
                      ...step3Data.specialCareReasons,
                      [key]: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </span>
            </label>
          ))}
        </div>

        {step3Data.specialCareReasons.other && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Other Reason Details
            </label>
            <textarea
              value={step3Data.otherReasonDetails}
              onChange={(e) => setStep3Data({ ...step3Data, otherReasonDetails: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Specify other reasons"
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderSummary = () => {
    const specialCareList = Object.entries(step3Data.specialCareReasons)
      .filter(([_, checked]) => checked)
      .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim());

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <Check className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Summary & Review</h3>
            <p className="text-sm text-gray-600">Review all information before submitting</p>
          </div>
        </div>

        {submitError && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">{submitError}</p>
            </div>
          </div>
        )}

        <div className="bg-white border-2 border-gray-200 rounded-lg p-6 space-y-6">
          {/* Step 1 Summary */}
          <div>
            <h4 className="font-bold text-gray-900 mb-3 pb-2 border-b-2 border-gray-200">
              Step 1: Basic Information
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">M.C.H. Card No.:</span>
                <span className="ml-2 font-medium">{step1Data.mchCardNo || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Registration Date:</span>
                <span className="ml-2 font-medium">{step1Data.registrationDate}</span>
              </div>
              <div>
                <span className="text-gray-600">Child Name:</span>
                <span className="ml-2 font-medium">{step1Data.childName}</span>
              </div>
              <div>
                <span className="text-gray-600">Date of Birth:</span>
                <span className="ml-2 font-medium">{step1Data.childDOB}</span>
              </div>
              <div>
                <span className="text-gray-600">Gender:</span>
                <span className="ml-2 font-medium capitalize">{step1Data.gender}</span>
              </div>
              <div>
                <span className="text-gray-600">Mother Name:</span>
                <span className="ml-2 font-medium">{step1Data.motherName}</span>
              </div>
              <div>
                <span className="text-gray-600">Mother NIC:</span>
                <span className="ml-2 font-medium">{step1Data.motherNic || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Mother Age:</span>
                <span className="ml-2 font-medium">{step1Data.motherAge || 'N/A'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-600">Address:</span>
                <span className="ml-2 font-medium">{step1Data.address}</span>
              </div>
              <div>
                <span className="text-gray-600">Total Living Children:</span>
                <span className="ml-2 font-medium">{step1Data.totalLivingChildren || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Step 2 Summary */}
          <div>
            <h4 className="font-bold text-gray-900 mb-3 pb-2 border-b-2 border-gray-200">
              Step 2: Birth Details & Measurements
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Hospital:</span>
                <span className="ml-2 font-medium">{step2Data.hospitalName}</span>
              </div>
              <div>
                <span className="text-gray-600">Delivery Method:</span>
                <span className="ml-2 font-medium">
                  {step2Data.deliveryMethod.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Apgar (1/5/10 min):</span>
                <span className="ml-2 font-medium">
                  {step2Data.apgar1min || '-'} / {step2Data.apgar5min || '-'} / {step2Data.apgar10min || '-'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Birth Weight:</span>
                <span className="ml-2 font-medium">{step2Data.birthWeight} kg</span>
              </div>
              <div>
                <span className="text-gray-600">Head Circumference:</span>
                <span className="ml-2 font-medium">{step2Data.headCircumference || 'N/A'} cm</span>
              </div>
              <div>
                <span className="text-gray-600">Birth Length:</span>
                <span className="ml-2 font-medium">{step2Data.birthLength} cm</span>
              </div>
              <div>
                <span className="text-gray-600">Discharge Weight:</span>
                <span className="ml-2 font-medium">{step2Data.dischargeWeight || 'N/A'} kg</span>
              </div>
              <div>
                <span className="text-gray-600">Vitamin K:</span>
                <span className="ml-2 font-medium">{step2Data.vitaminKGiven ? 'Given' : 'Not Given'}</span>
              </div>
            </div>
          </div>

          {/* Step 3 Summary */}
          <div>
            <h4 className="font-bold text-gray-900 mb-3 pb-2 border-b-2 border-gray-200">
              Step 3: Care & Screening
            </h4>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-600">Breastfeeding Started Within Hour:</span>
                <span className="ml-2 font-medium">
                  {step3Data.breastfeedingStartedWithinHour ? 'Yes' : 'No'}
                </span>
              </div>
              {step3Data.breastfeedingPosition && (
                <div>
                  <span className="text-gray-600">Breastfeeding Position:</span>
                  <span className="ml-2 font-medium capitalize">{step3Data.breastfeedingPosition}</span>
                </div>
              )}
              {step3Data.breastfeedingAttachment && (
                <div>
                  <span className="text-gray-600">Breastfeeding Attachment:</span>
                  <span className="ml-2 font-medium capitalize">{step3Data.breastfeedingAttachment}</span>
                </div>
              )}
              <div>
                <span className="text-gray-600">Hypothyroidism Screened:</span>
                <span className="ml-2 font-medium">{step3Data.hypothyroidismScreened ? 'Yes' : 'No'}</span>
              </div>
              {step3Data.hypothyroidismResult && (
                <div>
                  <span className="text-gray-600">Test Result:</span>
                  <span className="ml-2 font-medium">{step3Data.hypothyroidismResult}</span>
                </div>
              )}
              {specialCareList.length > 0 && (
                <div>
                  <span className="text-gray-600">Special Care Reasons:</span>
                  <div className="mt-1 ml-2">
                    <ul className="list-disc list-inside space-y-1">
                      {specialCareList.map((reason, idx) => (
                        <li key={idx} className="font-medium capitalize">{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {step3Data.otherReasonDetails && (
                <div>
                  <span className="text-gray-600">Other Reason Details:</span>
                  <p className="mt-1 ml-2 font-medium">{step3Data.otherReasonDetails}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

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
          <h2 className="text-2xl font-bold text-gray-900">Birth Registration</h2>
          <p className="text-gray-600">Register a new child at birth (3 steps)</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3, 'summary'].map((step, idx) => (
            <div key={idx} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${currentStep === step
                    ? 'bg-blue-600 text-white'
                    : typeof step === 'number' && Number(currentStep) > step
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                    }`}
                >
                  {step === 'summary' ? <Check className="w-5 h-5" /> : step}
                </div>
                <p className="mt-2 text-xs text-gray-600 text-center">
                  {step === 1
                    ? 'Basic Info'
                    : step === 2
                      ? 'Birth Details'
                      : step === 3
                        ? 'Care & Screening'
                        : 'Summary'}
                </p>
              </div>
              {idx < 3 && (
                <div
                  className={`h-1 flex-1 mx-2 transition-all ${typeof step === 'number' && Number(currentStep) > step
                    ? 'bg-green-500'
                    : 'bg-gray-200'
                    }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Form Content */}
        <div className="bg-gray-50 rounded-lg p-6">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 'summary' && renderSummary()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={currentStep === 1 ? onBack : handleBack}
            className="flex items-center gap-2 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {currentStep === 1 ? 'Cancel' : 'Back'}
          </button>

          {currentStep !== 'summary' ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={isSavingDraft}
                className="flex items-center gap-2 px-6 py-3 border-2 border-gray-300 text-gray-800 bg-white rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {isSavingDraft ? 'Saving Draft...' : 'Save as Draft'}
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                {isSubmitting ? 'Submitting...' : 'Submit Registration'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
