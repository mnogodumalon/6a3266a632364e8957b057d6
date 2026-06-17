import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { StatusBadge } from '@/components/StatusBadge';
import { BudgetTracker } from '@/components/BudgetTracker';
import { Button } from '@/components/ui/button';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Baustelle, Mangel } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import {
  IconBuilding,
  IconListCheck,
  IconCircleCheck,
  IconUser,
  IconMapPin,
  IconCalendar,
  IconRefresh,
  IconFileText,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Baustelle' },
  { label: 'Mängel' },
  { label: 'Abschlussbericht' },
];

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateDE(dateStr?: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

const MANGEL_STATUS_OPTIONS = LOOKUP_OPTIONS['mangel']?.['status'] ?? [
  { key: 'offen', label: 'Offen' },
  { key: 'in_bearbeitung', label: 'In Bearbeitung' },
  { key: 'behoben', label: 'Behoben' },
];

const DONE_KEYS = new Set(['behoben', 'erledigt', 'geschlossen', 'abgeschlossen']);

function isDone(statusKey?: string): boolean {
  if (!statusKey) return false;
  return DONE_KEYS.has(statusKey);
}

function isOpenMangel(statusKey?: string): boolean {
  if (!statusKey) return true;
  return !isDone(statusKey);
}

interface MangelCardState {
  recordId: string;
  titel: string;
  beschreibung?: string;
  frist?: string;
  statusKey: string;
  statusLabel: string;
  updating: boolean;
  selectedStatus: string;
}

export default function MaengelabschlussPage() {
  const { baustelle, mangel, loading, error, fetchAll } = useDashboardData();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<number>(() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    return s >= 1 && s <= 3 ? s : 1;
  });

  const [selectedBaustelleId, setSelectedBaustelleId] = useState<string | null>(
    () => searchParams.get('baustelleId') ?? null
  );

  const [maengelCards, setMaengelCards] = useState<MangelCardState[]>([]);
  const [berichtTitel, setBerichtTitel] = useState('');
  const [berichtDatum, setBerichtDatum] = useState(getTodayString());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [createdBerichtId, setCreatedBerichtId] = useState<string | null>(null);

  // Auto-advance when baustelleId is in URL
  useEffect(() => {
    const baustelleId = searchParams.get('baustelleId');
    if (baustelleId && step === 1) {
      setSelectedBaustelleId(baustelleId);
      setStep(2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build maengel cards when baustelle is selected and data loads
  const baustelleMaengel = useMemo<Mangel[]>(() => {
    if (!selectedBaustelleId) return [];
    const expectedUrl = createRecordUrl(APP_IDS.BAUSTELLE, selectedBaustelleId);
    return mangel.filter(m => {
      const baustelleUrl = m.fields.baustelle;
      if (!baustelleUrl) return false;
      const extractedId = extractRecordId(baustelleUrl);
      return extractedId === selectedBaustelleId || baustelleUrl === expectedUrl;
    });
  }, [mangel, selectedBaustelleId]);

  useEffect(() => {
    if (step === 2) {
      setMaengelCards(
        baustelleMaengel.map(m => ({
          recordId: m.record_id,
          titel: m.fields.titel ?? '(Kein Titel)',
          beschreibung: m.fields.beschreibung,
          frist: m.fields.frist,
          statusKey: m.fields.status?.key ?? 'offen',
          statusLabel: m.fields.status?.label ?? 'Offen',
          updating: false,
          selectedStatus: m.fields.status?.key ?? 'offen',
        }))
      );
    }
  }, [step, baustelleMaengel]);

  const selectedBaustelle = useMemo<Baustelle | null>(
    () => baustelle.find(b => b.record_id === selectedBaustelleId) ?? null,
    [baustelle, selectedBaustelleId]
  );

  // Progress stats
  const totalMaengel = maengelCards.length;
  const closedMaengel = maengelCards.filter(c => isDone(c.statusKey)).length;
  const openMaengel = totalMaengel - closedMaengel;

  // Count open mängel per baustelle for step 1
  const openCountPerBaustelle = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    mangel.forEach(m => {
      const id = extractRecordId(m.fields.baustelle ?? '');
      if (!id) return;
      if (isOpenMangel(m.fields.status?.key)) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    });
    return counts;
  }, [mangel]);

  // Pre-fill bericht titel when entering step 3
  useEffect(() => {
    if (step === 3 && selectedBaustelle) {
      const today = getTodayString();
      setBerichtTitel(`Abschlussbericht – ${selectedBaustelle.fields.name ?? ''} – ${today}`);
      setBerichtDatum(today);
    }
  }, [step, selectedBaustelle]);

  const handleSelectBaustelle = (id: string) => {
    setSelectedBaustelleId(id);
    setStep(2);
  };

  const handleStatusChange = (recordId: string, newKey: string) => {
    setMaengelCards(prev =>
      prev.map(c => c.recordId === recordId ? { ...c, selectedStatus: newKey } : c)
    );
  };

  const handleUpdateStatus = async (recordId: string) => {
    const card = maengelCards.find(c => c.recordId === recordId);
    if (!card) return;
    setMaengelCards(prev =>
      prev.map(c => c.recordId === recordId ? { ...c, updating: true } : c)
    );
    try {
      await LivingAppsService.updateMangelEntry(recordId, { status: card.selectedStatus });
      const opt = MANGEL_STATUS_OPTIONS.find(o => o.key === card.selectedStatus);
      setMaengelCards(prev =>
        prev.map(c =>
          c.recordId === recordId
            ? { ...c, statusKey: card.selectedStatus, statusLabel: opt?.label ?? card.selectedStatus, updating: false }
            : c
        )
      );
      void fetchAll();
    } catch {
      setMaengelCards(prev =>
        prev.map(c => c.recordId === recordId ? { ...c, updating: false } : c)
      );
    }
  };

  const handleCreateBericht = async () => {
    if (!selectedBaustelleId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createBerichtEntry({
        titel: berichtTitel,
        datum: berichtDatum,
        baustelle: createRecordUrl(APP_IDS.BAUSTELLE, selectedBaustelleId),
      });
      // extract the created record id from the result
      const entries = Object.entries(result ?? {});
      if (entries.length > 0) {
        setCreatedBerichtId(entries[0][0]);
      }
      setDone(true);
      void fetchAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unbekannter Fehler beim Erstellen des Berichts.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedBaustelleId(null);
    setMaengelCards([]);
    setBerichtTitel('');
    setBerichtDatum(getTodayString());
    setSubmitError(null);
    setDone(false);
    setCreatedBerichtId(null);
    setStep(1);
  };

  // ---- Render ----

  if (done && selectedBaustelle) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <div className="rounded-2xl border bg-card shadow-lg overflow-hidden p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <IconCircleCheck size={36} className="text-green-600" stroke={1.5} />
          </div>
          <h2 className="text-2xl font-bold">Abschluss dokumentiert!</h2>
          <p className="text-muted-foreground">
            Der Abschlussbericht wurde erfolgreich angelegt.
          </p>
          <div className="rounded-xl border bg-secondary/40 p-4 text-left space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <IconBuilding size={15} />
              <span className="font-medium text-foreground">{selectedBaustelle.fields.name}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <IconListCheck size={15} />
              <span>
                <span className="font-semibold text-green-700">{closedMaengel}</span> von{' '}
                <span className="font-semibold">{totalMaengel}</span> Mängeln behoben
              </span>
            </div>
            {openMaengel > 0 && (
              <div className="flex items-center gap-2 text-amber-600">
                <IconListCheck size={15} />
                <span>{openMaengel} Mängel noch offen</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <IconFileText size={15} />
              <span>Bericht: <span className="font-medium text-foreground">{berichtTitel}</span></span>
            </div>
            {createdBerichtId && (
              <div className="text-xs text-muted-foreground">Bericht-ID: {createdBerichtId}</div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button onClick={handleReset} className="flex-1">
              <IconRefresh size={16} className="mr-2" />
              Neue Baustelle abschließen
            </Button>
            <a href="#/" className="flex-1">
              <Button variant="outline" className="w-full">Zurück zum Dashboard</Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title="Mängelabschluss"
      subtitle="Offene Mängel abarbeiten und Abschlussbericht erstellen"
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ─── Step 1: Baustelle wählen ─── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wähle die Baustelle, deren Mängel du abschließen möchtest.
          </p>
          <EntitySelectStep
            searchPlaceholder="Baustelle suchen..."
            emptyIcon={<IconBuilding size={32} />}
            emptyText="Keine Baustellen gefunden."
            items={baustelle.map(b => {
              const openCount = openCountPerBaustelle[b.record_id] ?? 0;
              return {
                id: b.record_id,
                title: b.fields.name ?? '(Kein Name)',
                subtitle: b.fields.adresse,
                status: b.fields.status
                  ? { key: b.fields.status.key, label: b.fields.status.label }
                  : undefined,
                stats: [
                  { label: 'Offene Mängel', value: openCount },
                ],
                icon: <IconBuilding size={20} className="text-primary" />,
              };
            })}
            onSelect={handleSelectBaustelle}
          />
        </div>
      )}

      {/* ─── Step 2: Mängel Status aktualisieren ─── */}
      {step === 2 && selectedBaustelle && (
        <div className="space-y-5">
          {/* Baustelle context card */}
          <div className="rounded-xl border bg-card overflow-hidden p-4 space-y-2">
            <div className="flex items-center gap-2">
              <IconBuilding size={18} className="text-primary shrink-0" />
              <span className="font-semibold text-base truncate">{selectedBaustelle.fields.name}</span>
              {selectedBaustelle.fields.status && (
                <StatusBadge
                  statusKey={selectedBaustelle.fields.status.key}
                  label={selectedBaustelle.fields.status.label}
                />
              )}
            </div>
            {selectedBaustelle.fields.adresse && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconMapPin size={14} className="shrink-0" />
                <span className="truncate">{selectedBaustelle.fields.adresse}</span>
              </div>
            )}
            {selectedBaustelle.fields.bauleiter && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconUser size={14} className="shrink-0" />
                <span className="truncate">{selectedBaustelle.fields.bauleiter}</span>
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Fortschritt</span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-green-700">{closedMaengel}</span> von{' '}
                <span className="font-semibold">{totalMaengel}</span> Mängeln abgeschlossen
              </span>
            </div>
            <BudgetTracker
              budget={totalMaengel}
              booked={closedMaengel}
              label="Mängel abgeschlossen"
              showRemaining={false}
            />
          </div>

          {/* Mängel cards */}
          {maengelCards.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <IconListCheck size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Keine Mängel für diese Baustelle gefunden.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {maengelCards.map(card => (
                <div
                  key={card.recordId}
                  className="rounded-xl border bg-card overflow-hidden p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{card.titel}</p>
                      {card.beschreibung && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {card.beschreibung}
                        </p>
                      )}
                    </div>
                    <StatusBadge statusKey={card.statusKey} label={card.statusLabel} />
                  </div>
                  {card.frist && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <IconCalendar size={13} className="shrink-0" />
                      <span>Frist: {formatDateDE(card.frist)}</span>
                    </div>
                  )}
                  <div className="flex gap-2 items-center flex-wrap">
                    <select
                      value={card.selectedStatus}
                      onChange={e => handleStatusChange(card.recordId, e.target.value)}
                      disabled={card.updating}
                      className="flex-1 min-w-0 rounded-md border border-input bg-background text-sm px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      {MANGEL_STATUS_OPTIONS.map(opt => (
                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant={isDone(card.selectedStatus) ? 'default' : 'outline'}
                      disabled={card.updating || card.selectedStatus === card.statusKey}
                      onClick={() => handleUpdateStatus(card.recordId)}
                      className="shrink-0"
                    >
                      {card.updating ? (
                        <IconRefresh size={14} className="mr-1 animate-spin" />
                      ) : (
                        <IconCircleCheck size={14} className="mr-1" />
                      )}
                      Aktualisieren
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(1)} className="sm:w-auto">
              Baustelle wechseln
            </Button>
            <Button onClick={() => setStep(3)} className="flex-1">
              Weiter zu Abschlussbericht
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Abschlussbericht erstellen ─── */}
      {step === 3 && selectedBaustelle && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="rounded-xl border bg-secondary/40 overflow-hidden p-4 space-y-2 text-sm">
            <div className="font-semibold text-base flex items-center gap-2">
              <IconBuilding size={16} className="text-primary shrink-0" />
              <span className="truncate">{selectedBaustelle.fields.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
              <div>
                Mängel gesamt: <span className="font-semibold text-foreground">{totalMaengel}</span>
              </div>
              <div>
                Behoben:{' '}
                <span className="font-semibold text-green-700">{closedMaengel}</span>
              </div>
              <div>
                Noch offen:{' '}
                <span className={`font-semibold ${openMaengel > 0 ? 'text-amber-700' : 'text-foreground'}`}>
                  {openMaengel}
                </span>
              </div>
            </div>
          </div>

          {/* Bericht form */}
          <div className="rounded-xl border bg-card overflow-hidden p-4 space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <IconFileText size={16} className="text-primary" />
              Abschlussbericht
            </h3>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Titel
              </label>
              <input
                type="text"
                value={berichtTitel}
                onChange={e => setBerichtTitel(e.target.value)}
                className="w-full rounded-md border border-input bg-background text-sm px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Titel des Abschlussberichts"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Datum
              </label>
              <input
                type="date"
                value={berichtDatum}
                onChange={e => setBerichtDatum(e.target.value)}
                className="w-full rounded-md border border-input bg-background text-sm px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {submitError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="sm:w-auto">
              Zurück zu Mängeln
            </Button>
            <Button
              onClick={handleCreateBericht}
              disabled={submitting || !berichtTitel.trim() || !berichtDatum}
              className="flex-1"
            >
              {submitting ? (
                <>
                  <IconRefresh size={16} className="mr-2 animate-spin" />
                  Wird erstellt…
                </>
              ) : (
                <>
                  <IconCircleCheck size={16} className="mr-2" />
                  Abschlussbericht erstellen
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
