import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Bell,
  BellOff,
  Brain,
  CheckCheck,
  FileText,
  Heart,
  Info,
  Settings,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { notificationsAPI } from '../../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  category?: string | null;
  priority: 'low' | 'normal' | 'high' | 'critical' | string;
  created_at: string;
  is_read: boolean;
  related_child_id?: number | null;
  related_referral_id?: number | null;
  related_escalation_id?: number | null;
  related_transfer_id?: number | null;
  related_report_id?: number | null;
  action_url?: string | null;
};

interface NotificationBellProps {
  onOpenRelated?: (notification: NotificationItem) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — all critical colours as constants (no JIT dependency)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  blue:        '#2563eb',
  blueDark:    '#1d4ed8',
  blueLight:   '#eff6ff',
  red:         '#dc2626',
  redLight:    '#fef2f2',
  orange:      '#d97706',
  orangeLight: '#fffbeb',
  gray50:      '#f9fafb',
  gray100:     '#f3f4f6',
  gray200:     '#e5e7eb',
  gray300:     '#d1d5db',
  gray400:     '#9ca3af',
  gray500:     '#6b7280',
  gray600:     '#4b5563',
  gray700:     '#374151',
  gray900:     '#111827',
  white:       '#ffffff',
  border:      '#e5e7eb',
  shadow:      '0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.07)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Priority config
// ─────────────────────────────────────────────────────────────────────────────

type PriorityKey = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY: Record<PriorityKey, {
  label: string;
  borderColor: string;
  rowBg: string;
  badgeBg: string;
  badgeColor: string;
  dotColor: string;
}> = {
  critical: { label: 'Critical', borderColor: '#ef4444', rowBg: '#fff5f5', badgeBg: '#fee2e2', badgeColor: '#b91c1c', dotColor: '#ef4444' },
  high:     { label: 'High',     borderColor: '#f97316', rowBg: '#fff8f0', badgeBg: '#fed7aa', badgeColor: '#c2410c', dotColor: '#f97316' },
  normal:   { label: 'Medium',   borderColor: '#3b82f6', rowBg: '#f0f7ff', badgeBg: '#dbeafe', badgeColor: '#1d4ed8', dotColor: '#3b82f6' },
  low:      { label: 'Low',      borderColor: '#d1d5db', rowBg: '#fafafa', badgeBg: '#f3f4f6', badgeColor: '#6b7280', dotColor: '#9ca3af' },
};

function priCfg(p: string) {
  return PRIORITY[p as PriorityKey] ?? PRIORITY.normal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category config
// ─────────────────────────────────────────────────────────────────────────────

const CAT: Record<string, {
  label: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  color: string;
}> = {
  clinical:       { label: 'Clinical',      icon: Heart,          color: '#059669' },
  ai_prediction:  { label: 'AI Prediction', icon: Brain,          color: '#7c3aed' },
  escalation:     { label: 'Escalation',    icon: AlertTriangle,  color: '#d97706' },
  referral:       { label: 'Referral',      icon: ArrowRightLeft, color: '#2563eb' },
  reports:        { label: 'Reports',       icon: FileText,       color: '#475569' },
  transfers:      { label: 'Transfers',     icon: ArrowRightLeft, color: '#0d9488' },
  administrative: { label: 'Admin',         icon: Shield,         color: '#4f46e5' },
  system:         { label: 'System',        icon: Settings,       color: '#6b7280' },
};
const CAT_DEFAULT = { label: 'General', icon: Info, color: '#9ca3af' };

function deriveCategory(n: NotificationItem): string {
  if (n.category) return n.category.toLowerCase().replace(/\s+/g, '_');
  const t = (n.type ?? '').toLowerCase();
  if (t.includes('escalat'))   return 'escalation';
  if (t.includes('referral'))  return 'referral';
  if (t.includes('transfer'))  return 'transfers';
  if (t.includes('report'))    return 'reports';
  if (t.startsWith('ai_') || t.includes('confidence') || t.includes('prediction')) return 'ai_prediction';
  if (t.includes('system') || t.includes('announcement')) return 'system';
  if (t.includes('admin') || t.includes('user_approval')) return 'administrative';
  return 'clinical';
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter tabs
// ─────────────────────────────────────────────────────────────────────────────

type FilterTab =
  | 'all' | 'unread' | 'escalation' | 'clinical' | 'ai_prediction'
  | 'referral' | 'reports' | 'transfers' | 'administrative' | 'system';

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',            label: 'All'        },
  { id: 'unread',         label: 'Unread'     },
  { id: 'escalation',     label: 'Escalation' },
  { id: 'clinical',       label: 'Clinical'   },
  { id: 'ai_prediction',  label: 'AI'         },
  { id: 'referral',       label: 'Referral'   },
  { id: 'reports',        label: 'Reports'    },
  { id: 'transfers',      label: 'Transfers'  },
  { id: 'administrative', label: 'Admin'      },
  { id: 'system',         label: 'System'     },
];

function applyFilter(list: NotificationItem[], f: FilterTab) {
  if (f === 'all')    return list;
  if (f === 'unread') return list.filter((n) => !n.is_read);
  return list.filter((n) => deriveCategory(n) === f);
}

// ─────────────────────────────────────────────────────────────────────────────
// Time formatter
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ms    = Date.now() - d.getTime();
  const mins  = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins  <  1)  return 'Just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  === 1) return 'Yesterday';
  if (days  <  7)  return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
}

