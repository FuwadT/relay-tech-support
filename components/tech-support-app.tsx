'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock,
  Cpu,
  CreditCard,
  Inbox,
  LayoutDashboard,
  Loader2,
  Lock,
  Monitor,
  Plus,
  RotateCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Wifi,
  X,
} from 'lucide-react';
import type {
  Answers,
  CaseMeasurements,
  CaseRecord,
  CaseStatus,
  Category,
  IntakeInput,
  UserProfile,
} from '@/lib/contracts';
import { canAccessQueue } from '@/lib/contracts';
import { intakeDraftKey, parseIntakeDraft, makeIntakeSubmission, type IntakeSubmission } from '@/lib/intake-draft';
import { summarizeWorkspaceMetrics } from '@/lib/workspace-metrics';
import AIChatView from './ai-chat-view';
import {
  DIAGNOSTIC_RULE_VERSION,
  caseAnalysis,
  compareMeasurements,
  getChecks,
  getMeasurementDefinitions,
} from '@/lib/diagnostics';

const labels: Record<CaseStatus, string> = {
  open: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
  escalated: 'Needs a technician',
  closed: 'Closed',
};

const categoryLabel = (c: Category) => (c === 'network' ? 'Internet & Wi-Fi' : 'Computer performance');

const initial: IntakeInput = {
  title: '',
  description: '',
  deviceName: '',
  category: 'performance',
  os: 'windows11',
  ownership: 'personal',
  consent: false,
};



function date(s: string) {
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data: unknown = await r.json().catch(() => ({}));
  if (!r.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: string }).error === 'string'
        ? (data as { error: string }).error
        : 'Something went wrong. Please try again.';
    throw new Error(r.status === 401 ? 'Your session has expired. Sign in again to continue.' : message);
  }
  return data as T;
}

