import { CalendarDays, MapPin } from 'lucide-react';
import { User } from '../App';

interface LoggedInGreetingProps {
  user: User;
  roleLabel: string;
}

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getLocation(user: User): string {
  const location = user.clinic || user.district;
  return location ? `${location}, Sri Lanka` : 'Sri Lanka';
}

function formatDashboardDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function LoggedInGreeting({ user, roleLabel }: LoggedInGreetingProps) {
  const now = new Date();

  return (
    <section style={{ marginBottom: '3.25rem' }}>
      <h2 className="text-3xl sm:text-4xl font-bold leading-tight tracking-normal text-gray-900">
        {getGreeting(now)}, {roleLabel} <span className="text-2xl sm:text-3xl align-middle" aria-hidden="true">👋</span>
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-y-3 text-base font-medium text-gray-600">
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-5 w-5 flex-shrink-0 text-gray-600" aria-hidden />
          {getLocation(user)}
        </span>
        <span
          className="inline-flex items-center gap-2 border-l border-gray-300 pl-6"
          style={{ marginLeft: '1.5rem' }}
        >
          <CalendarDays className="h-5 w-5 flex-shrink-0 text-gray-600" aria-hidden />
          {formatDashboardDate(now)}
        </span>
      </div>
    </section>
  );
}
