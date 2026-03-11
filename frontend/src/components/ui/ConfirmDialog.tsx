/**
 * ConfirmDialog — professional replacement for window.confirm()
 * Uses 100% inline styles so it works regardless of CSS framework.
 *
 * Usage:
 *   const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
 *   setDialog({ title: '...', message: '...', variant: 'danger', onConfirm: () => doSomething() });
 *   <ConfirmDialog state={dialog} onClose={() => setDialog(null)} />
 */

import { useEffect, CSSProperties } from 'react';

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmDialogState {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    onConfirm: () => void;
}

interface ConfirmDialogProps {
    state: ConfirmDialogState | null;
    onClose: () => void;
}

const variants: Record<ConfirmDialogVariant, {
    iconBg: string;
    iconColor: string;
    confirmBg: string;
    confirmHoverBg: string;
    icon: string;
}> = {
    danger: { iconBg: '#FEE2E2', iconColor: '#DC2626', confirmBg: '#DC2626', confirmHoverBg: '#B91C1C', icon: '🗑️' },
    warning: { iconBg: '#FEF3C7', iconColor: '#D97706', confirmBg: '#D97706', confirmHoverBg: '#B45309', icon: '⚠️' },
    info: { iconBg: '#DBEAFE', iconColor: '#2563EB', confirmBg: '#2563EB', confirmHoverBg: '#1D4ED8', icon: 'ℹ️' },
    success: { iconBg: '#D1FAE5', iconColor: '#059669', confirmBg: '#059669', confirmHoverBg: '#047857', icon: '✓' },
};

export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
    const isOpen = state !== null;

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen || !state) return null;

    const v = variants[state.variant ?? 'warning'];

    const handleConfirm = () => { state.onConfirm(); onClose(); };

    // ── Styles ──────────────────────────────────────────────────────────────
    const overlay: CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
    };

    const panel: CSSProperties = {
        position: 'relative',
        backgroundColor: '#ffffff',
        borderRadius: '1rem',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        width: '100%',
        maxWidth: '440px',
        padding: '1.5rem',
        animation: 'confirmScaleIn 0.18s ease-out',
    };

    const closeBtn: CSSProperties = {
        position: 'absolute', top: '1rem', right: '1rem',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '0.25rem', borderRadius: '9999px',
        color: '#9CA3AF', fontSize: '1.1rem', lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '1.75rem', height: '1.75rem',
        transition: 'background-color 0.15s, color 0.15s',
    };

    const bodyRow: CSSProperties = {
        display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem',
    };

    const iconCircle: CSSProperties = {
        flexShrink: 0, width: '3rem', height: '3rem', borderRadius: '9999px',
        backgroundColor: v.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.25rem',
    };

    const titleStyle: CSSProperties = {
        margin: 0, fontSize: '1.0625rem', fontWeight: 700,
        color: '#111827', marginBottom: '0.375rem',
        paddingRight: '1.5rem', // prevent overlap with X btn
    };

    const msgStyle: CSSProperties = {
        margin: 0, fontSize: '0.875rem', color: '#6B7280', lineHeight: 1.6,
    };

    const divider: CSSProperties = {
        borderTop: '1px solid #F3F4F6', margin: '1.25rem 0',
    };

    const btnRow: CSSProperties = {
        display: 'flex', gap: '0.75rem', justifyContent: 'flex-end',
    };

    const cancelStyle: CSSProperties = {
        padding: '0.625rem 1.125rem',
        borderRadius: '0.625rem',
        border: 'none',
        backgroundColor: '#F3F4F6',
        color: '#374151',
        fontSize: '0.875rem', fontWeight: 600,
        cursor: 'pointer',
        transition: 'background-color 0.15s',
    };

    const confirmStyle: CSSProperties = {
        padding: '0.625rem 1.25rem',
        borderRadius: '0.625rem',
        border: 'none',
        backgroundColor: v.confirmBg,
        color: '#ffffff',
        fontSize: '0.875rem', fontWeight: 600,
        cursor: 'pointer',
        transition: 'background-color 0.15s, transform 0.1s',
    };

    return (
        <>
            <style>{`
        @keyframes confirmScaleIn {
          from { opacity: 0; transform: scale(0.92) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

            <div style={overlay} onClick={onClose}>
                <div
                    style={panel}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cdlg-title"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ── Close button ── */}
                    <button
                        style={closeBtn}
                        onClick={onClose}
                        aria-label="Close"
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F3F4F6';
                            (e.currentTarget as HTMLButtonElement).style.color = '#374151';
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF';
                        }}
                    >
                        ✕
                    </button>

                    {/* ── Body ── */}
                    <div style={bodyRow}>
                        <div style={iconCircle}>{v.icon}</div>
                        <div style={{ flex: 1, minWidth: 0, paddingTop: '0.125rem' }}>
                            <p id="cdlg-title" style={titleStyle}>{state.title}</p>
                            <p style={msgStyle}>{state.message}</p>
                        </div>
                    </div>

                    {/* ── Divider ── */}
                    <div style={divider} />

                    {/* ── Buttons ── */}
                    <div style={btnRow}>
                        <button
                            style={cancelStyle}
                            onClick={onClose}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#E5E7EB'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F3F4F6'; }}
                        >
                            {state.cancelLabel ?? 'Cancel'}
                        </button>
                        <button
                            style={confirmStyle}
                            onClick={handleConfirm}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.backgroundColor = v.confirmHoverBg;
                                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.backgroundColor = v.confirmBg;
                                (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                            }}
                        >
                            {state.confirmLabel ?? 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