// ─────────────────────────────────────────────────────────────────────────────
// Spinner
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size, height: size, flexShrink: 0,
        borderRadius: '50%',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationBell({ onOpenRelated }: NotificationBellProps) {

  // ── State ─────────────────────────────────────────────────────────────────

  const [open,        setOpen]        = useState(false);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [items,       setItems]       = useState<NotificationItem[]>([]);
  const [modalItems,  setModalItems]  = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [clearing,    setClearing]    = useState(false);
  const [dropFilter,  setDropFilter]  = useState<FilterTab>('all');
  const [modalFilter, setModalFilter] = useState<FilterTab>('all');
  const [panelPos,    setPanelPos]    = useState<{ top: number; right: number } | null>(null);

  const bellBtnRef   = useRef<HTMLButtonElement>(null);
  const bellWrapRef  = useRef<HTMLDivElement>(null);
  const dropPanelRef = useRef<HTMLDivElement>(null);
  const modalRef     = useRef<HTMLDivElement>(null);

  // ── Data ──────────────────────────────────────────────────────────────────

  const loadDropdown = useCallback(async () => {
    try {
      setLoading(true);
      const [listRes, countRes] = await Promise.all([
        notificationsAPI.list({ limit: 50 }),
        notificationsAPI.unreadCount(),
      ]);
      setItems(listRes.data.notifications ?? []);
      setUnreadCount(countRes.data.unread_count ?? 0);
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModal = useCallback(async () => {
    try {
      const res = await notificationsAPI.list({ limit: 100 });
      setModalItems(res.data.notifications ?? []);
    } catch {
      setModalItems([]);
    }
  }, []);

  useEffect(() => {
    loadDropdown();
    const id = window.setInterval(loadDropdown, 30_000);
    return () => window.clearInterval(id);
  }, [loadDropdown]);

  // ── Position ──────────────────────────────────────────────────────────────

  const calcPos = useCallback(() => {
    if (!bellBtnRef.current) return;
    const r = bellBtnRef.current.getBoundingClientRect();
    setPanelPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, { passive: true });
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close); };
  }, [open]);

  // ── Click outside ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!bellWrapRef.current?.contains(e.target as Node) &&
          !dropPanelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // ── Modal key / scroll-lock ───────────────────────────────────────────────

  useEffect(() => {
    if (!modalOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalOpen(false); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [modalOpen]);

  // ── Filtered lists ────────────────────────────────────────────────────────

  const dropFiltered  = useMemo(() => applyFilter(items, dropFilter),       [items, dropFilter]);
  const modalFiltered = useMemo(() => applyFilter(modalItems, modalFilter), [modalItems, modalFilter]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    await loadDropdown();
    if (modalOpen) await loadModal();
  }, [loadDropdown, loadModal, modalOpen]);

  const markAllRead  = async () => { await notificationsAPI.markAllRead(); await refresh(); };

  const clearAll = async (src: NotificationItem[]) => {
    if (!src.length || clearing) return;
    setClearing(true);
    try { await Promise.all(src.map((n) => notificationsAPI.delete(n.id))); await refresh(); }
    finally { setClearing(false); }
  };

  const deleteSingle = async (e: React.MouseEvent, n: NotificationItem) => {
    e.stopPropagation();
    await notificationsAPI.delete(n.id);
    await refresh();
  };

  const openRelated = async (n: NotificationItem) => {
    if (!n.is_read) await notificationsAPI.markRead(n.id);
    await refresh();
    setOpen(false); setModalOpen(false);
    onOpenRelated?.(n);
  };

  const openModal = async () => { setOpen(false); await loadModal(); setModalOpen(true); };
  const onBell    = () => { if (!open) calcPos(); setOpen((v) => !v); };

  // ── Filter pill renderer ─────────────────────────────────────────────────

  function FilterPill({
    tab, list, active, onChange,
  }: { tab: typeof TABS[0]; list: NotificationItem[]; active: FilterTab; onChange: (t: FilterTab) => void }) {
    const count    = applyFilter(list, tab.id).length;
    const isActive = active === tab.id;
    const disabled = count === 0 && !isActive;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        disabled={disabled}
        onClick={() => onChange(tab.id)}
        style={{
          flexShrink: 0,
          whiteSpace: 'nowrap',
          padding: '3px 11px',
          borderRadius: 20,
          border: `1.5px solid ${isActive ? C.blue : C.gray300}`,
          background: isActive ? C.blue : C.white,
          color: isActive ? C.white : C.gray600,
          fontSize: 11,
          fontWeight: isActive ? 600 : 500,
          lineHeight: '18px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.35 : 1,
          transition: 'background 0.12s, border-color 0.12s, color 0.12s',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          if (!isActive && !disabled) {
            (e.currentTarget as HTMLButtonElement).style.background  = C.gray100;
            (e.currentTarget as HTMLButtonElement).style.borderColor = C.gray400;
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.background  = C.white;
            (e.currentTarget as HTMLButtonElement).style.borderColor = C.gray300;
          }
        }}
      >
        {tab.label}
        {count > 0 && (
          <span style={{ marginLeft: 4, opacity: 0.65, fontWeight: 400 }}>{count}</span>
        )}
      </button>
    );
  }

  // ── Notification card ─────────────────────────────────────────────────────

  function NotificationCard({ n, lines = 2 }: { n: NotificationItem; lines?: number }) {
    const cat      = deriveCategory(n);
    const catConf  = CAT[cat] ?? CAT_DEFAULT;
    const priConf  = priCfg(n.priority);
    const CatIcon  = catConf.icon;
    const isUnread = !n.is_read;
    const [hovered, setHovered] = useState(false);

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => openRelated(n)}
        onKeyDown={(e) => e.key === 'Enter' && openRelated(n)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'flex',
          cursor: 'pointer',
          borderLeft: `4px solid ${priConf.borderColor}`,
          borderBottom: `1px solid ${C.gray100}`,
          background: hovered
            ? (isUnread ? '#f5f5f5' : C.gray50)
            : (isUnread ? priConf.rowBg : C.white),
          transition: 'background 0.1s',
          outline: 'none',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, padding: '12px 40px 12px 16px' }}>

          {/* Category + priority + dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <CatIcon style={{ width: 12, height: 12, color: catConf.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: catConf.color }}>
              {catConf.label}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{
              padding: '1px 5px', borderRadius: 4,
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              background: priConf.badgeBg, color: priConf.badgeColor,
              flexShrink: 0,
            }}>
              {priConf.label}
            </span>
            {isUnread && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: priConf.dotColor, flexShrink: 0 }} />
            )}
          </div>

          {/* Title */}
          <p style={{
            fontSize: 13, fontWeight: 600, lineHeight: '1.3',
            color: isUnread ? C.gray900 : C.gray500,
            margin: 0,
          }}>
            {n.title}
          </p>

          {/* Message */}
          <p style={{
            fontSize: 11, color: C.gray500, lineHeight: '1.5',
            marginTop: 3, marginBottom: 0,
            display: '-webkit-box', WebkitLineClamp: lines,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {n.message}
          </p>

          {/* Timestamp */}
          <p style={{ fontSize: 10, color: C.gray400, marginTop: 6, marginBottom: 0 }}>
            {relativeTime(n.created_at)}
          </p>
        </div>

        {/* Dismiss */}
        {hovered && (
          <button
            type="button"
            title="Dismiss"
            onClick={(e) => deleteSingle(e, n)}
            style={{
              position: 'absolute', right: 8, top: 10,
              padding: 4, borderRadius: 4, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.redLight; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <Trash2 style={{ width: 13, height: 13, color: C.gray400 }} />
          </button>
        )}
      </div>
    );
  }

  // ── Section label ─────────────────────────────────────────────────────────

  function SectionLabel({ label, count }: { label: string; count: number }) {
    return (
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 16px',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(4px)',
        borderBottom: `1px solid ${C.gray100}`,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.gray400 }}>
          {label}
        </span>
        <span style={{
          padding: '0 6px', borderRadius: 10,
          background: C.gray100, color: C.gray500,
          fontSize: 10, fontWeight: 700,
        }}>
          {count}
        </span>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  function EmptyState({ filter }: { filter: FilterTab }) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: C.gray100, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <BellOff style={{ width: 24, height: 24, color: C.gray400 }} />
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.gray700, margin: 0 }}>
          {filter !== 'all' ? 'No matching notifications' : "You're all caught up!"}
        </p>
        <p style={{ fontSize: 11, color: C.gray400, marginTop: 6, maxWidth: 220, lineHeight: 1.5 }}>
          {filter !== 'all'
            ? 'No notifications in this category. Try "All".'
            : 'No new notifications right now.'}
        </p>
      </div>
    );
  }

  // ── Sectioned list ────────────────────────────────────────────────────────

  function SectionedList({ list, lines, filter }: { list: NotificationItem[]; lines?: number; filter: FilterTab }) {
    if (!list.length) return <EmptyState filter={filter} />;
    const unread = list.filter((n) => !n.is_read);
    const read   = list.filter((n) =>  n.is_read);
    return (
      <>
        {unread.length > 0 && <>
          <SectionLabel label="Unread" count={unread.length} />
          {unread.map((n) => <NotificationCard key={n.id} n={n} lines={lines} />)}
        </>}
        {read.length > 0 && <>
          <SectionLabel label="Read" count={read.length} />
          {read.map((n) => <NotificationCard key={n.id} n={n} lines={lines} />)}
        </>}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Bell trigger ──────────────────────────────────────────────────── */}
      <div ref={bellWrapRef}>
        <button
          ref={bellBtnRef}
          type="button"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={onBell}
          style={{
            position: 'relative', padding: 8, borderRadius: 8,
            border: 'none', background: 'transparent',
            color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          className="hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
        >
          <Bell style={{ width: 20, height: 20 }} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -2,
              minWidth: 18, height: 18, padding: '0 4px',
              borderRadius: 9, background: '#ef4444', color: 'white',
              fontSize: 10, fontWeight: 700, lineHeight: '18px',
              textAlign: 'center',
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Dropdown panel ────────────────────────────────────────────────── */}
      {open && panelPos && (
        <div
          ref={dropPanelRef}
          role="dialog"
          aria-label="Notifications"
          style={{
            position:      'fixed',
            top:           panelPos.top,
            right:         panelPos.right,
            zIndex:        9999,
            width:         460,
            maxWidth:      Math.max(300, window.innerWidth - panelPos.right - 8),
            maxHeight:     600,
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
            background:    C.white,
            borderRadius:  12,
            boxShadow:     C.shadow,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
            background: C.white,
          }}>
            {/* Left */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell style={{ width: 16, height: 16, color: C.blue, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gray900 }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{
                  padding: '1px 8px', borderRadius: 10,
                  background: C.blue, color: C.white,
                  fontSize: 11, fontWeight: 700, lineHeight: '18px',
                }}>
                  {unreadCount}
                </span>
              )}
            </div>
            {/* Right — action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                type="button"
                title="Mark all as read"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: 'transparent', cursor: unreadCount === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: unreadCount === 0 ? 0.3 : 1, color: C.gray500,
                }}
                onMouseEnter={(e) => { if (unreadCount > 0) { (e.currentTarget as HTMLButtonElement).style.background = C.blueLight; (e.currentTarget as HTMLButtonElement).style.color = C.blue; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = C.gray500; }}
              >
                <CheckCheck style={{ width: 16, height: 16 }} />
              </button>
              <button
                type="button"
                title="Clear all notifications"
                onClick={() => clearAll(items)}
                disabled={items.length === 0 || clearing}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: 'transparent',
                  cursor: items.length === 0 || clearing ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: items.length === 0 ? 0.3 : 1, color: C.gray500,
                }}
                onMouseEnter={(e) => { if (items.length > 0) { (e.currentTarget as HTMLButtonElement).style.background = C.redLight; (e.currentTarget as HTMLButtonElement).style.color = C.red; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = C.gray500; }}
              >
                {clearing ? <Spinner size={14} /> : <Trash2 style={{ width: 15, height: 15 }} />}
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div
            role="tablist"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              overflowX: 'auto', padding: '8px 12px',
              borderBottom: `1px solid ${C.border}`,
              background: C.gray50,
              flexShrink: 0,
              scrollbarWidth: 'none',
            } as React.CSSProperties}
          >
            {TABS.map((tab) => (
              <FilterPill
                key={tab.id}
                tab={tab}
                list={items}
                active={dropFilter}
                onChange={setDropFilter}
              />
            ))}
          </div>

          {/* Scrollable list */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loading && !items.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                <Spinner size={28} />
                <p style={{ fontSize: 11, color: C.gray400, marginTop: 12 }}>Loading notifications…</p>
              </div>
            ) : (
              <SectionedList list={dropFiltered} lines={2} filter={dropFilter} />
            )}
          </div>

          {/* Footer */}
          <button
            type="button"
            onClick={openModal}
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px 16px',
              borderTop: `1px solid ${C.border}`,
              border: 'none',
              borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: C.border,
              background: C.gray50,
              color: C.blue, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.blueLight; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.gray50; }}
          >
            <ArrowRight style={{ width: 15, height: 15 }} />
            View All Notifications
          </button>
        </div>
      )}

      {/* ── View All modal ────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notification centre"
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, background: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(3px)',
          }}
          onMouseDown={(e) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node)) setModalOpen(false);
          }}
        >
          <div
            ref={modalRef}
            style={{
              width: '100%', maxWidth: 680,
              maxHeight: 'min(88vh, 720px)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              background: C.white, borderRadius: 20,
              boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
            }}
          >
            {/* Modal header */}
            <div style={{ flexShrink: 0 }}>
              {/* Accent bar */}
              <div style={{ height: 4, background: 'linear-gradient(to right, #3b82f6, #6366f1)' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 24px' }}>
                {/* Left */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                  }}>
                    <Bell style={{ width: 20, height: 20, color: C.white }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: C.gray900, margin: 0, lineHeight: 1.2 }}>
                      Notification Centre
                    </h2>
                    <p style={{ fontSize: 11, color: C.gray400, margin: '3px 0 0 0' }}>
                      {modalItems.length} total
                      {unreadCount > 0 && <span style={{ marginLeft: 6, color: C.blue, fontWeight: 600 }}>· {unreadCount} unread</span>}
                    </p>
                  </div>
                </div>

                {/* Right */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {unreadCount > 0 && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 20,
                      border: `1px solid #bfdbfe`, background: C.blueLight,
                      fontSize: 11, fontWeight: 600, color: '#1d4ed8',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue }} />
                      {unreadCount} unread
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                    <button type="button" title="Mark all as read" onClick={markAllRead} disabled={unreadCount === 0}
                      style={{ width: 34, height: 34, border: 'none', borderRight: `1px solid ${C.border}`, background: 'transparent', cursor: unreadCount === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gray500, opacity: unreadCount === 0 ? 0.3 : 1 }}
                      className="hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      <CheckCheck style={{ width: 15, height: 15 }} />
                    </button>
                    <button type="button" title="Clear all" onClick={() => clearAll(modalItems)} disabled={!modalItems.length || clearing}
                      style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: !modalItems.length || clearing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gray500, opacity: !modalItems.length ? 0.3 : 1 }}
                      className="hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      {clearing ? <Spinner size={14} /> : <Trash2 style={{ width: 15, height: 15 }} />}
                    </button>
                  </div>
                  <button type="button" aria-label="Close" onClick={() => setModalOpen(false)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gray400 }}
                    className="hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  >
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>

              {/* Modal filter tabs */}
              <div
                role="tablist"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  overflowX: 'auto', padding: '8px 20px',
                  borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                  background: C.gray50, flexShrink: 0, scrollbarWidth: 'none',
                } as React.CSSProperties}
              >
                {TABS.map((tab) => (
                  <FilterPill key={tab.id} tab={tab} list={modalItems} active={modalFilter} onChange={setModalFilter} />
                ))}
              </div>
            </div>

            {/* Modal list */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <SectionedList list={modalFiltered} lines={3} filter={modalFilter} />
            </div>

            {/* Modal footer */}
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 24px', borderTop: `1px solid ${C.border}`, background: C.gray50,
            }}>
              <span style={{ fontSize: 11, color: C.gray400 }}>
                {modalFiltered.length === modalItems.length
                  ? `${modalItems.length} notification${modalItems.length !== 1 ? 's' : ''}`
                  : `${modalFiltered.length} of ${modalItems.length} shown`}
              </span>
              <button type="button" onClick={() => setModalOpen(false)}
                style={{
                  padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${C.border}`, background: C.white, color: C.gray700, cursor: 'pointer',
                }}
                className="hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
