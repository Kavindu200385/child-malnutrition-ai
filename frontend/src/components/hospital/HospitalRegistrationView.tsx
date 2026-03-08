/**
 * Hospital Child Registration View
 * Hospital role only - Register newborns at birth with auto-generated ID
 */
import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Loader2, Baby, Scale, Ruler, Activity } from 'lucide-react';
import { hospitalAPI } from '../../services/api';

interface HospitalRegistrationViewProps {
  onSuccess?: () => void;
}

export function HospitalRegistrationView({ onSuccess }: HospitalRegistrationViewProps) {
  const [formData, setFormData] = useState({
    name: '',
    dob: '',
    gender: '',
    birth_weight_kg: '',
    birth_height_cm: '',
    mother_name: '',
    guardian_name: '',
    guardian_phone: '',
    guardian_nic: '',
    address: '',
    contact_number: '',
    nic: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [registeredChild, setRegisteredChild] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      // Prepare data for API
      const submitData = {
        name: formData.name,
        dob: formData.dob,
        gender: formData.gender,
        birth_weight_kg: parseFloat(formData.birth_weight_kg),
        birth_height_cm: formData.birth_height_cm ? parseFloat(formData.birth_height_cm) : null,
        mother_name: formData.mother_name,
        guardian_name: formData.guardian_name || formData.mother_name,
        guardian_phone: formData.guardian_phone || formData.contact_number,
        guardian_nic: formData.guardian_nic || formData.nic,
        address: formData.address,
      };

      const response = await hospitalAPI.registerChild(submitData);

      if (response.data.status === 'success') {
        setRegisteredChild(response.data.child);
        setSuccess(`Child registered successfully! ID: ${response.data.child.child_unique_id}`);

        // Reset form
        setFormData({
          name: '',
          dob: '',
          gender: '',
          birth_weight_kg: '',
          birth_height_cm: '',
          mother_name: '',
          guardian_name: '',
          guardian_phone: '',
          guardian_nic: '',
          address: '',
          contact_number: '',
          nic: '',
        });

        if (onSuccess) {
          setTimeout(() => onSuccess(), 2000);
        }
      } else {
        setError(response.data.message || 'Failed to register child');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to register child');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSamCase = registeredChild?.birth_risk_level === 'SAM';
  const isMamCase = registeredChild?.birth_risk_level === 'MAM';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Birth Registration</h2>
        <p className="text-gray-600">Register a newborn child at birth. Child ID will be auto-generated.</p>
      </div>

      {/* Success Message with Risk Alert */}
      {success && registeredChild && (
        <div className={`rounded-lg p-4 border-2 ${isSamCase
          ? 'bg-red-50 border-red-300'
          : isMamCase
            ? 'bg-yellow-50 border-yellow-300'
            : 'bg-green-50 border-green-300'
          }`}>
          <div className="flex items-start gap-3">
            {isSamCase ? (
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`font-semibold ${isSamCase ? 'text-red-900' : isMamCase ? 'text-yellow-900' : 'text-green-900'
                }`}>
                {success}
              </p>
              {isSamCase && (
                <div className="mt-3 p-3 bg-red-100 rounded-lg border-2 border-red-300">
                  <p className="text-sm font-bold text-red-900 mb-2">
                    ⚠️ HIGH RISK (SAM) - Immediate Nutritionist Referral Recommended
                  </p>
                  <p className="text-xs text-red-800">
                    This child has been flagged as Severe Acute Malnutrition (SAM) based on birth measurements.
                    Please transfer to Hospital Nutritionist for immediate care.
                  </p>
                </div>
              )}
              {isMamCase && (
                <div className="mt-2 p-2 bg-yellow-100 rounded border border-yellow-300">
                  <p className="text-sm font-medium text-yellow-900">
                    Moderate Risk (MAM) - Monitor closely
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-900">{error}</p>
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
        {/* Child Information */}
        <div className="border-b border-gray-200 pb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Baby className="w-5 h-5 text-blue-600" />
            Child Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Child Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                required
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                required
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
        </div>

        {/* Birth Measurements */}
        <div className="border-b border-gray-200 pb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            Birth Measurements
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Birth Weight (kg) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={formData.birth_weight_kg}
                onChange={(e) => setFormData({ ...formData, birth_weight_kg: e.target.value })}
                required
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 2.8"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Birth Height (cm)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formData.birth_height_cm}
                onChange={(e) => setFormData({ ...formData, birth_height_cm: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 48.5"
              />
            </div>
          </div>
        </div>

        {/* Parent/Guardian Information */}
        <div className="border-b border-gray-200 pb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Parent/Guardian Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mother Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.mother_name}
                onChange={(e) => setFormData({ ...formData, mother_name: e.target.value })}
                required
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Guardian Name
              </label>
              <input
                type="text"
                value={formData.guardian_name}
                onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Number
              </label>
              <input
                type="tel"
                value={formData.guardian_phone || formData.contact_number}
                onChange={(e) => setFormData({
                  ...formData,
                  guardian_phone: e.target.value,
                  contact_number: e.target.value
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                NIC (Optional)
              </label>
              <input
                type="text"
                value={formData.guardian_nic || formData.nic}
                onChange={(e) => setFormData({
                  ...formData,
                  guardian_nic: e.target.value,
                  nic: e.target.value
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> Child ID will be automatically generated in format: <code className="bg-blue-100 px-2 py-1 rounded">HOS-{'{hospital_code}'}-{'{YYYY}'}-{'{sequence}'}</code>
          </p>
          <p className="text-xs text-blue-700 mt-2">
            Birth risk level will be automatically calculated based on WHO standards. SAM cases will be flagged for immediate nutritionist referral.
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Registering...
              </>
            ) : (
              <>
                <Baby className="w-5 h-5" />
                Register Child
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
