import React from 'react';
import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';

interface RiskBadgeProps {
  classification: 'Normal' | 'MAM' | 'SAM';
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
}

export function RiskBadge({ classification, size = 'medium', showIcon = true }: RiskBadgeProps) {
  const configs = {
    Normal: {
      bg: 'bg-[#2ECC71]/10',
      text: 'text-[#2ECC71]',
      border: 'border-[#2ECC71]',
      icon: CheckCircle,
      label: 'NORMAL',
    },
    MAM: {
      bg: 'bg-[#F1C40F]/10',
      text: 'text-[#F1C40F]',
      border: 'border-[#F1C40F]',
      icon: AlertCircle,
      label: 'MAM',
    },
    SAM: {
      bg: 'bg-[#E74C3C]/10',
      text: 'text-[#E74C3C]',
      border: 'border-[#E74C3C]',
      icon: AlertTriangle,
      label: 'SAM',
    },
  };

  const config = configs[classification];
  const Icon = config.icon;

  const sizeClasses = {
    small: 'px-3 py-1.5 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-8 py-4 text-xl',
  };

  const iconSizes = {
    small: 'w-4 h-4',
    medium: 'w-5 h-5',
    large: 'w-7 h-7',
  };

  return (
    <span
      className={`inline-flex items-center space-x-2 rounded-lg border-2 ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}`}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>{config.label}</span>
    </span>
  );
}