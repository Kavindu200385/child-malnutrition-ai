import { useState } from 'react';
import { Mail, Phone, UserCircle } from 'lucide-react';
import { User } from '../App';

interface ProfilePopoverProps {
  user: User;
  roleLabel: string;
}

export function ProfilePopover({ user, roleLabel }: ProfilePopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="p-1 rounded-full hover:bg-white/20 transition-colors"
        aria-label="Open profile"
      >
        <UserCircle className="w-8 h-8 text-white" />
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 bg-white text-gray-900 rounded-lg shadow-xl border border-gray-200 p-4 z-50">
          <div className="flex items-start gap-3 pb-3 border-b border-gray-200">
            <div className="w-11 h-11 rounded-lg bg-blue-100 flex items-center justify-center">
              <UserCircle className="w-7 h-7 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{user.name}</p>
              <p className="text-sm text-gray-600 truncate">@{user.username}</p>
              <p className="text-xs font-medium text-blue-700 mt-1">{roleLabel}</p>
            </div>
          </div>

          <div className="space-y-3 pt-3 text-sm">
            <div className="flex items-center gap-2 text-gray-700">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="truncate">{user.email || 'No email added'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Phone className="w-4 h-4 text-gray-400" />
              <span className="truncate">{user.phone || 'No phone added'}</span>
            </div>
            {user.clinic && (
              <p><span className="font-medium">Clinic:</span> {user.clinic}</p>
            )}
            {user.district && (
              <p><span className="font-medium">District:</span> {user.district}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
