import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Baustelle, Mangel } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import {
  IconBuilding,
  IconClipboardList,
  IconPlus,
  IconCheck,
  IconAlertTriangle,
  IconCalendar,
  IconUser,
  IconMapPin,
  IconFileText,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Baustelle' },
  { label: 'Mängel' },
  { label: 'Bericht' },
];

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MANGEL_STATUS_OPTIONS = LOOKUP_OPTIONS['mangel']?.['status'] ?? [
  { key: 'offen', label: 'Offen' },
  { key: 'in_bearbeitung', label: 'In Bearbeitung' },
  { key: 'behoben', label: 'Behoben' },
];

interface MangelFormState {
  titel: string;
  beschreibung: string;
  frist: string;
  status: string;
}

const EMPTY_MANGEL_FORM: MangelFormState = {
  titel: '',
  beschreibung: '',
  frist: '',
  status: MANGEL_STATUS_OPTIONS[0]?.key ?? 'offen',
};

export default function BegehungPage() {
  const [searchParams] = useSearchParams();
  const { baustelle, mangel, loading, error, fetchAll } = useDashboardData();

  // Step state — initialized from URL param
  const initialStep = (() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    return s >= 1 && s <= 3 ? s : 1;
  })();
  const [step, setStep] = useState(initialStep);

  // Selection state
  const [selectedBaustelleId, setSelectedBaustelleId] = useState<string | null>(
    searchParams.get('baustelleId') ?? null
  );

  // Mangel form
  const [mangelForm, setMangelForm] = useState<MangelFormState>(EMPTY_MANGEL_FORM);
  const [mangelSubmitting, setMangelSubmitting] = useState(false);
  const [mangelError, setMangelError] = useState<string | null>(null);

  // Track Mängel created in this session
  const [sessionMangelIds, setSessionMangelIds] = useState<string[]>([]);

  // Bericht form
  const [berichtTitel, setBerichtTitel] = useState('');
  const [berichtDatum, setBerichtDatum] = useState(getTodayString());
  const [berichtSubmitting, setBerichtSubmitting] = useState(false);
  const [berichtError, setBerichtError] = useState<string | null>(null);

  // Success state
  const [completed, setCompleted] = useState(false);
  const [completedBerichtTitel, setCompletedBerichtTitel] = useState('');

  // Auto-advance when baustelleId is in URL and we're on step 1
  useEffect(() => {
    if (selectedBaustelleId && step === 1 && !loading) {
      setStep(2);
    }
  // Only run once after initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const selectedBaustelle: Baustelle | undefined = useMemo(
    () => baustelle.find(b => b.record_id === selectedBaustelleId),
    [baustelle, selectedBaustelleId]
  );

  // All Mängel for the selected Baustelle
  const baustelleMaengel: Mangel[] = useMemo(() => {
    if (!selectedBaustelleId) return [];
    return mangel.filter(m => {
      if (!m.fields.baustelle) return false;
      return m.fields.baustelle.includes(selectedBaustelleId);
    });
  }, [mangel, selectedBaustelleId]);

  // Pre-fill Bericht title when entering step 3
  useEffect(() => {
    if (step === 3 && selectedBaustelle) {
      const today = getTodayString();
      setBerichtTitel(`Begehungsbericht – ${selectedBaustelle.fields.name ?? ''} – ${today}`);
      setBerichtDatum(today);
    }
  }, [step, selectedBaustelle]);

  const handleSelectBaustelle = (id: string) => {
    setSelectedBaustelleId(id);
    setSessionMangelIds([]);
    setStep(2);
  };

  const handleMangelSubmit = async () => {
    if (!selectedBaustelleId) return;
    if (!mangelForm.titel.trim()) {
      setMangelError('Bitte einen Titel eingeben.');
      return;
    }
    setMangelSubmitting(true);
    setMangelError(null);
    try {
      const result = await LivingAppsService.createMangelEntry({
        titel: mangelForm.titel.trim(),
        beschreibung: mangelForm.beschreibung.trim() || undefined,
        frist: mangelForm.frist || undefined,
        status: mangelForm.status,
        baustelle: createRecordUrl(APP_IDS.BAUSTELLE, selectedBaustelleId),
      });
      // Extract the new record id from the response
      if (result && typeof result === 'object') {
        const entries = Object.entries(result as Record<string, unknown>);
        if (entries.length > 0) {
          const newId = entries[0][0];
          setSessionMangelIds(prev => [...prev, newId]);
        }
      }
      await fetchAll();
      setMangelForm(EMPTY_MANGEL_FORM);
    } catch (err) {
      setMangelError(err instanceof Error ? err.message : 'Fehler beim Speichern des Mangels.');
    } finally {
      setMangelSubmitting(false);
    }
  };

  const handleBerichtSubmit = async () => {
    if (!selectedBaustelleId) return;
    if (!berichtTitel.trim()) {
      setBerichtError('Bitte einen Titel eingeben.');
      return;
    }
    if (!berichtDatum) {
      setBerichtError('Bitte ein Datum eingeben.');
      return;
    }
    setBerichtSubmitting(true);
    setBerichtError(null);
    try {
      await LivingAppsService.createBerichtEntry({
        titel: berichtTitel.trim(),
        datum: berichtDatum,
        baustelle: createRecordUrl(APP_IDS.BAUSTELLE, selectedBaustelleId),
      });
      setCompletedBerichtTitel(berichtTitel.trim());
      setCompleted(true);
      setStep(3);
    } catch (err) {
      setBerichtError(err instanceof Error ? err.message : 'Fehler beim Anlegen des Berichts.');
    } finally {
      setBerichtSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedBaustelleId(null);
    setSessionMangelIds([]);
    setMangelForm(EMPTY_MANGEL_FORM);
    setMangelError(null);
    setBerichtTitel('');
    setBerichtDatum(getTodayString());
    setBerichtError(null);
    setCompleted(false);
    setCompletedBerichtTitel('');
    setStep(1);
  };

  // Count of Mängel created in this session (cross-check with what we tracked)
  const sessionMangelCount = sessionMangelIds.length;

  return (
    <IntentWizardShell
      title="Baustellenbegehung"
      subtitle="Mängel erfassen und Begehungsbericht anlegen"
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
          <div>
            <h2 className="text-lg font-semibold text-foreground">Welche Baustelle begehst du?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Wähle die Baustelle aus, für die du die Begehung durchführst.
            </p>
          </div>
          <EntitySelectStep
            items={baustelle.map(b => ({
              id: b.record_id,
              title: b.fields.name ?? '(Ohne Name)',
              subtitle: b.fields.adresse ?? undefined,
              status: b.fields.status
                ? { key: b.fields.status.key, label: b.fields.status.label }
                : undefined,
              icon: <IconBuilding size={20} className="text-primary" />,
            }))}
            onSelect={handleSelectBaustelle}
            searchPlaceholder="Baustelle suchen..."
            emptyIcon={<IconBuilding size={32} />}
            emptyText="Keine Baustellen gefunden."
          />
        </div>
      )}

      {/* ─── Step 2: Mängel erfassen ─── */}
      {step === 2 && selectedBaustelle && (
        <div className="space-y-5">
          {/* Context card */}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <IconBuilding size={20} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">
                      {selectedBaustelle.fields.name ?? '(Ohne Name)'}
                    </h3>
                    {selectedBaustelle.fields.status && (
                      <StatusBadge
                        statusKey={selectedBaustelle.fields.status.key}
                        label={selectedBaustelle.fields.status.label}
                      />
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {selectedBaustelle.fields.adresse && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <IconMapPin size={12} className="shrink-0" />
                        <span className="truncate">{selectedBaustelle.fields.adresse}</span>
                      </p>
                    )}
                    {selectedBaustelle.fields.bauleiter && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <IconUser size={12} className="shrink-0" />
                        <span className="truncate">{selectedBaustelle.fields.bauleiter}</span>
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  Ändern
                </button>
              </div>
            </div>
          </div>

          {/* Live counter */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Mängel erfassen</h2>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200">
              <IconAlertTriangle size={14} className="text-amber-600 shrink-0" />
              <span className="text-sm font-semibold text-amber-700">
                {baustelleMaengel.length} {baustelleMaengel.length === 1 ? 'Mangel' : 'Mängel'} erfasst
                {sessionMangelCount > 0 && (
                  <span className="font-normal text-amber-600">
                    {' '}({sessionMangelCount} neu)
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Existing Mängel list */}
          {baustelleMaengel.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Vorhandene Mängel
              </p>
              <div className="space-y-2 overflow-x-auto">
                {baustelleMaengel.map(m => (
                  <div
                    key={m.record_id}
                    className={`flex items-center gap-3 p-3 rounded-xl border bg-card overflow-hidden ${
                      sessionMangelIds.includes(m.record_id)
                        ? 'border-amber-300 bg-amber-50/50'
                        : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <IconAlertTriangle size={16} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {m.fields.titel ?? '(Ohne Titel)'}
                        </span>
                        {sessionMangelIds.includes(m.record_id) && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-medium shrink-0">
                            Neu
                          </span>
                        )}
                        {m.fields.status && (
                          <StatusBadge
                            statusKey={m.fields.status.key}
                            label={m.fields.status.label}
                          />
                        )}
                      </div>
                      {m.fields.frist && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <IconCalendar size={11} className="shrink-0" />
                          Frist: {m.fields.frist}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Mangel form */}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-secondary/30">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <IconPlus size={16} className="text-primary" />
                Neuen Mangel hinzufügen
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Titel <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="z.B. Riss in der Außenwand"
                  value={mangelForm.titel}
                  onChange={e => setMangelForm(f => ({ ...f, titel: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Beschreibung
                </label>
                <textarea
                  placeholder="Detaillierte Beschreibung des Mangels..."
                  value={mangelForm.beschreibung}
                  onChange={e => setMangelForm(f => ({ ...f, beschreibung: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Status
                  </label>
                  <select
                    value={mangelForm.status}
                    onChange={e => setMangelForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {MANGEL_STATUS_OPTIONS.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Frist
                  </label>
                  <Input
                    type="date"
                    value={mangelForm.frist}
                    onChange={e => setMangelForm(f => ({ ...f, frist: e.target.value }))}
                    className="w-full"
                  />
                </div>
              </div>

              {mangelError && (
                <p className="text-sm text-destructive">{mangelError}</p>
              )}

              <Button
                onClick={handleMangelSubmit}
                disabled={mangelSubmitting || !mangelForm.titel.trim()}
                className="w-full"
                variant="outline"
              >
                {mangelSubmitting ? (
                  <>Wird gespeichert...</>
                ) : (
                  <>
                    <IconPlus size={16} className="mr-2" />
                    Mangel hinzufügen
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="flex-1 sm:flex-none"
            >
              Zurück
            </Button>
            <Button
              onClick={() => setStep(3)}
              className="flex-1"
            >
              <IconClipboardList size={16} className="mr-2" />
              Weiter zu Bericht
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Bericht erstellen / Abschluss ─── */}
      {step === 3 && !completed && selectedBaustelle && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Zusammenfassung der Begehung</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <IconBuilding size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Baustelle</p>
                    <p className="text-sm font-semibold truncate">
                      {selectedBaustelle.fields.name ?? '(Ohne Name)'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <IconAlertTriangle size={18} className="text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Mängel (Session)</p>
                    <p className="text-sm font-semibold text-amber-700">
                      {sessionMangelCount} {sessionMangelCount === 1 ? 'Mangel' : 'Mängel'} erfasst
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bericht form */}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-secondary/30">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <IconFileText size={16} className="text-primary" />
                Begehungsbericht anlegen
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Titel <span className="text-destructive">*</span>
                </label>
                <Input
                  value={berichtTitel}
                  onChange={e => setBerichtTitel(e.target.value)}
                  className="w-full"
                  placeholder="Berichtstitel eingeben..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Datum <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={berichtDatum}
                  onChange={e => setBerichtDatum(e.target.value)}
                  className="w-full"
                />
              </div>

              {berichtError && (
                <p className="text-sm text-destructive">{berichtError}</p>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="flex-1 sm:flex-none"
            >
              Zurück
            </Button>
            <Button
              onClick={handleBerichtSubmit}
              disabled={berichtSubmitting || !berichtTitel.trim() || !berichtDatum}
              className="flex-1"
            >
              {berichtSubmitting ? (
                <>Wird angelegt...</>
              ) : (
                <>
                  <IconFileText size={16} className="mr-2" />
                  Bericht anlegen
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Completion state ─── */}
      {step === 3 && completed && (
        <div className="space-y-5">
          {/* Success card */}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm text-center py-8 px-6">
            <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
              <IconCheck size={28} className="text-green-600" stroke={2.5} />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">Begehung abgeschlossen!</h2>
            <p className="text-sm text-muted-foreground">
              Alle Daten wurden erfolgreich gespeichert.
            </p>
          </div>

          {/* Summary details */}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-secondary/30">
              <h3 className="text-sm font-semibold text-foreground">Übersicht</h3>
            </div>
            <div className="divide-y">
              <div className="flex items-center gap-3 px-4 py-3">
                <IconBuilding size={16} className="text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Baustelle</p>
                  <p className="text-sm font-medium truncate">
                    {selectedBaustelle?.fields.name ?? '(Ohne Name)'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <IconAlertTriangle size={16} className="text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Erfasste Mängel (diese Session)</p>
                  <p className="text-sm font-medium">
                    {sessionMangelCount} {sessionMangelCount === 1 ? 'Mangel' : 'Mängel'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <IconFileText size={16} className="text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Bericht</p>
                  <p className="text-sm font-medium truncate">{completedBerichtTitel}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleReset} variant="outline" className="flex-1">
              <IconPlus size={16} className="mr-2" />
              Neue Begehung
            </Button>
            <a href="#/" className="flex-1">
              <Button variant="default" className="w-full">
                Zurück zum Dashboard
              </Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
