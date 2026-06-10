import { useState } from 'react';
import { ArrowLeft, User, Phone, MapPin, Calendar, UserCircle, Save, AlertCircle, Mail } from 'lucide-react';
import api from '../../services/api';

interface AddChildViewProps {
  onBack: () => void;
  onSuccess: (childId: string) => void;
}

export function AddChildView({ onBack, onSuccess }: AddChildViewProps) {
  const [formData, setFormData] = useState({
    child_id: '',
    name: '',
    dob: '',
    gender: '',
    mother_name: '',
    guardian_name: '',
    guardian_phone: '',
    guardian_email: '',
    guardian_nic: '',
    address: '',
  });
  const [guardianIsMother, setGuardianIsMother] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.child_id.trim()) {
      newErrors.child_id = 'Child ID is required';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Child name is required';
    }

    if (!formData.dob) {
      newErrors.dob = 'Date of birth is required';
    } else {
      const dobDate = new Date(formData.dob);
      const today = new Date();
      if (dobDate > today) {
        newErrors.dob = 'Date of birth cannot be in the future';
      }
    }

    if (!formData.gender) {
      newErrors.gender = 'Gender is required';
    }

    if (!formData.guardian_name.trim()) {
      newErrors.guardian_name = 'Guardian name is required';
    }

    if (!formData.guardian_phone.trim()) {
      newErrors.guardian_phone = 'Guardian phone is required';
    } else if (!/^[0-9\-\s\+]+$/.test(formData.guardian_phone)) {
      newErrors.guardian_phone = 'Please enter a valid phone number';
    }

    if (formData.guardian_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.guardian_email.trim())) {
      newErrors.guardian_email = 'Please enter a valid email address';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.post('/api/children', {
        child_id: formData.child_id.trim(),
        name: formData.name.trim(),
        dob: formData.dob,
        gender: formData.gender,
        mother_name: guardianIsMother ? formData.guardian_name.trim() : (formData.mother_name.trim() || null),
        guardian_name: formData.guardian_name.trim(),
        guardian_phone: formData.guardian_phone.trim(),
        guardian_email: formData.guardian_email.trim() || null,
        guardian_nic: formData.guardian_nic.trim() || null,
        address: formData.address.trim(),
      });

      if (response.data.status === 'success') {
        onSuccess(formData.child_id.trim());
      } else {
        setSubmitError(response.data.message || 'Failed to create child record');
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        setSubmitError(error.response.data.message);
      } else if (error.response?.status === 409) {
        setSubmitError('Child ID already exists. Please use a different ID.');
      } else if (error.response?.status === 401) {
        setSubmitError('Authentication failed. Please login again.');
      } else {
        setSubmitError(error.message || 'Failed to create child record. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
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
          <h2 className="text-2xl font-bold text-gray-900">Add New Child</h2>
          <p className="text-gray-600">Register a new child in the system</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {submitError && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">{submitError}</p>
              </div>
            </div>
          )}

          {/* Child ID */}
          <div>
            <label htmlFor="child_id" className="block text-sm font-medium text-gray-900 mb-2">
              Child ID <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <UserCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="child_id"
                type="text"
                value={formData.child_id}
                onChange={(e) => handleChange('child_id', e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.child_id ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="e.g., CH001, COL004"
                required
              />
            </div>
            {errors.child_id && (
              <p className="mt-1 text-sm text-red-600">{errors.child_id}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Unique identifier for this child (e.g., clinic prefix + number)
            </p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-2">
              Child Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter child's full name"
                required
              />
            </div>
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Date of Birth and Gender */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dob" className="block text-sm font-medium text-gray-900 mb-2">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="dob"
                  type="date"
                  value={formData.dob}
                  onChange={(e) => handleChange('dob', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.dob ? 'border-red-300' : 'border-gray-300'
                    }`}
                  required
                />
              </div>
              {errors.dob && (
                <p className="mt-1 text-sm text-red-600">{errors.dob}</p>
              )}
            </div>

            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-gray-900 mb-2">
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                id="gender"
                value={formData.gender}
                onChange={(e) => handleChange('gender', e.target.value)}
                className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.gender ? 'border-red-300' : 'border-gray-300'
                  }`}
                required
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              {errors.gender && (
                <p className="mt-1 text-sm text-red-600">{errors.gender}</p>
              )}
            </div>
          </div>

          {/* Mother Name */}
          <div>
            <label htmlFor="mother_name" className="block text-sm font-medium text-gray-900 mb-2">
              Mother's Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="mother_name"
                type="text"
                value={guardianIsMother ? formData.guardian_name : formData.mother_name}
                onChange={(e) => handleChange('mother_name', e.target.value)}
                disabled={guardianIsMother}
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${guardianIsMother ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-gray-300'
                  }`}
                placeholder="Enter mother's full name"
              />
            </div>
            <label className="flex items-center gap-2 mt-2 cursor-pointer text-sm text-gray-600">
              <input
                type="checkbox"
                checked={guardianIsMother}
                onChange={(e) => {
                  setGuardianIsMother(e.target.checked);
                  if (e.target.checked) handleChange('mother_name', '');
                }}
                className="w-4 h-4 text-blue-600 rounded"
              />
              Guardian is also the mother
            </label>
          </div>

          {/* Guardian Name */}
          <div>
            <label htmlFor="guardian_name" className="block text-sm font-medium text-gray-900 mb-2">
              Guardian Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="guardian_name"
                type="text"
                value={formData.guardian_name}
                onChange={(e) => handleChange('guardian_name', e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.guardian_name ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter guardian's full name"
                required
              />
            </div>
            {errors.guardian_name && (
              <p className="mt-1 text-sm text-red-600">{errors.guardian_name}</p>
            )}
          </div>

          {/* Guardian NIC */}
          <div>
            <label htmlFor="guardian_nic" className="block text-sm font-medium text-gray-900 mb-2">
              Guardian NIC
            </label>
            <div className="relative">
              <UserCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="guardian_nic"
                type="text"
                value={formData.guardian_nic}
                onChange={(e) => handleChange('guardian_nic', e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="e.g., 901234567V"
              />
            </div>
          </div>

          {/* Guardian Phone */}
          <div>
            <label htmlFor="guardian_phone" className="block text-sm font-medium text-gray-900 mb-2">
              Guardian Phone <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="guardian_phone"
                type="tel"
                value={formData.guardian_phone}
                onChange={(e) => handleChange('guardian_phone', e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.guardian_phone ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="e.g., 077-1234567"
                required
              />
            </div>
            {errors.guardian_phone && (
              <p className="mt-1 text-sm text-red-600">{errors.guardian_phone}</p>
            )}
          </div>

          {/* Guardian Email */}
          <div>
            <label htmlFor="guardian_email" className="block text-sm font-medium text-gray-900 mb-2">
              Guardian Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="guardian_email"
                type="email"
                value={formData.guardian_email}
                onChange={(e) => handleChange('guardian_email', e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.guardian_email ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="guardian@example.com"
              />
            </div>
            {errors.guardian_email && (
              <p className="mt-1 text-sm text-red-600">{errors.guardian_email}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-900 mb-2">
              Address <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                rows={3}
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none ${errors.address ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter full address"
                required
              />
            </div>
            {errors.address && (
              <p className="mt-1 text-sm text-red-600">{errors.address}</p>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Creating...' : 'Create Child Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
