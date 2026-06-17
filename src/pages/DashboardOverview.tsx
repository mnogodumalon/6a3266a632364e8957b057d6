import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichMangel, enrichBericht } from '@/lib/enrich';
import type { EnrichedMangel } from '@/types/enriched';
import type { Baustelle } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, lookupKey } from '@/lib/formatters';
import { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { IconAlertCircle, IconTool, IconRefresh, IconCheck, IconAlertTriangle, IconPlus, IconFileText, IconClipboardList, IconX, IconChevronRight, IconMapPin, IconUser, IconPhoto, IconArrowRight, IconMessageCircle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { KanbanWidget, type KanbanCard, type KanbanColumn } from '@/components/widgets/KanbanWidget';
import { RecordOverlay, RecordHeader, RecordSection, RecordField, RecordAttachments, useRecordOverlayStack } from '@/components/widgets/RecordView';
import { MangelDialog } from '@/components/dialogs/MangelDialog';
import { BaustelleDialog } from '@/components/dialogs/BaustelleDialog';
import { BerichtDialog } from '@/components/dialogs/BerichtDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast, ENTRANCE, entranceDelay } from '@/lib/polish';
import { format } from 'date-fns';

const APPGROUP_ID = '6a3266a632364e8957b057d6';
const REPAIR_ENDPOINT = '/claude/build/repair';

// Mangel columns from schema
const MANGEL_COLUMNS: KanbanColumn[] = (LOOKUP_OPTIONS['mangel']?.['status'] ?? []).map(o => ({
  key: o.key,
  label: o.label,
  tone: o.key === 'offen' ? 'warning' : o.key === 'in_bearbeitung' ? 'primary' : 'success',
}));

function mangelTone(status: string | undefined): KanbanCard['tone'] {
  if (status === 'behoben') return 'success';
  if (status === 'in_bearbeitung') return 'primary';
  return 'warning';
}

export default function DashboardOverview() {
  const {
    baustelle, setBaustelle, mangel, setMangel, bericht,
    baustelleMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  const enrichedMangel = useMemo(() => enrichMangel(mangel, { baustelleMap }), [mangel, baustelleMap]);
  const enrichedBericht = useMemo(() => enrichBericht(bericht, { baustelleMap }), [bericht, baustelleMap]);

  // Filter state
  const [baustelleFilter, setBaustelleFilter] = useState<string | null>(null);

  // Detail-Panel: angeklickte Baustelle
  const [selectedBaustelle, setSelectedBaustelle] = useState<Baustelle | null>(null);

  // Overlay stack for details
  const overlay = useRecordOverlayStack<{ type: 'mangel' | 'baustelle' | 'bericht'; id: string }>();

  // Abschluss-Dialog state
  const [abschlussTarget, setAbschlussTarget] = useState<EnrichedMangel | null>(null);
  const [abschlussStep, setAbschlussStep] = useState<1 | 2>(1);
  const [abschlussFoto, setAbschlussFoto] = useState<File | null>(null);
  const [abschlussKommentar, setAbschlussKommentar] = useState('');
  const [abschlussUploading, setAbschlussUploading] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Dialog state
  const [mangelDialogOpen, setMangelDialogOpen] = useState(false);
  const [mangelDefaults, setMangelDefaults] = useState<Record<string, unknown> | undefined>(undefined);
  const [editMangel, setEditMangel] = useState<EnrichedMangel | null>(null);

  const [baustelleDialogOpen, setBaustelleDialogOpen] = useState(false);
  const [berichtDialogOpen, setBerichtDialogOpen] = useState(false);

  // Computed data — ALL hooks must come before early returns
  const überfälligeMängel = useMemo(() => {
    return enrichedMangel.filter(m => {
      const key = lookupKey(m.fields.status);
      if (key === 'behoben') return false;
      if (!m.fields.frist) return false;
      return m.fields.frist < today;
    });
  }, [enrichedMangel, today]);

  const offeneMängel = useMemo(() =>
    enrichedMangel.filter(m => lookupKey(m.fields.status) !== 'behoben'), [enrichedMangel]);

  const aktiveBaustellen = useMemo(() =>
    baustelle.filter(b => lookupKey(b.fields.status) === 'aktiv'), [baustelle]);

  const recenteBerichte = useMemo(() =>
    [...enrichedBericht].sort((a, b) => (b.fields.datum ?? '').localeCompare(a.fields.datum ?? '')).slice(0, 5),
    [enrichedBericht]
  );

  // Filter mängel by baustelle
  const filteredMängel = useMemo(() => {
    if (!baustelleFilter) return enrichedMangel;
    return enrichedMangel.filter(m => extractRecordId(m.fields.baustelle) === baustelleFilter);
  }, [enrichedMangel, baustelleFilter]);

  // Mängel für das Detail-Panel der ausgewählten Baustelle
  const panelMängel = useMemo(() => {
    if (!selectedBaustelle) return [];
    return enrichedMangel.filter(m => extractRecordId(m.fields.baustelle) === selectedBaustelle.record_id);
  }, [enrichedMangel, selectedBaustelle]);

  // Kanban cards
  const kanbanCards = useMemo<KanbanCard[]>(() => filteredMängel.map(m => {
    const status = lookupKey(m.fields.status) ?? MANGEL_COLUMNS[0]?.key ?? '';
    const baustelleName = m.baustelleName || 'Unbekannte Baustelle';
    return {
      id: `mangel:${m.record_id}`,
      column: status,
      title: m.fields.titel ?? 'Ohne Titel',
      subtitle: (
        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span className="truncate">{baustelleName}</span>
          {m.fields.frist && (
            <span className={m.fields.frist < today ? 'text-destructive font-medium' : ''}>
              Frist: {formatDate(m.fields.frist)}
            </span>
          )}
        </span>
      ),
      tone: mangelTone(status),
    };
  }), [filteredMängel, today]);

  // Context greeting
  const contextLine = useMemo(() => {
    if (überfälligeMängel.length > 0) {
      const names = namen(überfälligeMängel.map(m => m.fields.titel ?? ''));
      return `${names} — ${überfälligeMängel.length === 1 ? 'Frist überschritten' : 'Fristen überschritten'}.`;
    }
    if (offeneMängel.length > 0) {
      return `${offeneMängel.length} Mängel offen — ${aktiveBaustellen.length} Baustellen aktiv.`;
    }
    return `${aktiveBaustellen.length} Baustellen aktiv, alles im Zeitplan.`;
  }, [überfälligeMängel, offeneMängel, aktiveBaustellen]);

  // Direkt auf "in_bearbeitung" setzen (kein Dialog nötig)
  const advanceMangelDirect = async (m: EnrichedMangel, newKey: string) => {
    const prev = m.fields.status;
    setMangel(prev2 => prev2.map(x => x.record_id === m.record_id
      ? { ...x, fields: { ...x.fields, status: LOOKUP_OPTIONS['mangel']?.['status']?.find(o => o.key === newKey) ?? { key: newKey, label: newKey } } }
      : x));
    const label = newKey === 'in_bearbeitung' ? 'In Bearbeitung' : 'Behoben';
    undoToast(`Mangel auf „${label}" gesetzt`, async () => {
      setMangel(prev2 => prev2.map(x => x.record_id === m.record_id
        ? { ...x, fields: { ...x.fields, status: prev } }
        : x));
      const prevKey = typeof prev === 'object' && prev !== null && 'key' in prev ? (prev as { key: string }).key : (prev as unknown as string | undefined) ?? '';
      await LivingAppsService.updateMangelEntry(m.record_id, { status: prevKey });
    });
    try {
      await LivingAppsService.updateMangelEntry(m.record_id, { status: newKey });
    } catch {
      fetchAll();
    }
  };

  // Advance mangel status — öffnet Abschluss-Dialog wenn → behoben
  const advanceMangel = (m: EnrichedMangel) => {
    const currentKey = lookupKey(m.fields.status);
    if (currentKey === 'offen') {
      advanceMangelDirect(m, 'in_bearbeitung');
    } else if (currentKey === 'in_bearbeitung') {
      // Zweistufiger Abschluss-Dialog
      setAbschlussTarget(m);
      setAbschlussStep(1);
      setAbschlussFoto(null);
      setAbschlussKommentar('');
    }
  };

  // Abschluss bestätigen (nach Foto + Kommentar)
  const abschlussBestaetigen = async () => {
    if (!abschlussTarget) return;
    setAbschlussUploading(true);
    try {
      // Status auf behoben setzen (Foto/Kommentar werden im Attachments-Panel des Mangel-Dialogs gespeichert)
      await advanceMangelDirect(abschlussTarget, 'behoben');
    } catch {
      fetchAll();
    } finally {
      setAbschlussUploading(false);
      setAbschlussTarget(null);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Hero signal: überfällige Mängel
  const heroNode = überfälligeMängel.length > 0 ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      tone="destructive"
      action={{
        label: 'Jetzt bearbeiten',
        onClick: () => {
          const first = überfälligeMängel[0];
          advanceMangel(first);
        },
      }}
    >
      <b>{namen(überfälligeMängel.map(m => m.fields.titel ?? ''))}</b>
      {' '}— {überfälligeMängel.length === 1 ? 'Frist überschritten' : `${überfälligeMängel.length} Fristen überschritten`}.
      {' '}{überfälligeMängel[0].baustelleName && `Baustelle: ${überfälligeMängel[0].baustelleName}.`}
    </HeroBanner>
  ) : null;

  const kpisNode = (
    <StatCardRow>
      <StatCard
        title="Überfällig"
        value={überfälligeMängel.length}
        description={überfälligeMängel.length > 0 ? 'Frist überschritten' : 'Alle Fristen eingehalten'}
        icon={<IconAlertCircle size={18} className="text-muted-foreground" />}
        tone={überfälligeMängel.length > 0 ? 'destructive' : 'default'}
        onClick={() => setBaustelleFilter(null)}
      />
      <StatCard
        title="Offen"
        value={offeneMängel.length}
        description={offeneMängel.length > 0 ? 'Noch nicht behoben' : 'Keine offenen Mängel'}
        icon={<IconClipboardList size={18} className="text-muted-foreground" />}
        tone={offeneMängel.length > 5 ? 'warning' : 'default'}
      />
      <StatCard
        title="Aktive Baustellen"
        value={aktiveBaustellen.length}
        description={aktiveBaustellen.length > 0
          ? namen(aktiveBaustellen.map(b => b.fields.name ?? ''))
          : 'Keine aktiven Baustellen'}
        icon={<IconTool size={18} className="text-muted-foreground" />}
        tone="default"
      />
      <StatCard
        title="Berichte"
        value={bericht.length}
        description={recenteBerichte[0]?.fields.datum ? `Letzter: ${formatDate(recenteBerichte[0].fields.datum)}` : 'Noch kein Bericht'}
        icon={<IconFileText size={18} className="text-muted-foreground" />}
        tone="default"
        onClick={() => setBerichtDialogOpen(true)}
      />
    </StatCardRow>
  );

  // Aside: überfällige/offene Mängel + aktuelle Berichte
  const mangelListItems = [...überfälligeMängel, ...offeneMängel.filter(m => !überfälligeMängel.includes(m))]
    .slice(0, 6)
    .map(m => {
      const statusKey = lookupKey(m.fields.status);
      const isOverdue = m.fields.frist && m.fields.frist < today && statusKey !== 'behoben';
      const nextLabel = statusKey === 'offen' ? '→ Bearbeiten'
        : statusKey === 'in_bearbeitung' ? '✓ Behoben'
        : null;
      return {
        id: m.record_id,
        title: m.fields.titel ?? 'Ohne Titel',
        secondLine: (
          <span>
            {isOverdue
              ? <span className="font-medium text-destructive">Überfällig</span>
              : <span className="text-muted-foreground">{m.fields.status?.label ?? '—'}</span>
            }
            {m.baustelleName && <span className="text-muted-foreground"> · {m.baustelleName}</span>}
            {m.fields.frist && <span className="text-muted-foreground"> · {formatDate(m.fields.frist)}</span>}
          </span>
        ),
        action: nextLabel ? { label: nextLabel, onClick: () => advanceMangel(m) } : undefined,
      };
    });

  const berichtListItems = recenteBerichte.map(b => ({
    id: b.record_id,
    title: b.fields.titel ?? 'Ohne Titel',
    secondLine: (
      <span className="text-muted-foreground">
        {b.baustelleName || '—'}
        {b.fields.datum && <> · {formatDate(b.fields.datum)}</>}
      </span>
    ),
  }));

  const asideNode = (
    <>
      <WorkList
        title="Offene Mängel"
        icon={<IconAlertCircle size={14} className="shrink-0" />}
        items={mangelListItems}
        onItemClick={id => overlay.replace({ type: 'mangel', id })}
        empty={{
          text: 'Alle Mängel behoben — keine offenen Punkte.',
          action: { label: 'Mangel erfassen', onClick: () => { setMangelDefaults(undefined); setMangelDialogOpen(true); } },
        }}
      />
      <WorkList
        title="Letzte Berichte"
        icon={<IconFileText size={14} className="shrink-0" />}
        items={berichtListItems}
        onItemClick={id => overlay.replace({ type: 'bericht', id })}
        empty={{
          text: 'Noch kein Bericht vorhanden.',
          action: { label: 'Bericht anlegen', onClick: () => setBerichtDialogOpen(true) },
        }}
      />
    </>
  );

  // Baustellen-Kacheln: klickbar → öffnet Detail-Panel rechts
  const baustellenKacheln = baustelle.length > 0 ? (
    <div className="flex flex-wrap gap-2 mb-3">
      <button
        type="button"
        onClick={() => { setBaustelleFilter(null); setSelectedBaustelle(null); }}
        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
          baustelleFilter === null
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-card border-border text-muted-foreground hover:bg-muted'
        }`}
      >
        Alle
      </button>
      {baustelle.map(b => {
        const mangelCount = enrichedMangel.filter(m => extractRecordId(m.fields.baustelle) === b.record_id).length;
        const offenCount = enrichedMangel.filter(m => extractRecordId(m.fields.baustelle) === b.record_id && lookupKey(m.fields.status) !== 'behoben').length;
        const isActive = baustelleFilter === b.record_id;
        return (
          <button
            key={b.record_id}
            type="button"
            onClick={() => {
              setBaustelleFilter(b.record_id === baustelleFilter ? null : b.record_id);
              setSelectedBaustelle(selectedBaustelle?.record_id === b.record_id ? null : b);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <span className="truncate max-w-[12rem]">{b.fields.name ?? b.record_id}</span>
            {mangelCount > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-semibold ${
                offenCount > 0 ? 'bg-destructive/20 text-destructive' : 'bg-success/20 text-success'
              } ${isActive ? 'bg-white/20 text-inherit' : ''}`}>
                {mangelCount}
              </span>
            )}
            <IconChevronRight size={10} className="shrink-0 opacity-60" />
          </button>
        );
      })}
    </div>
  ) : null;

  const primaryNode = (
    <KanbanWidget
      cards={kanbanCards}
      columns={MANGEL_COLUMNS}
      defaultCollapsed={['behoben']}
      onCardClick={card => overlay.replace({ type: 'mangel', id: card.id.split(':')[1] ?? '' })}
      onCardMove={async (cardId, newColumn) => {
        const rid = cardId.split(':')[1];
        if (!rid) return;
        const target = mangel.find(m => m.record_id === rid);
        if (!target) return;
        const prev = target.fields.status;
        setMangel(prev2 => prev2.map(m =>
          m.record_id === rid
            ? { ...m, fields: { ...m.fields, status: LOOKUP_OPTIONS['mangel']?.['status']?.find(o => o.key === newColumn) ?? { key: newColumn, label: newColumn } } }
            : m
        ));
        const label = LOOKUP_OPTIONS['mangel']?.['status']?.find(o => o.key === newColumn)?.label ?? newColumn;
        undoToast(`Mangel auf „${label}" gesetzt`, async () => {
          setMangel(prev2 => prev2.map(m =>
            m.record_id === rid
              ? { ...m, fields: { ...m.fields, status: prev } }
              : m
          ));
          const prevKey2 = typeof prev === 'object' && prev !== null && 'key' in prev ? (prev as { key: string }).key : (prev as unknown as string | undefined) ?? '';
          await LivingAppsService.updateMangelEntry(rid, { status: prevKey2 });
        });
        try {
          await LivingAppsService.updateMangelEntry(rid, { status: newColumn });
        } catch {
          fetchAll();
        }
      }}
      onAddCard={column => {
        setMangelDefaults({ status: column, ...(baustelleFilter ? { baustelle: createRecordUrl(APP_IDS.BAUSTELLE, baustelleFilter) } : {}) });
        setEditMangel(null);
        setMangelDialogOpen(true);
      }}
    >
      {baustellenKacheln}
    </KanbanWidget>
  );

  // Overlay content
  const currentMangel = overlay.top?.type === 'mangel'
    ? enrichedMangel.find(m => m.record_id === overlay.top!.id)
    : undefined;
  const currentBericht = overlay.top?.type === 'bericht'
    ? enrichedBericht.find(b => b.record_id === overlay.top!.id)
    : undefined;
  const currentBaustelle = overlay.top?.type === 'baustelle'
    ? baustelle.find(b => b.record_id === overlay.top!.id)
    : undefined;

  const currentMangelKey = currentMangel ? lookupKey(currentMangel.fields.status) : undefined;
  const nextMangelLabel = currentMangelKey === 'offen' ? 'In Bearbeitung setzen'
    : currentMangelKey === 'in_bearbeitung' ? 'Als behoben markieren'
    : null;

  return (
    <>
      {/* Page header */}
      <div className={`flex flex-wrap items-start justify-between gap-3 mb-6 ${ENTRANCE}`}>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-xl">{contextLine}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBaustelleDialogOpen(true)}
          >
            <IconTool size={14} className="mr-1.5 shrink-0" />
            <span className="hidden sm:inline">Baustelle</span>
            <span className="sm:hidden">+</span>
          </Button>
          <Button
            size="sm"
            onClick={() => { setMangelDefaults(undefined); setEditMangel(null); setMangelDialogOpen(true); }}
          >
            <IconPlus size={14} className="mr-1.5 shrink-0" />
            <span>Mangel</span>
          </Button>
        </div>
      </div>

      <DashboardGrid
        hero={heroNode}
        kpis={kpisNode}
        aside={asideNode}
        primary={primaryNode}
      />

      {/* Mangel detail overlay */}
      <RecordOverlay
        open={overlay.open && overlay.top?.type === 'mangel'}
        onClose={overlay.close}
        ariaLabel="Mangel"
        onEdit={currentMangel ? () => { setEditMangel(currentMangel); setMangelDialogOpen(true); overlay.close(); } : undefined}
        footer={nextMangelLabel && currentMangel ? (
          <Button size="sm" onClick={() => { advanceMangel(currentMangel); overlay.close(); }}>
            {nextMangelLabel}
          </Button>
        ) : undefined}
      >
        {currentMangel && (
          <>
            <RecordHeader
              title={currentMangel.fields.titel ?? 'Ohne Titel'}
              subtitle={currentMangel.fields.status?.label}
            />
            <RecordSection title="Details" cols={2}>
              <RecordField label="Status" value={currentMangel.fields.status} format="pill" />
              <RecordField label="Frist" value={currentMangel.fields.frist} format="date" />
              <RecordField label="Baustelle" value={currentMangel.baustelleName || '—'} />
              <RecordField label="Beschreibung" value={currentMangel.fields.beschreibung} format="longtext" />
            </RecordSection>
            <RecordAttachments appId={APP_IDS.MANGEL} recordId={currentMangel.record_id} />
          </>
        )}
      </RecordOverlay>

      {/* Bericht detail overlay */}
      <RecordOverlay
        open={overlay.open && overlay.top?.type === 'bericht'}
        onClose={overlay.close}
        ariaLabel="Bericht"
      >
        {currentBericht && (
          <>
            <RecordHeader
              title={currentBericht.fields.titel ?? 'Ohne Titel'}
              subtitle={currentBericht.baustelleName}
            />
            <RecordSection title="Details" cols={2}>
              <RecordField label="Datum" value={currentBericht.fields.datum} format="date" />
              <RecordField label="Baustelle" value={currentBericht.baustelleName || '—'} />
            </RecordSection>
            <RecordAttachments appId={APP_IDS.BERICHT} recordId={currentBericht.record_id} />
          </>
        )}
      </RecordOverlay>

      {/* Baustelle detail overlay */}
      <RecordOverlay
        open={overlay.open && overlay.top?.type === 'baustelle'}
        onClose={overlay.close}
        ariaLabel="Baustelle"
      >
        {currentBaustelle && (
          <>
            <RecordHeader
              title={currentBaustelle.fields.name ?? 'Ohne Name'}
              subtitle={currentBaustelle.fields.status?.label}
            />
            <RecordSection title="Details" cols={2}>
              <RecordField label="Status" value={currentBaustelle.fields.status} format="pill" />
              <RecordField label="Adresse" value={currentBaustelle.fields.adresse} />
              <RecordField label="Bauleiter" value={currentBaustelle.fields.bauleiter} />
            </RecordSection>
            <RecordAttachments appId={APP_IDS.BAUSTELLE} recordId={currentBaustelle.record_id} />
          </>
        )}
      </RecordOverlay>

      {/* Baustellen Detail-Panel */}
      {selectedBaustelle && createPortal(
        <div
          className="fixed inset-0 z-40"
          onClick={() => setSelectedBaustelle(null)}
          aria-hidden="true"
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border shadow-xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="flex items-start justify-between gap-3 px-4 py-4 border-b border-border">
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground truncate">{selectedBaustelle.fields.name ?? 'Baustelle'}</h2>
                {(selectedBaustelle.fields.adresse || selectedBaustelle.fields.bauleiter) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {selectedBaustelle.fields.adresse && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <IconMapPin size={11} className="shrink-0" />
                        {selectedBaustelle.fields.adresse}
                      </span>
                    )}
                    {selectedBaustelle.fields.bauleiter && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <IconUser size={11} className="shrink-0" />
                        {selectedBaustelle.fields.bauleiter}
                      </span>
                    )}
                  </div>
                )}
                {selectedBaustelle.fields.status && (
                  <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {selectedBaustelle.fields.status.label}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedBaustelle(null)}
                className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg hover:bg-muted transition-colors"
                aria-label="Panel schließen"
              >
                <IconX size={16} />
              </button>
            </div>

            {/* Mängel-Liste */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Mängel ({panelMängel.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMangelDefaults({ baustelle: createRecordUrl(APP_IDS.BAUSTELLE, selectedBaustelle.record_id) });
                    setEditMangel(null);
                    setMangelDialogOpen(true);
                  }}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <IconPlus size={12} className="shrink-0" />
                  Mangel erfassen
                </button>
              </div>

              {panelMängel.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <IconCheck size={32} className="mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Keine Mängel für diese Baustelle.</p>
                </div>
              ) : (
                <ul className="px-2 pb-4 space-y-1">
                  {panelMängel.map(m => {
                    const statusKey = lookupKey(m.fields.status);
                    const isOverdue = m.fields.frist && m.fields.frist < today && statusKey !== 'behoben';
                    return (
                      <li key={m.record_id}>
                        <button
                          type="button"
                          onClick={() => overlay.replace({ type: 'mangel', id: m.record_id })}
                          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-muted/60 transition-colors"
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{m.fields.titel ?? 'Ohne Titel'}</p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                <span className={`text-xs ${
                                  isOverdue ? 'text-destructive font-medium' :
                                  statusKey === 'behoben' ? 'text-green-600' :
                                  statusKey === 'in_bearbeitung' ? 'text-primary' :
                                  'text-muted-foreground'
                                }`}>
                                  {isOverdue ? 'Überfällig' : (m.fields.status?.label ?? '—')}
                                </span>
                                {m.fields.frist && (
                                  <span className="text-xs text-muted-foreground">{formatDate(m.fields.frist)}</span>
                                )}
                              </div>
                            </div>
                            <IconChevronRight size={14} className="shrink-0 text-muted-foreground mt-1" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Zweistufiger Abschluss-Dialog */}
      {abschlussTarget && createPortal(
        <div
          className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={() => !abschlussUploading && setAbschlussTarget(null)}
        >
          <div
            className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-foreground text-base">Mangel abschließen</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[20rem]">{abschlussTarget.fields.titel ?? 'Ohne Titel'}</p>
              </div>
              <button
                type="button"
                disabled={abschlussUploading}
                onClick={() => setAbschlussTarget(null)}
                className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
                aria-label="Dialog schließen"
              >
                <IconX size={16} />
              </button>
            </div>

            {/* Schritt-Indikator */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${abschlussStep === 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${abschlussStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</span>
                Abschlussfoto
              </div>
              <IconArrowRight size={12} className="text-muted-foreground shrink-0" />
              <div className={`flex items-center gap-1.5 text-xs font-medium ${abschlussStep === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${abschlussStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</span>
                Kommentar
              </div>
            </div>

            {/* Schritt 1: Foto */}
            {abschlussStep === 1 && (
              <div className="px-5 py-6 flex flex-col gap-4">
                <div className="text-center">
                  <IconPhoto size={40} className="mx-auto mb-2 text-muted-foreground/60" stroke={1.5} />
                  <p className="text-sm text-foreground font-medium">Abschlussfoto hochladen</p>
                  <p className="text-xs text-muted-foreground mt-1">Foto des behobenen Mangels als Nachweis (optional)</p>
                </div>

                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => setAbschlussFoto(e.target.files?.[0] ?? null)}
                />

                {abschlussFoto ? (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={URL.createObjectURL(abschlussFoto)}
                      alt="Abschlussfoto"
                      className="w-full max-h-48 object-cover rounded-xl border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => { setAbschlussFoto(null); if (fotoInputRef.current) fotoInputRef.current.value = ''; }}
                      className="text-xs text-destructive hover:underline"
                    >
                      Foto entfernen
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fotoInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 w-full py-10 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/40 transition-colors text-sm text-muted-foreground"
                  >
                    <IconPhoto size={18} className="shrink-0" />
                    Foto auswählen oder aufnehmen
                  </button>
                )}

                <div className="flex justify-between gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => setAbschlussTarget(null)}>
                    Abbrechen
                  </Button>
                  <Button size="sm" onClick={() => setAbschlussStep(2)}>
                    Weiter
                    <IconArrowRight size={14} className="ml-1.5 shrink-0" />
                  </Button>
                </div>
              </div>
            )}

            {/* Schritt 2: Kommentar */}
            {abschlussStep === 2 && (
              <div className="px-5 py-6 flex flex-col gap-4">
                <div>
                  <IconMessageCircle size={40} className="mx-auto mb-2 text-muted-foreground/60" stroke={1.5} />
                  <p className="text-sm text-foreground font-medium text-center">Abschlusskommentar</p>
                  <p className="text-xs text-muted-foreground text-center mt-1">Kurze Notiz zur Behebung (optional)</p>
                </div>

                <textarea
                  value={abschlussKommentar}
                  onChange={e => setAbschlussKommentar(e.target.value)}
                  placeholder="z. B. Riss mit Epoxidharz geschlossen, Oberfläche geglättet..."
                  rows={4}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />

                {abschlussFoto && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                    <IconPhoto size={13} className="shrink-0" />
                    Foto wird hochgeladen: <span className="font-medium truncate">{abschlussFoto.name}</span>
                  </div>
                )}

                <div className="flex justify-between gap-2 mt-1">
                  <Button variant="outline" size="sm" onClick={() => setAbschlussStep(1)}>
                    Zurück
                  </Button>
                  <Button
                    size="sm"
                    onClick={abschlussBestaetigen}
                    disabled={abschlussUploading}
                  >
                    {abschlussUploading
                      ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1.5" />
                      : <IconCheck size={14} className="mr-1.5 shrink-0" />}
                    {abschlussUploading ? 'Wird gespeichert...' : 'Abschließen'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Dialogs */}
      <MangelDialog
        open={mangelDialogOpen}
        onClose={() => { setMangelDialogOpen(false); setEditMangel(null); setMangelDefaults(undefined); }}
        onSubmit={async fields => {
          if (editMangel) {
            await LivingAppsService.updateMangelEntry(editMangel.record_id, fields);
          } else {
            await LivingAppsService.createMangelEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editMangel ? editMangel.fields : mangelDefaults}
        recordId={editMangel?.record_id}
        baustelleList={baustelle}
        enablePhotoScan={AI_PHOTO_SCAN['Mangel']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Mangel']}
      />

      <BaustelleDialog
        open={baustelleDialogOpen}
        onClose={() => setBaustelleDialogOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createBaustelleEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Baustelle']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Baustelle']}
      />

      <BerichtDialog
        open={berichtDialogOpen}
        onClose={() => setBerichtDialogOpen(false)}
        onSubmit={async fields => {
          await LivingAppsService.createBerichtEntry(fields);
          fetchAll();
        }}
        baustelleList={baustelle}
        enablePhotoScan={AI_PHOTO_SCAN['Bericht']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bericht']}
      />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
