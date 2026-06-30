import React, { useState, useEffect, useRef } from 'react';
import { X, BarChart2, Plus, UploadCloud, Cpu, Zap, Maximize2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import html2pdf from 'html2pdf.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface ChartCard {
    id: string;
    prompt?: string;
    title: string;
    chart_config: Record<string, unknown>;
    loading?: boolean;
    error?: string;
    phase?: 1 | 2;  // 1 = fast model, 2 = complex model
    insight?: string;
}

interface KPI {
    label: string;
    value: string;
    sub: string;
    icon: string;
    color: string;
}

// ────────────────────────────────────────────────────────────────────────────
// ECharts renderer with world + India map support
// ────────────────────────────────────────────────────────────────────────────
function EChart({ option, onChartClick }: { option: Record<string, unknown>, onChartClick?: (params: any) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const inst = useRef<unknown>(null);

    useEffect(() => {
        let dead = false;
        (async () => {
            const w = window as unknown as {
                echarts?: {
                    init: (el: HTMLElement, t?: string) => unknown;
                    getInstanceByDom: (el: HTMLElement) => unknown;
                    registerMap?: (name: string, geo: unknown) => void;
                }
            };
            if (!w.echarts) {
                await new Promise<void>((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
                    s.onload = () => res(); s.onerror = rej;
                    document.head.appendChild(s);
                });
            }

            // Load GeoJSON for map charts
            const isMapChart = Array.isArray(option.series) &&
                (option.series as Array<{ type?: string; map?: string }>).some(s => s.type === 'map');

            if (isMapChart && w.echarts?.registerMap) {
                const mapType = (option.series as Array<{ type?: string; map?: string }>)
                    .find(s => s.type === 'map')?.map || 'India';
                try {
                    const ww = window as unknown as { _geoLoaded?: Record<string, boolean> };
                    if (!ww._geoLoaded) ww._geoLoaded = {};
                    if (!ww._geoLoaded[mapType]) {
                        if (mapType === 'India') {
                            const r = await fetch('https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States');
                            if (r.ok) {
                                const geo = await r.json() as { features: Array<{ properties: Record<string, string> }> };
                                geo.features.forEach(f => { f.properties.name = f.properties.NAME_1 || f.properties.name || ''; });
                                w.echarts.registerMap?.('India', geo);
                                ww._geoLoaded['India'] = true;
                            }
                        } else if (mapType === 'world' || mapType === 'World') {
                            const r = await fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json');
                            if (r.ok) {
                                const geo = await r.json();
                                w.echarts.registerMap?.('world', geo);
                                ww._geoLoaded['world'] = true;
                                ww._geoLoaded['World'] = true;
                            }
                        } else {
                            const wwGlobal = window as unknown as { _masterDistrictGeo?: any };
                            let geo = wwGlobal._masterDistrictGeo;
                            
                            if (!geo) {
                                const r = await fetch('https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson');
                                if (r.ok) {
                                    geo = await r.json();
                                    wwGlobal._masterDistrictGeo = geo; // Cache it permanently in memory for the session
                                }
                            }

                            if (geo && geo.features) {
                                const filteredFeatures = geo.features.filter((f: any) => f.properties.NAME_1 === mapType);
                                if (filteredFeatures.length > 0) {
                                    // Deep clone so we don't mutate the cached master object when we set .name
                                    const stateGeo = {
                                        ...geo,
                                        features: JSON.parse(JSON.stringify(filteredFeatures))
                                    };
                                    stateGeo.features.forEach((f: any) => { f.properties.name = f.properties.NAME_2 || ''; });
                                    w.echarts.registerMap?.(mapType, stateGeo);
                                    ww._geoLoaded[mapType] = true;
                                }
                            }
                        }
                    }
                } catch { /* map optional */ }
            }

            if (dead || !ref.current) return;
            const ec = (window as unknown as { echarts: { init: (el: HTMLElement, t?: string) => unknown; getInstanceByDom: (el: HTMLElement) => unknown } }).echarts;
            const ex = ec.getInstanceByDom(ref.current);
            if (ex) (ex as { dispose: () => void }).dispose();
            inst.current = ec.init(ref.current, 'dark');
            (inst.current as { setOption: (o: unknown) => void }).setOption({ backgroundColor: 'transparent', ...option });
            if (onChartClick) {
                (inst.current as { on: (e: string, cb: (p: any) => void) => void }).on('click', onChartClick);
            }
        })();
        return () => { dead = true; if (inst.current) { (inst.current as { dispose: () => void }).dispose(); inst.current = null; } };
    }, [JSON.stringify(option)]); // eslint-disable-line

    useEffect(() => {
        const el = ref.current; if (!el) return;
        const ro = new ResizeObserver(() => { if (inst.current) (inst.current as { resize: () => void }).resize(); });
        ro.observe(el); return () => ro.disconnect();
    }, []);

    return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────────────
interface AnalyticsPanelProps {
    open: boolean;
    onClose: () => void;
}

export function AnalyticsPanel({ open, onClose }: AnalyticsPanelProps) {
    const [datasetId, setDatasetId] = useState<string | null>(null);
    const [selectedState, setSelectedState] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const [cards, setCards] = useState<ChartCard[]>([]);
    const [kpis, setKpis] = useState<KPI[]>([]);
    const [expandedChart, setExpandedChart] = useState<ChartCard | null>(null);

    // Streaming state
    const [isPhase1Loading, setIsPhase1Loading] = useState(false);
    const [isPhase2Streaming, setIsPhase2Streaming] = useState(false);
    const [streamProgress, setStreamProgress] = useState(0); // 0-10 charts

    const [customPrompt, setCustomPrompt] = useState('');
    const [addingCustom, setAddingCustom] = useState(false);
    const [showPromptBar, setShowPromptBar] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    
    // Cache for dashboard states (national + individual states)
    const getInitialCache = () => {
        try {
            const cached = localStorage.getItem('nemhemai_dashboard_cache');
            return cached ? JSON.parse(cached) : {};
        } catch { return {}; }
    };
    const dashboardCache = useRef<Record<string, { kpis: KPI[], cards: ChartCard[] }>>(getInitialCache());

    const persistCache = () => {
        try {
            localStorage.setItem('nemhemai_dashboard_cache', JSON.stringify(dashboardCache.current));
        } catch (e) {
            console.error("Failed to save to localStorage", e);
        }
    };

    // Initialization and Local Storage Persistence
    useEffect(() => {
        if (open) {
            const savedId = localStorage.getItem('nemhemai_dataset_id');
            if (savedId && !datasetId && cards.length === 0) {
                setDatasetId(savedId);
                fetchPhase1(savedId).catch(() => {
                    localStorage.removeItem('nemhemai_dataset_id');
                    localStorage.removeItem('nemhemai_dashboard_cache');
                    setDatasetId(null);
                });
            }
        }
    }, [open]);

    // Cleanup fetch on unmount
    useEffect(() => () => { abortControllerRef.current?.abort(); }, []);

    // ── PHASE 1: Upload + Fast Charts ────────────────────────────────────────
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('http://localhost:8000/api/analytics/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();
            setDatasetId(data.dataset_id);
            setSelectedState(null);
            localStorage.setItem('nemhemai_dataset_id', data.dataset_id);
            localStorage.removeItem('nemhemai_dashboard_cache');
            dashboardCache.current = {};
            await fetchPhase1(data.dataset_id);
        } catch (err) {
            console.error(err);
            alert('Failed to upload dataset.');
        } finally {
            setIsUploading(false);
        }
    };

    const fetchPhase1 = async (id: string, state_filter?: string | null) => {
        const cacheKey = `${id}_${state_filter || 'national'}`;
        if (dashboardCache.current[cacheKey]) {
            setCards(dashboardCache.current[cacheKey].cards);
            setKpis(dashboardCache.current[cacheKey].kpis);
            return; // Cache hit, skip everything
        }

        setIsPhase1Loading(true);
        setCards([]);
        setKpis([]);
        try {
            const payload: any = { dataset_id: id };
            if (state_filter) payload.state_filter = state_filter;
            
            const data = await apiFetch<{ charts: ChartCard[]; kpis: KPI[] }>('/analytics/auto-charts', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const phase1Cards = data.charts.map(c => ({ ...c, phase: 1 as const }));
            setCards(phase1Cards);
            setKpis(data.kpis);
            
            dashboardCache.current[cacheKey] = { cards: phase1Cards, kpis: data.kpis };
            persistCache();

            // Kick off Phase 2 streaming after Phase 1 arrives
            startPhase2Stream(id, state_filter);
        } catch (err) {
            console.error('Phase 1 failed', err);
            throw err;
        } finally {
            setIsPhase1Loading(false);
        }
    };

    // ── PHASE 2: Complex Charts via SSE ──────────────────────────────────────
    const startPhase2Stream = async (id: string, state_filter?: string | null) => {
        console.log("startPhase2Stream TRIGGERED for dataset:", id);
        setIsPhase2Streaming(true);
        setStreamProgress(0);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const ac = new AbortController();
        abortControllerRef.current = ac;

        try {
            console.log("Calling fetch to Phase 2 stream endpoint...");
            let url = `http://localhost:8000/api/analytics/auto-charts/stream?dataset_id=${id}`;
            if (state_filter) url += `&state_filter=${encodeURIComponent(state_filter)}`;
            
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'text/event-stream' },
                signal: ac.signal
            });

            if (!res.ok || !res.body) {
                console.error("Phase 2 stream failed to connect");
                setIsPhase2Streaming(false);
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done || ac.signal.aborted) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || ''; // Keep the last incomplete part in the buffer

                for (const part of parts) {
                    if (part.startsWith('data: ')) {
                        const jsonStr = part.substring(6).trim();
                        if (!jsonStr) continue;

                        try {
                            const payload = JSON.parse(jsonStr);

                            if (payload.done) {
                                setIsPhase2Streaming(false);
                                return;
                            }
                            if (payload.error) {
                                console.error('Phase 2 stream error:', payload.error);
                                setIsPhase2Streaming(false);
                                return;
                            }
                            if (payload.kpi) {
                                setKpis(prev => {
                                    const next = [...prev, payload.kpi];
                                    const cacheKey = `${id}_${state_filter || 'national'}`;
                                    if (!dashboardCache.current[cacheKey]) dashboardCache.current[cacheKey] = { cards: [], kpis: [] };
                                    dashboardCache.current[cacheKey].kpis = next;
                                    persistCache();
                                    return next;
                                });
                                continue;
                            }
                            if (payload.chart) {
                                const newCard: ChartCard = { ...payload.chart, phase: 2 };
                                setCards(prev => {
                                    if (prev.find(c => c.id === newCard.id)) return prev;
                                    const next = [...prev, newCard];
                                    const cacheKey = `${id}_${state_filter || 'national'}`;
                                    if (!dashboardCache.current[cacheKey]) dashboardCache.current[cacheKey] = { cards: [], kpis: [] };
                                    dashboardCache.current[cacheKey].cards = next;
                                    persistCache();
                                    return next;
                                });
                                setStreamProgress(p => p + 1);
                            }
                        } catch (e) {
                            console.error('Phase 2 JSON parse error:', e, jsonStr);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Phase 2 stream failed:', e);
        } finally {
            setIsPhase2Streaming(false);
        }
    };

    // ── Custom Prompt ────────────────────────────────────────────────────────
    const addCustom = async () => {
        if (!customPrompt.trim() || !datasetId || addingCustom) return;
        
        const cid = 'custom_' + Date.now();
        setAddingCustom(true);
        setCustomPrompt('');
        setShowPromptBar(false);
        setCards(prev => [{
            id: cid,
            title: customPrompt,
            chart_config: {},
            loading: true
        }, ...prev]);

        try {
            const res = await apiFetch(`/api/analytics/custom-chart`, {
                method: 'POST',
                body: JSON.stringify({ dataset_id: datasetId, prompt: customPrompt, state_filter: selectedState })
            });
            if (res.error) throw new Error(res.error);

            setCards(prev => prev.map(c => c.id === cid ? { ...c, ...res.data, id: res.data.id || cid, loading: false } : c));
        } catch (err: any) {
            setCards(prev => prev.map(c => c.id === cid ? { ...c, error: err.message || 'Failed to generate', loading: false } : c));
        } finally {
            setAddingCustom(false);
        }
    };

    const handleDownloadPDF = async () => {
        const element = document.getElementById('dashboard-pdf-content');
        if (!element) return;
        
        const opt = {
            margin:       10,
            filename:     'NemhemAI_Analysis_Report.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        
        try {
            await html2pdf().set(opt).from(element).save();
        } catch (err) {
            console.error('Failed to download PDF:', err);
            alert('Failed to generate PDF report.');
        }
    };

    const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') addCustom(); };

    if (!open) return null;

    const totalExpected = 10;
    const totalLoaded = cards.filter(c => !c.loading).length;
    const streamPct = isPhase2Streaming ? Math.round((streamProgress / 10) * 100) : 100;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#070d1a',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#e2e8f0', overflow: 'hidden',
        }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
                @keyframes popIn { from { opacity:0; transform:scale(0.93); } to { opacity:1; transform:scale(1); } }
                @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
                @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
                @keyframes streamGlow { 0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,0)} 50%{box-shadow:0 0 0 4px rgba(52,211,153,0.2)} }
                .chart-card-p1 { animation: fadeUp 0.4s ease both; }
                .chart-card-p2 { animation: popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
                .streaming-card { animation: streamGlow 2s ease infinite; }
                .dash-scroll::-webkit-scrollbar { width: 5px; }
                .dash-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 5px; }
                .action-btn:hover { filter: brightness(1.2); transform: translateY(-1px); transition: all 0.15s; }
                .close-btn:hover { background: rgba(239,68,68,0.2) !important; }
            `}</style>

            {/* ── TOP NAV BAR ─────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 28px', height: 62, flexShrink: 0,
                background: 'rgba(7,13,26,0.98)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                backdropFilter: 'blur(12px)',
            }}>
                {/* Left: brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#34d399,#22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BarChart2 size={18} color="#071019" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15, background: 'linear-gradient(90deg,#34d399,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            AI Analytics Dashboard
                        </div>
                        <div style={{ fontSize: 11, color: '#475569' }}>Hybrid Dual-Model · 10 Charts</div>
                    </div>
                </div>

                {/* Center: streaming progress indicator */}
                {datasetId && (isPhase1Loading || isPhase2Streaming) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(15,23,42,0.8)', padding: '8px 16px', borderRadius: 20, border: '1px solid rgba(52,211,153,0.2)' }}>
                        {isPhase1Loading ? (
                            <>
                                <Zap size={13} color="#f59e0b" />
                                <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>Fast model generating...</span>
                                <div style={{ width: 16, height: 16, border: '2px solid rgba(245,158,11,0.2)', borderTop: '2px solid #f59e0b', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                            </>
                        ) : (
                            <>
                                <Cpu size={13} color="#34d399" />
                                <span style={{ fontSize: 12, color: '#34d399', fontWeight: 500 }}>
                                    AI analysing... {streamProgress}/10 complex charts
                                </span>
                                <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${streamPct}%`, background: 'linear-gradient(90deg,#34d399,#22d3ee)', borderRadius: 4, transition: 'width 0.4s ease' }} />
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Right: actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {datasetId && (
                        <>
                            {selectedState && (
                                <button className="action-btn" onClick={() => { setSelectedState(null); fetchPhase1(datasetId, null); }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    🔙 Back to National
                                </button>
                            )}
                            <label className="action-btn"
                                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <UploadCloud size={15} /> Upload
                                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
                            </label>
                            <button className="action-btn" onClick={() => { setShowPromptBar(p => !p); setTimeout(() => inputRef.current?.focus(), 100); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#34d399,#22d3ee)', border: 'none', color: '#071019', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <Plus size={15} /> Add Chart
                            </button>
                            <button className="action-btn" onClick={handleDownloadPDF}
                                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                                Download Analysis
                            </button>
                        </>
                    )}
                    <button className="close-btn" onClick={onClose}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                        <X size={14} /> Close
                    </button>
                </div>
            </div>

            {/* ── CUSTOM PROMPT BAR ──────────────────────────────────────── */}
            {showPromptBar && (
                <div style={{ padding: '12px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,23,42,0.7)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                    <input
                        ref={inputRef}
                        value={customPrompt}
                        onChange={e => setCustomPrompt(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder='e.g. "Show Revenue trend by Month as a Line Chart"'
                        disabled={addingCustom}
                        style={{ flex: 1, padding: '9px 14px', background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button onClick={addCustom} disabled={!customPrompt.trim() || addingCustom}
                        style={{ padding: '9px 20px', borderRadius: 9, background: customPrompt.trim() && !addingCustom ? 'linear-gradient(135deg,#34d399,#22d3ee)' : '#1e293b', border: 'none', color: customPrompt.trim() && !addingCustom ? '#071019' : '#475569', fontWeight: 600, fontSize: 13, cursor: customPrompt.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                        {addingCustom ? 'Generating…' : 'Generate Chart'}
                    </button>
                </div>
            )}

            {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
            <div className="dash-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
                <div id="dashboard-pdf-content" style={{ display: 'flex', flexDirection: 'column', gap: 22, minHeight: '100%', background: '#071019' }}>

                {/* UPLOAD SCREEN */}
                {!datasetId && !isUploading && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', animation: 'fadeUp 0.4s ease' }}>
                        <div style={{ padding: '50px 70px', background: 'rgba(15,23,42,0.6)', border: '1px dashed rgba(52,211,153,0.4)', borderRadius: 28, textAlign: 'center', maxWidth: 480 }}>
                            <UploadCloud size={52} color="#34d399" style={{ marginBottom: 18 }} />
                            <h2 style={{ fontSize: 24, margin: '0 0 8px', color: '#f8fafc' }}>Upload Dataset</h2>
                            <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 10px', lineHeight: 1.6 }}>
                                Drop a CSV or Excel file. Our <span style={{ color: '#34d399', fontWeight: 600 }}>Hybrid AI Engine</span> will instantly generate 3 fast charts, then stream 10 complex ones as they're analyzed by a 7B coding model.
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, margin: '20px 0', fontSize: 12, color: '#475569' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={12} color="#f59e0b" /> <span>Phase 1: qwen3.5:0.8b → 3 charts</span></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Cpu size={12} color="#34d399" /> <span>Phase 2: qwen2.5-coder:7b → 10 charts</span></div>
                            </div>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 28px', background: 'linear-gradient(135deg,#34d399,#22d3ee)', color: '#071019', fontWeight: 700, borderRadius: 14, cursor: 'pointer', fontSize: 14 }}>
                                Browse File
                                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
                            </label>
                        </div>
                    </div>
                )}

                {/* Upload spinner */}
                {isUploading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: 16, animation: 'fadeUp 0.3s ease' }}>
                        <div style={{ width: 48, height: 48, border: '3px solid rgba(52,211,153,0.15)', borderTop: '3px solid #34d399', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <p style={{ color: '#64748b', fontSize: 14 }}>Uploading dataset…</p>
                    </div>
                )}

                {/* KPI SUMMARY ROW */}
                {datasetId && kpis.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
                        {kpis.map((kpi, i) => (
                            <div key={i} style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, animation: 'fadeUp 0.3s ease both', animationDelay: `${i * 50}ms` }}>
                                <div style={{ fontSize: 28, lineHeight: 1 }}>{kpi.icon}</div>
                                <div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: '#34d399', lineHeight: 1 }}>{kpi.value}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{kpi.label}</div>
                                    <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>{kpi.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Phase 1 loading */}
                {datasetId && isPhase1Loading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 24px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 14, animation: 'fadeUp 0.3s ease' }}>
                        <div style={{ width: 24, height: 24, border: '2.5px solid rgba(245,158,11,0.2)', borderTop: '2.5px solid #f59e0b', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>⚡ Fast Model Analyzing…</div>
                            <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>qwen3.5:0.8b is generating your first 3 charts</div>
                        </div>
                    </div>
                )}

                {/* CHARTS GRID */}
                {datasetId && cards.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
                        {cards.map((card, i) => (
                            <div key={card.id}
                                className={`${card.phase === 2 ? 'chart-card-p2' : 'chart-card-p1'}${card.loading ? ' streaming-card' : ''}`}
                                style={{
                                    background: 'rgba(10,16,35,0.9)',
                                    border: card.phase === 2
                                        ? '1px solid rgba(99,102,241,0.25)'
                                        : '1px solid rgba(52,211,153,0.15)',
                                    borderRadius: 18,
                                    overflow: 'hidden',
                                    animationDelay: `${Math.min(i * 60, 300)}ms`,
                                    display: 'flex', flexDirection: 'column',
                                    minHeight: 340,
                                    position: 'relative',
                                }}>


                                {/* Card header */}
                                <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    <div style={{ fontSize: 13, color: card.phase === 2 ? '#818cf8' : '#34d399', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 60 }}>
                                        {card.title}
                                    </div>
                                    {!card.loading && (
                                        <button onClick={() => setExpandedChart(card)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Expand Chart">
                                            <Maximize2 size={16} />
                                        </button>
                                    )}
                                </div>

                                {/* Card body */}
                                <div style={{ flex: 1, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
                                    {card.loading && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 28, height: 28, border: '2.5px solid rgba(52,211,153,0.15)', borderTop: '2.5px solid #34d399', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                            <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>Querying LLM…</p>
                                        </div>
                                    )}
                                    {card.error && !card.loading && (
                                        <div style={{ textAlign: 'center', padding: 20 }}>
                                            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                                            <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{card.error}</p>
                                        </div>
                                    )}
                                    {!card.loading && !card.error && card.chart_config && Object.keys(card.chart_config).length > 0 && (
                                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <div style={{ width: '100%', height: 260 }}>
                                                <EChart option={card.chart_config} onChartClick={(params: any) => {
                                                    if (params.seriesType === 'map' && params.name) {
                                                        const mapType = (card.chart_config.series as Array<{ type?: string; map?: string }>).find(s => s.type === 'map')?.map || 'India';
                                                        if (mapType === 'India') {
                                                            setSelectedState(params.name);
                                                            if (datasetId) {
                                                                fetchPhase1(datasetId, params.name);
                                                            }
                                                        }
                                                    }
                                                }} />
                                            </div>
                                            {card.insight && (
                                                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                                                    <span style={{ color: card.phase === 2 ? '#818cf8' : '#34d399', fontWeight: 600, marginRight: 6 }}>Insight:</span>
                                                    {card.insight}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Skeleton placeholders while Phase 2 streams */}
                        {isPhase2Streaming && Array.from({ length: Math.max(0, 10 - streamProgress) }).map((_, i) => (
                            <div key={`skeleton_${i}`} style={{
                                background: 'rgba(10,16,35,0.5)',
                                border: '1px dashed rgba(99,102,241,0.15)',
                                borderRadius: 18,
                                minHeight: 340,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexDirection: 'column', gap: 12, animation: 'pulse 2s ease infinite',
                                animationDelay: `${i * 200}ms`
                            }}>
                                <Cpu size={24} color="rgba(99,102,241,0.3)" />
                                <p style={{ margin: 0, fontSize: 12, color: '#334155' }}>Complex AI chart incoming…</p>
                            </div>
                        ))}
                    </div>
                )}
                </div>
            </div>

            {/* EXPANDED CHART MODAL */}
            {expandedChart && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(5, 8, 15, 0.95)', zIndex: 99999,
                    display: 'flex', flexDirection: 'column',
                    animation: 'fadeUp 0.2s ease-out'
                }}>
                    <div style={{ padding: '20px 40px', display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <h2 style={{ color: '#f8fafc', margin: 0, fontSize: 24, fontWeight: 500 }}>{expandedChart.title}</h2>
                        <button onClick={() => setExpandedChart(null)} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#f8fafc', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex' }}>
                            <X size={24} />
                        </button>
                    </div>
                    <div style={{ flex: 1, padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '100%', height: '100%', background: '#0a1023', borderRadius: 24, padding: 20, border: '1px solid rgba(52,211,153,0.2)' }}>
                            <EChart option={expandedChart.chart_config} onChartClick={(params: any) => {
                                if (params.seriesType === 'map' && params.name) {
                                    const mapType = (expandedChart.chart_config.series as Array<{ type?: string; map?: string }>).find(s => s.type === 'map')?.map || 'India';
                                    if (mapType === 'India') {
                                        setSelectedState(params.name);
                                        setExpandedChart(null);
                                        if (datasetId) {
                                            fetchPhase1(datasetId, params.name);
                                        }
                                    }
                                }
                            }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