export default function TechSupportApp({ displayName }: { displayName: string }) {
  const [view, setView] = useState<'overview' | 'cases' | 'new' | 'detail' | 'queue' | 'metrics' | 'chat'>('chat');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [queueCases, setQueueCases] = useState<CaseRecord[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [selected, setSelected] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<IntakeInput>(initial);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const restoreDeleteFocus = useRef(false);
  const [baselineInputs, setBaselineInputs] = useState<Record<string, string>>({});
  const [followUpInputs, setFollowUpInputs] = useState<Record<string, string>>({});
  const [activeMeasurementKind, setActiveMeasurementKind] = useState<'baseline' | 'followUp'>('baseline');

  // Operator / Staff controls state
  const [staffNotes, setStaffNotes] = useState('');
  const [staffStatus, setStaffStatus] = useState<CaseStatus>('open');
  const [staffAssignedTo, setStaffAssignedTo] = useState('');

  // Queue view filter state
  const [queueQuery, setQueueQuery] = useState('');
  const [queueCategory, setQueueCategory] = useState('all');
  const [queueStatus, setQueueStatus] = useState('all');

  const generation = useRef(0);
  const previousView = useRef<'cases' | 'queue' | 'metrics'>('cases');
  const [submission, setSubmission] = useState<IntakeSubmission | null>(null);
  const submissionRef = useRef<IntakeSubmission | null>(null);
  const ownerRef = useRef<string | null>(null);
  const [draftOwnerId, setDraftOwnerId] = useState<string | null>(null);
  const [draftWarning, setDraftWarning] = useState('');
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  const [queueReady, setQueueReady] = useState(false);
  const [queueAsOf, setQueueAsOf] = useState<string | null>(null);
  const retryTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (view === 'new' && submission && !busy) retryTrigger.current?.focus();
  }, [view, submission, busy]);

  function cancelDelete() {
    restoreDeleteFocus.current = true;
    setDeleteOpen(false);
  }

  useEffect(() => {
    const owner = currentUser?.userId;
    ownerRef.current = owner ?? null;
    submissionRef.current = null;
    setSubmission(null);
    setForm(initial);
    setDraftRestored(false);
    setDraftBlocked(false);
    setDraftWarning('');
    setDraftOwnerId(null);
    if (!owner) return;
    try {
      const raw = sessionStorage.getItem(intakeDraftKey(owner));
      const saved = parseIntakeDraft(raw, owner);
      if (saved) {
        setForm(saved.submission?.payload ?? saved.form);
        submissionRef.current = saved.submission;
        setSubmission(saved.submission);
        setDraftRestored(true);
      } else if (raw !== null) {
        setDraftBlocked(true);
        setDraftWarning('This saved draft could not be restored safely. Discard it explicitly before starting a new attempt; an earlier save may exist in My cases.');
      }
    } catch {
      setDraftWarning('Browser storage is unavailable. Drafts and retry keys stay in this tab only; keep it open until a save is confirmed.');
    }
    setDraftOwnerId(owner);
  }, [currentUser?.userId]);

  function persistDraft(nextForm: IntakeInput, nextSubmission: IntakeSubmission | null) {
    const owner = ownerRef.current;
    if (!owner) return;
    try {
      if (!nextSubmission && !nextForm.title && !nextForm.description && !nextForm.deviceName) {
        sessionStorage.removeItem(intakeDraftKey(owner));
      } else {
        sessionStorage.setItem(intakeDraftKey(owner), JSON.stringify({ version: 1, ownerId: owner, form: nextForm, submission: nextSubmission }));
      }
    } catch {
      setDraftWarning('Browser storage is unavailable. Drafts and retry keys stay in this tab only; keep it open until a save is confirmed.');
    }
  }

  useEffect(() => {
    if (view === 'new' && currentUser?.userId === draftOwnerId && !draftBlocked) {
      persistDraft(form, submission);
    }
  }, [form, submission, view, draftOwnerId, currentUser?.userId, draftBlocked]);

  function discardDraft() {
    if (busy) return;
    submissionRef.current = null;
    setSubmission(null);
    setForm(initial);
    setDraftRestored(false);
    setDraftBlocked(false);
    persistDraft(initial, null);
    setNotice('Draft discarded. Check My cases for any earlier uncertain save before deliberately creating another case.');
  }

  useEffect(() => {
    if (!deleteOpen && restoreDeleteFocus.current) {
      deleteTrigger.current?.focus();
      restoreDeleteFocus.current = false;
    }
  }, [deleteOpen]);

  useEffect(() => {
    let mounted = true;
    setDataReady(false);
    setQueueReady(false);
    setLoading(true);
    setCases([]);
    setQueueCases([]);
    async function loadInitial() {
      try {
        const authData = await request<{ user: UserProfile }>('/api/auth/me');
        if (!mounted) return;
        setCurrentUser(authData.user);
        setSelected(null);
        setView('chat');
        generation.current++;

        const casesData = await request<{ cases: CaseRecord[] }>('/api/cases');
        if (!mounted) return;
        setCases(casesData.cases);
        setDataReady(true);
        setDataAsOf(new Date().toISOString());

        if (canAccessQueue(authData.user.role)) {
          const qData = await request<{ cases: CaseRecord[] }>('/api/cases?scope=queue');
          if (!mounted) return;
          setQueueCases(qData.cases);
          setQueueReady(true);
          setQueueAsOf(new Date().toISOString());
        }
      } catch (e) {
        if (!mounted) return;
        setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadInitial();
    return () => {
      mounted = false;
    };
  }, [displayName]);

  async function loadQueue() {
    setQueueLoading(true);
    setQueueReady(false);
    try {
      const d = await request<{ cases: CaseRecord[] }>('/api/cases?scope=queue');
      setQueueCases(d.cases);
      setQueueReady(true);
      setQueueAsOf(new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQueueLoading(false);
    }
  }

  function navigate(v: typeof view) {
    generation.current++;
    setView(v);
    setError('');
    setNotice('');
    setDeleteOpen(false);
    if (v === 'queue' && canAccessQueue(currentUser?.role ?? 'customer')) {
      void loadQueue();
    }
  }

  function start(c?: Category) {
    if (busy) return;
    if (!submissionRef.current && !form.title && !form.description && !form.deviceName && !draftRestored) {
      setForm({ ...initial, category: c ?? 'performance' });
    }
    navigate('new');
  }

  function syncMeasurementInputs(c: CaseRecord) {
    const b: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.measurements?.baseline ?? {})) {
      if (typeof v === 'number') b[k] = String(v);
    }
    setBaselineInputs(b);
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.measurements?.followUp ?? {})) {
      if (typeof v === 'number') f[k] = String(v);
    }
    setFollowUpInputs(f);
  }

  function open(c: CaseRecord, fromQueue = false) {
    setSelected(c);
    setNotes(c.notes);
    setStaffNotes(c.internalNotes ?? '');
    setStaffStatus(c.status);
    setStaffAssignedTo(c.assignedTo ?? '');
    setStep(0);
    syncMeasurementInputs(c);
    previousView.current = fromQueue ? 'queue' : 'cases';
    navigate('detail');
  }

  function updateRecord(c: CaseRecord) {
    setDataAsOf(new Date().toISOString());
    setQueueAsOf(new Date().toISOString());
    setCases((old) => [c, ...old.filter((x) => x.id !== c.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setQueueCases((old) => [c, ...old.filter((x) => x.id !== c.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async function create(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !currentUser || draftOwnerId !== currentUser.userId || draftBlocked) return;
    const owner = currentUser.userId;
    setBusy(true);
    setError('');
    const g = generation.current;
    let attempt: IntakeSubmission;
    try {
      attempt = submissionRef.current ?? makeIntakeSubmission(form);
      submissionRef.current = attempt;
      setSubmission(attempt);
      persistDraft(attempt.payload, attempt);
      const d = await request<{ case: CaseRecord }>('/api/cases', {
        method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: JSON.stringify(attempt.payload),
      });
      if (!d.case?.id) throw new Error('The save response could not be confirmed. Retry this same attempt.');
      if (ownerRef.current !== owner || submissionRef.current !== attempt) return;
      updateRecord(d.case);
      submissionRef.current = null;
      setSubmission(null);
      setForm(initial);
      persistDraft(initial, null);
      setDraftRestored(false);
      if (g !== generation.current) return;
      setSelected(d.case);
      setNotes(d.case.notes);
      setStaffNotes(d.case.internalNotes ?? '');
      setStaffStatus(d.case.status);
      setStaffAssignedTo(d.case.assignedTo ?? '');
      setStep(0);
      syncMeasurementInputs(d.case);
      previousView.current = 'cases';
      navigate('detail');
    } catch (e) {
      if (g === generation.current && ownerRef.current === owner) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(
    data: { answers?: Answers; status?: CaseStatus; notes?: string; measurements?: CaseMeasurements },
    message = 'Progress saved'
  ) {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const g = generation.current;
    try {
      const d = await request<{ case: CaseRecord }>(`/api/cases/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      updateRecord(d.case);
      if (g === generation.current) {
        setSelected(d.case);
        if (data.measurements?.baseline)
          setBaselineInputs(
            Object.fromEntries(
              Object.entries(d.case.measurements.baseline ?? {}).map(([key, value]) => [
                key,
                value === null ? '' : String(value),
              ])
            )
          );
        if (data.measurements?.followUp)
          setFollowUpInputs(
            Object.fromEntries(
              Object.entries(d.case.measurements.followUp ?? {}).map(([key, value]) => [
                key,
                value === null ? '' : String(value),
              ])
            )
          );
        setNotice(message);
      }
    } catch (e) {
      if (g === generation.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveStaffUpdates() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const g = generation.current;
    try {
      const payload = {
        internalNotes: staffNotes,
        status: staffStatus,
        assignedTo: staffAssignedTo.trim() || null,
      };
      const d = await request<{ case: CaseRecord }>(`/api/cases/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      updateRecord(d.case);
      if (g === generation.current) {
        setSelected(d.case);
        setStaffNotes(d.case.internalNotes ?? '');
        setStaffStatus(d.case.status);
        setStaffAssignedTo(d.case.assignedTo ?? '');
        setNotice('Staff updates and confidential review notes saved.');
      }
    } catch (e) {
      if (g === generation.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMeasurements(kind: 'baseline' | 'followUp') {
    if (!selected || busy) return;
    const raw = kind === 'baseline' ? baselineInputs : followUpInputs;
    const entry: Record<string, number | null> = {};
    const defs = getMeasurementDefinitions(selected.category);
    for (const d of defs) {
      const str = raw[d.id]?.trim();
      if (str !== undefined && str !== '' && !isNaN(Number(str))) {
        entry[d.id] = Number(str);
      } else {
        entry[d.id] = null;
      }
    }
    await patch(
      { measurements: { [kind]: entry } },
      `${kind === 'baseline' ? 'Baseline' : 'Follow-up'} measurements saved`
    );
  }

  async function remove() {
    if (!selected || busy) return;
    const id = selected.id;
    const g = generation.current;
    setBusy(true);
    setError('');
    try {
      await request(`/api/cases/${id}`, { method: 'DELETE' });
      setCases((old) => old.filter((c) => c.id !== id));
      setQueueCases((old) => old.filter((c) => c.id !== id));
      if (g === generation.current) {
        setSelected(null);
        setNotice('Case deleted from the active database. Existing backups may retain older copies; minimal retry metadata is retained to prevent recreation by an old request.');
        navigate(previousView.current === 'queue' && canAccessQueue(currentUser?.role ?? 'customer') ? 'queue' : 'cases');
      }
    } catch (e) {
      if (g === generation.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCase() {
    if (!selected) return;
    const analysis = caseAnalysis(selected);
    const comparisons = compareMeasurements(selected.category, selected.measurements);
    const exportRecord = { ...selected };
    // Explicitly guarantee internalNotes is omitted from all exported JSON summaries
    delete exportRecord.internalNotes;
    const payload = {
      ...exportRecord,
      analysis,
      comparisons,
      ruleVersion: analysis.ruleVersion ?? DIAGNOSTIC_RULE_VERSION,
      exportedAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `relay-case-${selected.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const active = cases.filter((c) => c.status === 'open' || c.status === 'in_progress').length;
  const filtered = cases.filter(
    (c) =>
      (category === 'all' || c.category === category) &&
      (status === 'all' || c.status === status) &&
      `${c.title} ${c.deviceName} ${c.description}`.toLowerCase().includes(query.toLowerCase())
  );

  const filteredQueue = queueCases.filter((c) => {
    const matchCategory = queueCategory === 'all' || c.category === queueCategory;
    const matchStatus = queueStatus === 'all' || c.status === queueStatus;
    const matchSearch =
      !queueQuery.trim() ||
      `${c.id} ${c.title} ${c.deviceName} ${c.description} ${c.userId ?? ''} ${c.assignedTo ?? ''}`
        .toLowerCase()
        .includes(queueQuery.toLowerCase());
    return matchCategory && matchStatus && matchSearch;
  });

  const checks = selected ? getChecks(selected.category) : [];
  const check = checks[step];
  const analysis = selected ? caseAnalysis(selected) : null;
  const comparisons = selected ? compareMeasurements(selected.category, selected.measurements) : [];
  const measurementDefs = selected ? getMeasurementDefinitions(selected.category) : [];
  const answered = selected ? checks.filter((c) => selected.answers[c.id]).length : 0;

  const isStaff = canAccessQueue(currentUser?.role ?? 'customer');

  function CaseList({ items, fromQueue = false }: { items: CaseRecord[]; fromQueue?: boolean }) {
    return (
      <div className="case-list">
        {items.map((c) => (
          <button className="case-row" key={c.id} onClick={() => open(c, fromQueue)}>
            <span className={`device-icon ${c.category === 'network' ? 'blue' : ''}`}>
              {c.category === 'network' ? <Wifi size={21} /> : <Monitor size={21} />}
            </span>
            <span className="case-main">
              <strong>{c.title}</strong>
              <span>
                {c.deviceName} <span aria-hidden="true">·</span> {categoryLabel(c.category)}
                {fromQueue && c.userId && (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span> Customer: {c.userId}
                  </>
                )}
              </span>
            </span>
            <span className={`status ${c.status}`}>{labels[c.status]}</span>
            <span className="case-date">{date(c.updatedAt)}</span>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('overview')} aria-label="Relay home">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          relay<span className="brand-dot">.</span>
        </button>
        <div className="private-label">EARLY ACCESS</div>
        <nav aria-label="Main navigation">
          <button
            aria-current={view === 'chat' ? 'page' : undefined}
            className={view === 'chat' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('chat')}
          >
            <Sparkles size={19} />
            AI Triage Chat
          </button>
          <button aria-current={view === 'overview' ? 'page' : undefined} className={view === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('overview')}>
            <LayoutDashboard size={19} />
            Overview
          </button>
          {isStaff && (
            <button
              className={view === 'queue' ? 'nav-item active' : 'nav-item'}
              aria-current={view === 'queue' ? 'page' : undefined}
              onClick={() => navigate('queue')}
            >
              <Inbox size={19} />
              Support Queue
              <span className="nav-count">
                {queueCases.filter((c) => c.status === 'open' || c.status === 'escalated').length}
              </span>
            </button>
          )}
          <button
            className={view === 'cases' || (view === 'detail' && previousView.current === 'cases') ? 'nav-item active' : 'nav-item'}
            aria-current={view === 'cases' || (view === 'detail' && previousView.current === 'cases') ? 'page' : undefined}
            onClick={() => navigate('cases')}
          >
            <ClipboardList size={19} />
            My cases<span className="nav-count">{cases.length}</span>
          </button>
          <button
            className={view === 'metrics' ? 'nav-item active' : 'nav-item'}
            aria-current={view === 'metrics' ? 'page' : undefined}
            onClick={() => navigate('metrics')}
          >
            <BarChart3 size={19} />
            Metrics
          </button>
          <button aria-current={view === 'new' ? 'page' : undefined} className={view === 'new' ? 'nav-item active' : 'nav-item'} onClick={() => start()}>
            <Plus size={19} />
            New case
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="scope-note">
            <ShieldCheck size={21} />
            <strong>A record of your repairs.</strong>
            <p>Save observations and steps so you can pick up where you left off.</p>
          </div>
          <div className="user">
            <span className="avatar">
              {(currentUser?.displayName || displayName || 'U').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{currentUser?.displayName || displayName}</strong>
              <small>{currentUser?.role === 'support' || currentUser?.role === 'admin' ? 'Support Operator' : 'Customer Account'}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={14} />
            <span>
              {view === 'chat'
                ? 'AI Triage & Remote Support'
                : view === 'detail'
                ? 'Case details'
                : view === 'new'
                ? 'New case'
                : view === 'queue'
                ? 'Support queue'
                : view === 'metrics'
                ? 'Operational metrics'
                : view === 'cases'
                ? 'My cases'
                : 'Overview'}
            </span>
          </div>

          <div className="topbar-right">
            {currentUser?.role === 'support' || currentUser?.role === 'admin' ? (
              <span className="role-badge staff">
                <ShieldCheck size={14} />
                Support Operator
              </span>
            ) : (
              <span className="role-badge customer">Customer Account</span>
            )}


          </div>
        </header>

        <main id="main-content" tabIndex={-1}>
          {error && (
            <div className="alert error" role="alert">
              {error}
              {error.includes('session') && <a href="/signin-with-chatgpt?return_to=%2F">Sign in again</a>}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}

          {/* VIEW: AI CHAT SUPPORT (PRIMARY USER EXPERIENCE) */}
          {view === 'chat' && (
            <AIChatView
              currentUser={currentUser}
              onViewCaseDetail={(caseId) => {
                const found = cases.find((c) => c.id === caseId) || queueCases.find((c) => c.id === caseId);
                if (found) {
                  setSelected(found);
                  navigate('detail');
                }
              }}
            />
          )}

          {/* VIEW: OVERVIEW */}
          {view === 'overview' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">TECH SUPPORT</p>
                  <h1>Your support desk.</h1>
                  <p>Track problems, follow checks, and keep your notes in one place.</p>
                </div>
                <button className="button primary" onClick={() => start()}>
                  <Plus size={18} />
                  New case
                </button>
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <p className="eyebrow">START A SUPPORT CASE</p>
                  <h2>What’s giving you trouble?</h2>
                  <p>Record the issue, work through the checks, and keep a record of what helped.</p>
                  <button className="button primary" onClick={() => start()}>
                    Start a case
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="support-scope">
                  <span className="scope-caption">CURRENTLY SUPPORTED</span>
                  <div>
                    <Monitor size={20} />
                    <span>Windows 11 performance</span>
                  </div>
                  <div>
                    <Wifi size={20} />
                    <span>Home internet &amp; Wi-Fi</span>
                  </div>
                  <p>Personal devices · Manual checks</p>
                </div>
              </section>
              <section className="stats" aria-label="Case statistics">
                <div>
                  <span className="stat-icon">
                    <ClipboardList size={21} />
                  </span>
                  <div>
                    <small>All cases</small>
                    <strong>{loading ? '—' : cases.length}</strong>
                  </div>
                </div>
                <div>
                  <span className="stat-icon amber">
                    <Cpu size={21} />
                  </span>
                  <div>
                    <small>Working through</small>
                    <strong>{loading ? '—' : active}</strong>
                  </div>
                </div>
                <div>
                  <span className="stat-icon green">
                    <CheckCircle2 size={21} />
                  </span>
                  <div>
                    <small>Marked resolved</small>
                    <strong>{loading ? '—' : cases.filter((c) => c.status === 'resolved').length}</strong>
                  </div>
                </div>
              </section>
              <div className="section-heading">
                <h2>Choose a problem</h2>
                <span>Two places to start</span>
              </div>
              <section className="category-grid">
                <button className="category-card" onClick={() => start('performance')}>
                  <span className="device-icon">
                    <Monitor size={25} />
                  </span>
                  <h3>My computer feels slow</h3>
                  <p>Work through lag, slow apps, and everyday performance issues.</p>
                  <span className="text-link">
                    Check performance
                    <ArrowRight size={16} />
                  </span>
                </button>
                <button className="category-card" onClick={() => start('network')}>
                  <span className="device-icon blue">
                    <Wifi size={25} />
                  </span>
                  <h3>My connection is unreliable</h3>
                  <p>Narrow down Wi-Fi dropouts, slow internet, and connection trouble.</p>
                  <span className="text-link">
                    Check connectivity
                    <ArrowRight size={16} />
                  </span>
                </button>
              </section>
              <div className="section-heading">
                <h2>Recent cases</h2>
                <button className="text-link" onClick={() => navigate('cases')}>
                  View all
                  <ArrowRight size={16} />
                </button>
              </div>
              {loading ? (
                <div className="empty">
                  <Loader2 className="spin" />
                  Loading your workspace…
                </div>
              ) : cases.length ? (
                <CaseList items={cases.slice(0, 4)} />
              ) : (
                <div className="empty compact">
                  <ClipboardList size={25} />
                  <div>
                    <h3>No cases yet</h3>
                    <p>Your saved cases and progress will appear here.</p>
                  </div>
                  <button className="button secondary" onClick={() => start()}>
                    Create your first case
                  </button>
                </div>
              )}
            </>
          )}

          {/* VIEW: MY CASES */}
          {view === 'cases' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">YOUR TROUBLESHOOTING HISTORY</p>
                  <h1>My cases</h1>
                  <p>Pick up where you left off. Keep what you’ve learned.</p>
                </div>
                <button className="button primary" onClick={() => start()}>
                  <Plus size={18} />
                  New case
                </button>
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="Search cases"
                    placeholder="Search cases or devices…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="all">All categories</option>
                  <option value="performance">Performance</option>
                  <option value="network">Internet & Wi-Fi</option>
                </select>
                <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  {Object.entries(labels).map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              {loading ? (
                <div className="empty">
                  <Loader2 className="spin" />
                  Loading cases…
                </div>
              ) : filtered.length ? (
                <CaseList items={filtered} />
              ) : (
                <div className="empty">
                  <ClipboardList size={32} />
                  <h3>{cases.length ? 'No matching cases' : 'No saved cases'}</h3>
                  <p>{cases.length ? 'Try another search or filter.' : 'Start a case to save your checks and observations.'}</p>
                  <button className="button primary" onClick={() => start()}>
                    Start a case
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}

          {/* VIEW: SUPPORT QUEUE (Task S4-04) */}
          {view === 'queue' && (
            <>
              {!isStaff ? (
                <div className="forbidden-container">
                  <div className="forbidden-icon">
                    <ShieldCheck size={28} />
                  </div>
                  <h2>403 Forbidden: Support Operator Access Required</h2>
                  <p>
                    You are signed in as <strong>{currentUser?.displayName || displayName}</strong> ({currentUser?.email || 'Customer'}).
                    Access to the Support Queue is restricted to technical support operators and administrators.
                  </p>
                  <div className="forbidden-actions">
                    <button className="button primary" onClick={() => navigate('cases')}>
                      <ClipboardList size={16} />
                      Go to My Cases
                    </button>
                    <button className="button secondary" onClick={() => navigate('overview')}>
                      <LayoutDashboard size={16} />
                      Back to Overview
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">SUPPORT OPERATIONS</p>
                      <h1>Support Queue</h1>
                      <p>Triage incoming customer cases, review diagnostic evidence, and manage technician assignments.</p>
                    </div>
                    <button className="button secondary" onClick={() => void loadQueue()} disabled={queueLoading}>
                      <RotateCw size={16} className={queueLoading ? 'spin' : ''} />
                      Refresh Queue
                    </button>
                  </div>

                  {/* Triage Summary Cards */}
                  <section className="queue-stats-grid" aria-label="Queue metrics">
                    <div className="panel" style={{ padding: '16px 20px' }}>
                      <small className="eyebrow">TOTAL IN QUEUE</small>
                      <strong style={{ fontSize: 26, display: 'block', marginTop: 4 }}>
                        {queueLoading ? '—' : queueCases.length}
                      </strong>
                    </div>
                    <div className="panel" style={{ padding: '16px 20px' }}>
                      <small className="eyebrow" style={{ color: '#9d7c38' }}>UNASSIGNED / OPEN</small>
                      <strong style={{ fontSize: 26, display: 'block', marginTop: 4 }}>
                        {queueLoading ? '—' : queueCases.filter((c) => c.status === 'open' || !c.assignedTo).length}
                      </strong>
                    </div>
                    <div className="panel" style={{ padding: '16px 20px' }}>
                      <small className="eyebrow" style={{ color: '#a85b3b' }}>ESCALATED (NEEDS TECH)</small>
                      <strong style={{ fontSize: 26, display: 'block', marginTop: 4 }}>
                        {queueLoading ? '—' : queueCases.filter((c) => c.status === 'escalated').length}
                      </strong>
                    </div>
                    <div className="panel" style={{ padding: '16px 20px' }}>
                      <small className="eyebrow" style={{ color: '#4b7a54' }}>RESOLVED</small>
                      <strong style={{ fontSize: 26, display: 'block', marginTop: 4 }}>
                        {queueLoading ? '—' : queueCases.filter((c) => c.status === 'resolved').length}
                      </strong>
                    </div>
                  </section>

                  {/* Filter Bar */}
                  <div className="filters">
                    <label className="search">
                      <Search size={18} />
                      <input
                        aria-label="Search queue by title, device, case ID, or customer"
                        placeholder="Search by title, device, case ID, or customer…"
                        value={queueQuery}
                        onChange={(e) => setQueueQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter queue by category"
                      value={queueCategory}
                      onChange={(e) => setQueueCategory(e.target.value)}
                    >
                      <option value="all">All categories</option>
                      <option value="performance">Performance</option>
                      <option value="network">Internet & Wi-Fi</option>
                    </select>
                    <select
                      aria-label="Filter queue by status"
                      value={queueStatus}
                      onChange={(e) => setQueueStatus(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      {Object.entries(labels).map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Queue Table */}
                  {queueLoading ? (
                    <div className="empty">
                      <Loader2 className="spin" />
                      Loading support queue…
                    </div>
                  ) : filteredQueue.length ? (
                    <div className="queue-table-container">
                      <table className="queue-table">
                        <thead>
                          <tr>
                            <th>Case ID</th>
                            <th>Title &amp; Category</th>
                            <th>Device</th>
                            <th>Customer</th>
                            <th>Status</th>
                            <th>Assigned Staff</th>
                            <th>Last Updated</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredQueue.map((c) => (
                            <tr key={c.id}>
                              <td>
                                <span className="case-id-code" title={c.id}>
                                  {c.id.slice(0, 8)}
                                </span>
                              </td>
                              <td>
                                <div className="queue-title-cell">
                                  <strong>{c.title}</strong>
                                  <span>{categoryLabel(c.category)}</span>
                                </div>
                              </td>
                              <td>{c.deviceName}</td>
                              <td>
                                <span style={{ fontSize: 11, color: '#59544c' }}>
                                  {c.userId || 'Customer'}
                                </span>
                              </td>
                              <td>
                                <span className={`status ${c.status}`}>{labels[c.status]}</span>
                              </td>
                              <td>
                                {c.assignedTo ? (
                                  <span className="staff-badge">
                                    <User size={12} />
                                    {c.assignedTo}
                                  </span>
                                ) : (
                                  <span className="staff-unassigned">Unassigned</span>
                                )}
                              </td>
                              <td>{date(c.updatedAt)}</td>
                              <td>
                                <button
                                  className="button secondary compact"
                                  onClick={() => open(c, true)}
                                >
                                  Triage Case
                                  <ArrowRight size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty">
                      <Inbox size={32} />
                      <h3>No matching cases</h3>
                      <p>
                        {queueCases.length
                          ? 'Try clearing or modifying your search and filter criteria.'
                          : 'No customer cases are currently waiting in the support queue.'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {view === 'metrics' && (() => {
            const ready = isStaff ? queueReady : dataReady;
            const pending = loading || (isStaff && queueLoading);
            if (pending) return <p role="status">Loading workspace metrics…</p>;
            if (!ready) return <div className="empty" role="status"><h1>Metrics unavailable</h1><p>The workspace records could not be loaded. Reload to try again; an unknown population is not zero cases.</p></div>;
            const cohort = (isStaff ? queueCases : cases).slice(0, 200);
            const summary = summarizeWorkspaceMetrics(cohort);
            const ratio = (count: number, total: number) => total ? `${count} / ${total} (${(100 * count / total).toFixed(1)}%)` : 'No eligible records';
            return <>
              <div className="page-heading"><div><p className="eyebrow">RETAINED RECORD SNAPSHOT</p><h1>Workspace metrics</h1></div></div>
              <div className="alert" role="note"><strong>Demo workspace — synthetic cases; not customer results.</strong></div>
              <p>Scope: {isStaff ? 'authorized support queue' : 'your signed-in owner workspace'}. Sample: up to 200 most recently updated loaded records; older records may be omitted. Creation window: all dates represented in this sample. Snapshot collected: {isStaff ? queueAsOf : dataAsOf} (UTC), with confirmed local updates included.</p>
              <p>These are current retained records, not lifetime rates. Deleted cases are absent. Historical customer/test classification and attributable customer reports are unavailable.</p>
              <div className="metrics-grid">
                <div className="metric-card"><h2>Loaded retained cases</h2><strong className="metric-value">{summary.caseCount}</strong></div>
                <div className="metric-card"><h2>Guided checklist completion</h2><strong>{summary.coverageAvailable ? ratio(summary.completedCases, summary.caseCount) : 'Unavailable — historical check vocabulary not verified'}</strong><p>Recognized answers count, including offered unknown/not-tried. This is not repair success.</p></div>
                <div className="metric-card"><h2>Usable observation coverage</h2><strong>{summary.coverageAvailable ? ratio(summary.usableChecks, summary.totalChecks) : 'Unavailable — historical check vocabulary not verified'}</strong><p>Unknown, not-tried and invalid answers provide no usable observations.</p></div>
                <div className="metric-card"><h2>Currently marked resolved</h2><strong>{ratio(summary.resolvedCases, summary.caseCount)}</strong><p>Current status does not establish who reported it or verify a repair.</p></div>
                <div className="metric-card"><h2>Currently escalated</h2><strong>{ratio(summary.escalatedCases, summary.caseCount)}</strong><p>A recorded next step does not contact a technician.</p></div>
              </div>
              <h2>Self-reported comparisons, by metric</h2>
              <p>Each metric has its own valid-pair denominator. Improvement does not establish causation or resolution.</p>
              <div className="metrics-grid">{summary.metrics.map(metric => <div className="metric-card" key={metric.id}>
                <h3>{metric.label} ({metric.unit})</h3><p>{categoryLabel(metric.category)}</p>
                <strong>Improved: {ratio(metric.improved, metric.pairs)}</strong>
                <p>Comparable-pair coverage: {ratio(metric.pairs, summary.caseCount)} of loaded cases.</p>
              </div>)}</div>
              <div className="metrics-grid">
                <div className="metric-card disabled"><h3>Customer-reported resolution</h3><p className="metric-disabled-desc">Unavailable: attributable report history is not recorded.</p></div>
                <div className="metric-card disabled"><h3>Active handling time</h3><p className="metric-disabled-desc">Unavailable: active time is not recorded. Creation-to-update duration is not time spent.</p></div>
                <div className="metric-card disabled"><h3>AI request cost</h3><p className="metric-disabled-desc">Not enabled. No provider calls or billing records are available.</p></div>
                <div className="metric-card disabled"><h3>Paid-service receipts</h3><p className="metric-disabled-desc">Not enabled. Payments and refunds are not implemented.</p></div>
              </div>
            </>;
          })()}

          {/* VIEW: NEW CASE */}
          {view === 'new' && (
            <>
              <button className="back" onClick={() => navigate('overview')}>
                <ArrowLeft size={16} />
                Back to overview
              </button>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">01 / TELL US WHAT’S HAPPENING</p>
                  <h1>Describe the problem.</h1>
                  <p>Start with your device and the problem you’re seeing.</p>
                </div>
              </div>
              <div className="intake-grid">
                <form className="panel intake" onSubmit={create}>
                  {draftRestored && <p role="status">Restored your unfinished draft from this browser tab.</p>}
                  {draftWarning && <p role="status">{draftWarning}</p>}
                  {submission && <div className="alert" role="status"><p>An earlier save may have succeeded. Retry the same saved request to recover its case; the submitted details are locked.</p><button ref={retryTrigger} type="button" className="button secondary" disabled={busy} onClick={() => void create()}>Retry same save</button></div>}
                  {(draftRestored || submission || draftBlocked) && <button type="button" className="button secondary" disabled={busy} onClick={discardDraft}>Discard draft and start a new attempt</button>}
                  <fieldset disabled={busy || !!submission || draftBlocked || !currentUser || draftOwnerId !== currentUser.userId}>
                    <legend className="field-title">What needs attention?</legend>
                    <div className="category-options">
                      {(['performance', 'network'] as Category[]).map((c) => (
                        <button
                          type="button"
                          key={c}
                          aria-pressed={form.category === c}
                          className={form.category === c ? 'selected' : ''}
                          onClick={() => setForm({ ...form, category: c })}
                        >
                          {c === 'network' ? <Wifi size={20} /> : <Monitor size={20} />}
                          <span>{categoryLabel(c)}</span>
                          {form.category === c && <CheckCircle2 size={17} />}
                        </button>
                      ))}
                    </div>
                    <label>
                      Give your case a title
                      <input
                        required
                        minLength={3}
                        maxLength={120}
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="e.g. My laptop freezes during video calls"
                      />
                    </label>
                    <label>
                      Device name
                      <input
                        required
                        maxLength={100}
                        value={form.deviceName}
                        onChange={(e) => setForm({ ...form, deviceName: e.target.value })}
                        placeholder="e.g. Home laptop — Dell XPS 13"
                      />
                    </label>
                    <div className="form-two">
                      <label>
                        Operating system
                        <select value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })}>
                          <option value="windows11">Windows 11</option>
                          <option value="windows10">Windows 10</option>
                          <option value="macos">macOS</option>
                          <option value="other">Other / not sure</option>
                        </select>
                      </label>
                      <label>
                        Device ownership
                        <select value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })}>
                          <option value="personal">Personal device</option>
                          <option value="managed">Work or school managed</option>
                        </select>
                      </label>
                    </div>
                    {(form.os !== 'windows11' || form.ownership !== 'personal') && (
                      <p className="eligibility" role="status">
                        This first version supports personal Windows 11 computers. For managed devices, contact your IT team.
                      </p>
                    )}
                    <label>
                      What have you noticed?
                      <textarea
                        required
                        minLength={10}
                        rows={4}
                        maxLength={2000}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="What happens, when did it start, and what have you already tried?"
                      />
                      <small>{form.description.length}/2,000 · Don’t include passwords or private files.</small>
                    </label>
                    <label className="checkbox">
                      <input
                        required
                        type="checkbox"
                        checked={form.consent}
                        onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                      />
                      <span>
                        I agree to save these case details and my diagnostic answers in my account. I understand these are guided
                        checks, not a device scan or guaranteed diagnosis.
                      </span>
                    </label>
                    <div className="form-footer">
                      <button
                        type="button"
                        className="text-link"
                        onClick={() =>
                          setForm({
                            ...initial,
                            title: 'Laptop feels slow with several apps open',
                            description:
                              'My personal laptop becomes sluggish when I have a browser and a video call open. I have not recorded any measurements yet.',
                            deviceName: 'My Windows laptop',
                          })
                        }
                      >
                        Prefill an example
                      </button>
                      <button
                        className="button primary"
                        disabled={busy || loading || form.os !== 'windows11' || form.ownership !== 'personal'}
                      >
                        {busy ? <Loader2 className="spin" size={17} /> : null}
                        Save & begin
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </fieldset>
                </form>
                <aside className="intake-aside">
                  <span className="device-icon">
                    <CircleHelp size={25} />
                  </span>
                  <h2>Start with what you know.</h2>
                  <p>Include when the problem started and what you have already tried.</p>
                  <div className="aside-divider" />
                  <h3>Here’s what happens next</h3>
                  {['Follow a few guided checks', 'Record what you actually observe', 'Get an evidence-based summary'].map((s, i) => (
                    <div className="next-line" key={s}>
                      <span>{i + 1}</span>
                      {s}
                    </div>
                  ))}
                  <div className="small-note">
                    <ShieldCheck size={17} />
                    <p>Relay won’t access your device or change its settings. You perform each check yourself.</p>
                  </div>
                </aside>
              </div>
            </>
          )}

          {/* VIEW: CASE DETAIL */}
          {view === 'detail' && selected && analysis && (
            <>
              <button
                className="back"
                onClick={() => navigate(previousView.current === 'queue' && isStaff ? 'queue' : 'cases')}
              >
                <ArrowLeft size={16} />
                {previousView.current === 'queue' && isStaff ? 'Back to Support Queue' : 'All cases'}
              </button>

              {isStaff && (
                <div className="triage-hero-badge">
                  <ShieldCheck size={14} />
                  Operator Triage Mode · Case {selected.id}
                  {selected.userId && ` · Customer: ${selected.userId}`}
                </div>
              )}

              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {categoryLabel(selected.category)} · {selected.deviceName}
                  </p>
                  <h1>{selected.title}</h1>
                  <p>
                    Created {date(selected.createdAt)} · Updated {date(selected.updatedAt)}
                  </p>
                </div>
                <button className="button secondary" onClick={exportCase}>
                  <ArrowDownToLine size={17} />
                  Export case
                </button>
              </div>

              <div className="detail-grid">
                <div>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Your observations</h2>
                      <span>
                        {answered} / {checks.length} answered
                      </span>
                    </div>
                    <p className="description">{selected.description}</p>
                    <div className="check-tabs" aria-label="Diagnostic checks">
                      {checks.map((c, i) => (
                        <button
                          key={c.id}
                          className={step === i ? 'selected' : ''}
                          onClick={() => setStep(i)}
                          aria-label={`Check ${i + 1}: ${c.title}`}
                          aria-current={step === i ? 'step' : undefined}
                        >
                          {selected.answers[c.id] ? <Check size={16} /> : i + 1}
                        </button>
                      ))}
                    </div>
                    {check && (
                      <div className="check-content">
                        <p className="eyebrow">
                          CHECK {step + 1} OF {checks.length}
                        </p>
                        <h2>{check.title}</h2>
                        <p>{check.instruction}</p>
                        <div className="reason">
                          <CircleHelp size={18} />
                          <span>{check.reason}</span>
                        </div>
                        <fieldset disabled={busy}>
                          <legend>What did you observe?</legend>
                          <div className="answer-options">
                            {check.options.map((o) => (
                              <button
                                type="button"
                                key={o.value}
                                aria-pressed={selected.answers[check.id] === o.value}
                                className={selected.answers[check.id] === o.value ? 'selected' : ''}
                                onClick={() =>
                                  void patch({
                                    answers: { [check.id]: o.value },
                                    ...(selected.status === 'open' ? { status: 'in_progress' as const } : {}),
                                  })
                                }
                              >
                                <span>{o.label}</span>
                                {selected.answers[check.id] === o.value ? <CheckCircle2 size={18} /> : <span className="radio-circle" />}
                              </button>
                            ))}
                          </div>
                        </fieldset>
                        <div className="check-navigation">
                          <button className="button secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
                            <ArrowLeft size={16} />
                            Previous
                          </button>
                          <span>{busy ? 'Saving…' : 'Answers save automatically'}</span>
                          <button
                            className="button secondary"
                            disabled={step === checks.length - 1}
                            onClick={() => setStep(step + 1)}
                          >
                            Next
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Structured Measurements Entry */}
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Structured measurements</h2>
                      <span>Self-reported · Optional</span>
                    </div>
                    <p className="description">
                      Record your own readings before and after an action. Repeat the same app or service, device, location and workload; note changed conditions below. Missing readings remain unknown.
                    </p>
                    <div className="category-options" style={{ marginTop: 14 }}>
                      <button
                        type="button"
                        aria-pressed={activeMeasurementKind === 'baseline'}
                        className={activeMeasurementKind === 'baseline' ? 'selected' : ''}
                        onClick={() => setActiveMeasurementKind('baseline')}
                      >
                        <span>1. Baseline (before action)</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={activeMeasurementKind === 'followUp'}
                        className={activeMeasurementKind === 'followUp' ? 'selected' : ''}
                        onClick={() => setActiveMeasurementKind('followUp')}
                      >
                        <span>2. Follow-up (after action)</span>
                      </button>
                    </div>

                    <div className="measurement-grid">
                      {measurementDefs.map((def) => {
                        const currentInputs = activeMeasurementKind === 'baseline' ? baselineInputs : followUpInputs;
                        const savedVal = selected.measurements?.[activeMeasurementKind]?.[def.id];
                        return (
                          <div key={def.id} className="measurement-card">
                            <label htmlFor={`meas-${def.id}`}>{def.label}</label>
                            <p id={`meas-desc-${def.id}`} className="measurement-instruction">{def.instruction}</p>
                            <div className="measurement-input-row">
                              <input
                                id={`meas-${def.id}`}
                                aria-describedby={`meas-desc-${def.id} meas-unit-${def.id}`}
                                type="number"
                                step="any"
                                min={def.min}
                                max={def.max}
                                placeholder={savedVal !== undefined && savedVal !== null ? String(savedVal) : 'Not recorded'}
                                value={currentInputs[def.id] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (activeMeasurementKind === 'baseline') {
                                    setBaselineInputs((prev) => ({ ...prev, [def.id]: val }));
                                  } else {
                                    setFollowUpInputs((prev) => ({ ...prev, [def.id]: val }));
                                  }
                                }}
                              />
                              <span id={`meas-unit-${def.id}`} className="measurement-unit">{def.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="section-actions">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => void saveMeasurements(activeMeasurementKind)}
                      >
                        {busy ? <Loader2 size={16} className="spin" /> : null}
                        Save {activeMeasurementKind === 'baseline' ? 'baseline' : 'follow-up'}
                      </button>
                      <span className="muted" style={{ margin: 0 }}>
                        Saved as self-reported observations
                      </span>
                    </div>
                  </section>

                  {/* Report & Outcome Comparisons */}
                  <section className="panel report">
                    <p className="eyebrow">SUMMARY OF YOUR CHECKS</p>
                    <h2>{analysis.headline}</h2>
                    <p>{analysis.summary}</p>

                    <h3>Before &amp; after comparison</h3>
                    <p>Concrete comparison between your baseline and follow-up measurements.</p>
                    <div className="comparison-table-wrapper">
                      <table className="comparison-table">
                        <thead>
                          <tr>
                            <th>Metric</th>
                            <th>Baseline</th>
                            <th>Follow-up</th>
                            <th>Difference</th>
                            <th>Outcome</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisons.map((c) => (
                            <tr key={c.id}>
                              <td><strong>{c.label}</strong></td>
                              <td>{c.baseline !== null ? `${c.baseline} ${c.unit}` : <span className="muted">Not recorded</span>}</td>
                              <td>{c.followUp !== null ? `${c.followUp} ${c.unit}` : <span className="muted">Not recorded</span>}</td>
                              <td>
                                {c.difference !== null ? (
                                  <span>{c.difference > 0 ? `+${c.difference}` : c.difference} {c.unit}</span>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                              <td>
                                <span className={`badge badge-${c.direction}`}>
                                  {c.direction}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="muted" style={{ marginTop: 8 }}>
                      Notice: Differences reflect user-reported measurements. Observable improvement does not prove causality or guarantee full system stability.
                    </p>

                    <h3>What your observations tell us</h3>
                    <ul>
                      {analysis.findings.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>

                    <h3>Next steps to consider</h3>
                    <ol>
                      {analysis.nextSteps.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ol>

                    <div className="provenance-box">
                      <div>
                        <strong>Rule Engine Provenance:</strong> version {analysis.ruleVersion ?? '1.0.0'}
                      </div>
                      <div className="provenance-evidence">
                        {analysis.evidenceUsed?.length ?? 0} evidence inputs grounded
                      </div>
                    </div>
                    {!selected.analysisSnapshot && (
                      <p className="muted">
                        The displayed guidance uses the current rules; an earlier plan was not saved for this case.
                      </p>
                    )}

                    <div className="small-note">
                      <ShieldCheck size={18} />
                      <div>
                        {analysis.limitations.map((l) => (
                          <p key={l}>{l}</p>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>

                <aside className="detail-aside">
                  {/* Task S4-05: Operator / Staff Controls (Restricted to Support and Admin) */}
                  {isStaff ? (
                    <section className="panel staff-ops-panel">
                      <div className="section-heading">
                        <h2>Support Operations</h2>
                        <span className="role-badge staff">
                          <ShieldCheck size={12} /> Confidential
                        </span>
                      </div>

                      <div className="staff-notice-banner" role="note">
                        <Lock size={16} />
                        <div>
                          <strong>Staff Record</strong>
                          🔒 Internal Support Notes — strictly confidential, never sent in customer payloads.
                        </div>
                      </div>

                      <label htmlFor="staff-internal-notes">
                        Internal Review Notes
                        <textarea
                          id="staff-internal-notes"
                          rows={6}
                          maxLength={4000}
                          value={staffNotes}
                          onChange={(e) => setStaffNotes(e.target.value)}
                          placeholder="Record root cause analysis, diagnostic investigation, hardware test findings, or customer correspondence history..."
                          disabled={busy}
                        />
                      </label>
                      <small>{staffNotes.length}/4,000</small>

                      <label htmlFor="staff-status-select" style={{ marginTop: 14 }}>
                        Triage Status
                        <select
                          id="staff-status-select"
                          value={staffStatus}
                          disabled={busy}
                          onChange={(e) => setStaffStatus(e.target.value as CaseStatus)}
                        >
                          {Object.entries(labels).map(([v, l]) => (
                            <option value={v} key={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label htmlFor="staff-assigned-to" style={{ marginTop: 14 }}>
                        Assigned Technician
                        <input
                          id="staff-assigned-to"
                          maxLength={100}
                          value={staffAssignedTo}
                          disabled={busy}
                          onChange={(e) => setStaffAssignedTo(e.target.value)}
                          placeholder="e.g. Charlie (Support Operator)"
                        />
                      </label>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button
                          type="button"
                          className="text-link"
                          style={{ fontSize: 11 }}
                          onClick={() => setStaffAssignedTo(currentUser?.displayName || currentUser?.email || 'Charlie (Support Operator)')}
                        >
                          Assign to me
                        </button>
                        {staffAssignedTo && (
                          <button
                            type="button"
                            className="text-link"
                            style={{ fontSize: 11, color: '#9c958a' }}
                            onClick={() => setStaffAssignedTo('')}
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <button
                        className="button primary full"
                        disabled={busy}
                        onClick={() => void saveStaffUpdates()}
                        style={{ marginTop: 18 }}
                      >
                        {busy ? <Loader2 size={16} className="spin" /> : null}
                        Save Staff Updates
                      </button>
                    </section>
                  ) : (
                    /* Customer Case Status & Notes */
                    <>
                      <section className="panel">
                        <h2>Case status</h2>
                        <label className="sr-only" htmlFor="case-status">
                          Case status
                        </label>
                        <select
                          id="case-status"
                          value={selected.status}
                          disabled={busy}
                          onChange={(e) => void patch({ status: e.target.value as CaseStatus }, 'Status updated')}
                        >
                          {Object.entries(labels).map(([v, l]) => (
                            <option value={v} key={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <p className="muted">
                          “Resolved” means you have confirmed improvement. “Needs a technician” records your next step; it does not
                          contact anyone.
                        </p>
                        {selected.verifiedAt && <p className="muted">You marked this resolved on {date(selected.verifiedAt)}.</p>}
                        {selected.assignedTo && (
                          <p className="muted" style={{ marginTop: 8 }}>
                            Assigned technician: <strong>{selected.assignedTo}</strong>
                          </p>
                        )}
                      </section>

                      <section className="panel">
                        <h2>Your notes</h2>
                        <label htmlFor="case-notes" className="muted">
                          Keep a record of changes and results.
                        </label>
                        <textarea
                          id="case-notes"
                          rows={7}
                          maxLength={4000}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="What changed? Did the issue return?"
                        />
                        <small>{notes.length}/4,000</small>
                        <button
                          className="button primary full"
                          disabled={busy || notes === selected.notes}
                          onClick={() => void patch({ notes }, 'Notes saved')}
                        >
                          {busy ? <Loader2 size={16} className="spin" /> : null}
                          Save notes
                        </button>
                        <p className="muted">Save before leaving this case.</p>
                      </section>
                    </>
                  )}

                  {/* Task S4-06: Customer Deletion & Retention Dialog */}
                  <section className="panel danger-zone" onKeyDown={(event) => {
                    if (deleteOpen && event.key === 'Escape') {
                      event.preventDefault();
                      cancelDelete();
                    }
                  }}>
                    {currentUser?.role === 'support' ? (
                      <div className="danger-zone-staff-notice">
                        <ShieldAlert size={18} />
                        <div>
                          <strong>Operator Retention Policy Notice</strong>
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#7a7266' }}>
                            Support operators cannot delete customer cases. Only case owners or administrators may purge cases.
                          </p>
                        </div>
                      </div>
                    ) : deleteOpen ? (
                      <>
                        <h3>Permanently delete this case?</h3>
                        <div className="retention-box" role="alert">
                          <strong>Permanent Deletion Policy:</strong>
                          This removes the case and its saved answers and notes from the active database.
                          Existing backups may retain older copies until they expire.
                        </div>
                        <div className="delete-actions">
                          <button className="button secondary" autoFocus disabled={busy} onClick={cancelDelete}>
                            Keep case
                          </button>
                          <button className="button danger" disabled={busy} onClick={() => void remove()}>
                            Delete permanently
                          </button>
                        </div>
                      </>
                    ) : (
                      <button ref={deleteTrigger} className="text-link danger-text" onClick={() => setDeleteOpen(true)}>
                        <Trash2 size={16} />
                        Delete case
                      </button>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>Relay / Tech support</span>
          <span>Early access · Windows 11</span>
        </footer>
      </div>
    </div>
  );
}
