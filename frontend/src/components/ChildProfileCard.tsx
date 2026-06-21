import { ReactNode } from 'react';
import { AlertTriangle, Baby, CircleUserRound, Eye, UserRound } from 'lucide-react';
import { getDisplayRiskLevelTyped, getRiskLabel } from '../types';
import {
  getClinicalActionDisplay,
  getCurrentNutritionalStatusLabel,
  getCurrentStatusToneClass,
  getFuturePredictedRiskLabel,
  getFutureRiskToneClass,
  getStatusDisplayLabel,
} from '../utils/statusDisplay';
import boyAvatar from '../../boy.png';
import girlAvatar from '../../girl.png';

interface ChildProfileCardProps {
  child: any;
  accent?: 'blue' | 'indigo' | 'teal' | 'slate';
  risk?: string;
  area?: string;
  guardianName?: string;
  guardianPhone?: string;
  onViewProfile?: (childId: string) => void;
  actions?: ReactNode;
  badges?: ReactNode;
}

function getAgeMonths(child: any): string {
  if (child.age_months != null) return `${child.age_months} months`;
  if (child.age != null) return `${child.age} months`;
  if (!child.dob) return 'N/A';
  const months = Math.floor((Date.now() - new Date(child.dob).getTime()) / (1000 * 60 * 60 * 24 * 30));
  return Number.isFinite(months) ? `${Math.max(0, months)} months` : 'N/A';
}

function getField(child: any, keys: string[], suffix = ''): string {
  const value = keys.map((key) => child?.[key]).find((item) => item !== null && item !== undefined && item !== '');
  return value !== undefined ? `${value}${suffix ? ` ${suffix}` : ''}` : 'N/A';
}

function getGender(child: any): string {
  const gender = child.gender || child.sex;
  if (!gender) return 'N/A';
  const normalized = String(gender).toLowerCase();
  if (normalized === 'm' || normalized === 'male') return 'Male';
  if (normalized === 'f' || normalized === 'female') return 'Female';
  return String(gender);
}

function getGenderKey(child: any): 'male' | 'female' | 'unknown' {
  const gender = child.gender || child.sex;
  const normalized = String(gender || '').toLowerCase();
  if (normalized === 'm' || normalized === 'male') return 'male';
  if (normalized === 'f' || normalized === 'female') return 'female';
  return 'unknown';
}

function getChildId(child: any): string {
  return String(child.child_unique_id || child.child_id || child.id || 'N/A');
}

function getArea(child: any, override?: string): string {
  return (
    override ||
    child.current_assigned_area?.name ||
    child.phm_area_name ||
    (typeof child.phm_area === 'object' ? child.phm_area?.name : child.phm_area) ||
    (typeof child.moh_area === 'object' ? child.moh_area?.name : child.moh_area) ||
    child.assigned_to_clinic ||
    child.registered_by_clinic ||
    'N/A'
  );
}

function getAvatarClass(accent: ChildProfileCardProps['accent']): string {
  if (accent === 'indigo') return 'from-indigo-700 to-indigo-500';
  if (accent === 'teal') return 'from-teal-700 to-teal-500';
  if (accent === 'slate') return 'from-slate-700 to-slate-500';
  return 'from-blue-700 to-blue-500';
}

function getGenderAvatarClass(gender: 'male' | 'female' | 'unknown', accent: ChildProfileCardProps['accent']): string {
  if (gender === 'female') return 'from-purple-500 to-indigo-500';
  if (gender === 'unknown') return 'from-sky-400 to-blue-500';
  return getAvatarClass(accent);
}

export function ChildProfileCard({
  child,
  accent = 'blue',
  risk,
  area,
  guardianName,
  guardianPhone,
  onViewProfile,
  actions,
  badges,
}: ChildProfileCardProps) {
  const childId = getChildId(child);
  const riskLabel = getCurrentNutritionalStatusLabel(child, risk || getRiskLabel(getDisplayRiskLevelTyped(child)));
  const predictedRiskLabel = getFuturePredictedRiskLabel(child);
  const clinicalAction = getClinicalActionDisplay(child);
  const genderKey = getGenderKey(child);
  const AvatarIcon = genderKey === 'female' ? CircleUserRound : genderKey === 'male' ? UserRound : Baby;
  const avatarSrc = genderKey === 'female' ? girlAvatar : genderKey === 'male' ? boyAvatar : null;

  return (
    <article className="flex h-full min-h-[390px] flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex-1">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h4 className="min-w-0 truncate text-sm font-bold text-gray-900">
            {child.name || child.full_name || 'Unnamed Child'}
          </h4>
          {badges}
        </div>

        <div className="flex items-start gap-4">
          <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getGenderAvatarClass(genderKey, accent)} text-white shadow-md`}>
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                className="h-14 w-14 rounded-full object-cover"
                aria-hidden
              />
            ) : (
              <AvatarIcon className="h-9 w-9" aria-hidden />
            )}
          </div>

          <dl className="min-w-0 flex-1 space-y-2 text-xs text-gray-700">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold text-gray-900">Child ID:</dt>
            <dd className="min-w-0 break-words font-semibold text-blue-700">{childId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold text-gray-900">Age:</dt>
            <dd className="font-semibold text-gray-900">{getAgeMonths(child)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold text-gray-900">Weight:</dt>
            <dd className="font-semibold text-gray-900">{getField(child, ['weight_kg', 'current_weight_kg', 'birth_weight_kg'], 'kg')}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold text-gray-900">Height:</dt>
            <dd className="font-semibold text-gray-900">{getField(child, ['height_cm', 'current_height_cm', 'birth_height_cm'], 'cm')}</dd>
          </div>
          </dl>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-1.5 text-xs text-gray-600">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold text-gray-800">Gender:</dt>
          <dd>{getGender(child)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold text-gray-800">Area:</dt>
          <dd className="min-w-0 break-words">{getArea(child, area)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold text-gray-800">Guardian:</dt>
          <dd className="min-w-0 break-words line-clamp-2">
            {guardianName || child.guardian_name || child.mother_name || 'N/A'} ({guardianPhone || child.guardian_phone || 'N/A'})
          </dd>
        </div>
        </dl>
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="w-full space-y-2">
          <div className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${getCurrentStatusToneClass(riskLabel)}`}>
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span className="flex-1 text-gray-600">Current Status</span>
            <span className="text-right font-bold">{getStatusDisplayLabel(riskLabel)}</span>
          </div>
          <div className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${getFutureRiskToneClass(predictedRiskLabel)}`}>
            <span className="text-gray-600">Future Risk</span>
            <span className="text-right font-bold">{getStatusDisplayLabel(predictedRiskLabel)}</span>
          </div>
          <div className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${clinicalAction.className}`}>
            <span className="text-gray-600">Action Required</span>
            <span className="text-right font-bold">{getStatusDisplayLabel(clinicalAction.label)}</span>
          </div>
        </div>
        {onViewProfile && (
          <button
            type="button"
            onClick={() => onViewProfile(childId)}
            className="inline-flex h-11 w-auto items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md"
          >
            <Eye className="h-4 w-4" aria-hidden />
            View Profile
          </button>
        )}
        {actions && <div className="flex w-full flex-col gap-2">{actions}</div>}
      </div>
    </article>
  );
}
