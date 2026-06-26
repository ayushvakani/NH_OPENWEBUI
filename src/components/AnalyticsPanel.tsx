/**
 * AnalyticsPanel – Full-Screen Dashboard
 *
 * Opens as a full-screen overlay with:
 *  - Top KPI stat cards (auto-loaded)
 *  - Multi-chart grid with ECharts (auto-loaded)
 *  - Custom prompt bar to add more charts
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, BarChart2, RefreshCw, Plus, Upload, FileText, Database } from 'lucide-react';
import { apiFetch, API_BASE_URL, getToken } from '@/lib/api';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface ChartCard {
    id: string;
    prompt: string;
    message: string;
    chart_config: Record<string, unknown>;
    loading?: boolean;
    error?: string;
    analysisChart?: string;
    analysisCode?: string;
    analysisOutput?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-loaded queries (run on dashboard open)
// ────────────────────────────────────────────────────────────────────────────
const AUTO_QUERIES = [
    'Show month-over-month recovery growth for 2024',           // → line
    'Show total recovery by district for 2024',                 // → horizontal bar
    'Show risk band percentage share for 2024',                 // → pie
    'Show unpaid challan count by month for 2024 as area chart',// → area
    'Show total recovery by risk band for 2024 as donut',       // → donut
    'Show total recovery by district for 2024 as funnel',       // → funnel
    'Show repeat offender count for 2024 as radar chart',       // → radar
    'Show driver count by district for 2024 as treemap',        // → treemap
    'Show unpaid challan count by district for 2024 as heatmap',// → heatmap
    'Show total recovery by month for 2024 as scatter',         // → scatter
    'Show repeat offender count for 2024 as gauge',             // → gauge
    'Show year-over-year recovery growth',                      // → line
    'Show top 5 districts by total recovery as horizontal bar',
    'Show recovery rate vs total cases as scatter plot',
    'Show heatmap of unpaid challans by month and district',
    'Show top 10 repeat offenders count as a bar chart',
    'Show recovery trend by risk band over time as line chart',
];

// ────────────────────────────────────────────────────────────────────────────
// ECharts renderer
// ────────────────────────────────────────────────────────────────────────────
function EChart({ option }: { option: Record<string, unknown> }) {
    const ref = useRef<HTMLDivElement>(null);
    const inst = useRef<unknown>(null);

    useEffect(() => {
        let dead = false;
        (async () => {
            const w = window as unknown as { echarts?: { init: (el: HTMLElement, t?: string) => unknown; getInstanceByDom: (el: HTMLElement) => unknown; registerMap?: (name: string, geo: unknown) => void } };
            if (!w.echarts) {
                await new Promise<void>((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
                    s.onload = () => res(); s.onerror = rej;
                    document.head.appendChild(s);
                });
            }
            // Load India GeoJSON for map charts
            const isMapChart = Array.isArray(option.series) &&
                (option.series as Array<{ type?: string }>).some(s => s.type === 'map');
            if (isMapChart && w.echarts?.registerMap) {
                try {
                    const ww = window as unknown as { _indiaGeoLoaded?: boolean };
                    if (!ww._indiaGeoLoaded) {
                        const r = await fetch('https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States');
                        if (r.ok) {
                            const geo = await r.json() as { features: Array<{ properties: Record<string, string> }> };
                            // ECharts needs properties.name — this GeoJSON uses NAME_1
                            geo.features.forEach(f => {
                                f.properties.name = f.properties.NAME_1 || f.properties.name || '';
                            });
                            w.echarts.registerMap?.('India', geo);
                            ww._indiaGeoLoaded = true;
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
// Data Analysis Helpers
// ────────────────────────────────────────────────────────────────────────────
const uploadCSV = async (file: File, sessionId: string): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(`${API_BASE_URL}/upload-csv?session_id=${sessionId}`, {
        method: 'POST', credentials: 'include', body: formData, headers
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
};

const dataAnalysisStream = async function* (prompt: string, sessionId: string) {
    const response = await fetch(`${API_BASE_URL}/data-analysis`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ prompt, session_id: sessionId, model: 'deepseek-coder-v2:latest' }),
    });
    if (!response.ok || !response.body) throw new Error(`HTTP error! status: ${response?.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value).split('\n').filter(line => line.trim());
            for (const line of lines) {
                try { yield JSON.parse(line); } catch (e) { continue; }
            }
        }
    } finally { reader.releaseLock(); }
};

// ────────────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────────────
interface AnalyticsPanelProps {
    open: boolean;
    onClose: () => void;
}

export function AnalyticsPanel({ open, onClose }: AnalyticsPanelProps) {
    const [cards, setCards] = useState<ChartCard[]>([]);
    const [customPrompt, setCustomPrompt] = useState('');
    const [addingCustom, setAddingCustom] = useState(false);
    const [showPromptBar, setShowPromptBar] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [sessionId] = useState(`analytics-${Date.now()}`);

    // ── India map state ─────────────────────────────────────────────────────
    const [indiaMap, setIndiaMap] = useState<{
        chart_config: Record<string, unknown>;
        message: string;
        loading: boolean;
        error?: string;
    }>({ chart_config: {}, message: '', loading: false });

    const fetchIndiaMap = useCallback(async (metric = 'unpaid_challan_count', year = 2024) => {
        setIndiaMap(prev => ({ ...prev, loading: true, error: undefined }));
        try {
            const data = await apiFetch<{ chart_config: Record<string, unknown>; message: string }>(
                `/analytics/india-map?metric=${metric}&year=${year}`);
            setIndiaMap({ chart_config: data.chart_config, message: data.message, loading: false });
        } catch (e: unknown) {
            let msg = (e as Error).message || 'Failed';
            try { msg = JSON.parse(msg).detail ?? msg; } catch { /**/ }
            setIndiaMap(prev => ({ ...prev, loading: false, error: msg }));
        }
    }, []);

    // ── fetch a single query and update or add card ──────────────────────────
    const fetchQuery = useCallback(async (prompt: string, id: string) => {
        setCards(prev => {
            const existing = prev.find(c => c.id === id);
            if (existing) return prev.map(c => c.id === id ? { ...c, loading: true, error: undefined } : c);
            return [...prev, { id, prompt, message: '', chart_config: {}, loading: true }];
        });

        try {
            const data = await apiFetch<{ chart_config: Record<string, unknown>; message: string }>('/analytics/prompt', {
                method: 'POST',
                body: JSON.stringify({ prompt }),
            });
            setCards(prev => prev.map(c => c.id === id
                ? { ...c, loading: false, message: data.message, chart_config: data.chart_config }
                : c));
        } catch (e: unknown) {
            let msg = (e as Error).message || 'Failed';
            try { msg = JSON.parse(msg).detail ?? msg; } catch { /**/ }
            setCards(prev => prev.map(c => c.id === id ? { ...c, loading: false, error: msg } : c));
        }
    }, []);

    // ── auto-load all queries when dashboard opens ────────────────────────────
    useEffect(() => {
        if (!open || loaded) return;
        setLoaded(true);
        setCards([]);
        fetchIndiaMap('unpaid_challan_count', 2024);   // India map first
        AUTO_QUERIES.forEach((q, i) => fetchQuery(q, `auto_${i}`));
    }, [open, loaded, fetchQuery, fetchIndiaMap]);

    // Reset when closed
    useEffect(() => {
        if (!open) { setLoaded(false); setCards([]); setShowPromptBar(false); setCustomPrompt(''); }
    }, [open]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            await uploadCSV(file, sessionId);
            setUploadedFile(file);
            setCards([]); // Clear the traffic dashboard

            // Generate dynamic queries based on CSV
            const info = await apiFetch<{ has_csv: boolean, columns: Array<{name: string, type: string}> }>(`/csv-info?session_id=${sessionId}`);
            if (info.has_csv && info.columns) {
                const cols = info.columns.map(c => `${c.name} (${c.type})`).join(', ');
                const prompt = `I have a dataset with these columns: ${cols}. Generate 4 interesting data analysis questions that can be answered using python pandas and plotted with matplotlib. Return ONLY a valid JSON array of 4 strings. No markdown formatting, no explanation, just the raw JSON array starting with [.`;
                
                try {
                    const response = await apiFetch<{ response: string }>('/ask', {
                        method: 'POST',
                        body: JSON.stringify({ prompt, model: 'deepseek-coder-v2:latest', session_id: sessionId })
                    });
                    
                    let clean = response.response.trim();
                    if (clean.startsWith('```')) {
                        const lines = clean.split('\n');
                        lines.shift();
                        if (lines[lines.length - 1].startsWith('```')) lines.pop();
                        clean = lines.join('\n');
                    }
                    const queries = JSON.parse(clean);
                    if (Array.isArray(queries)) {
                        queries.forEach((q: string, i: number) => {
                            runDataAnalysisQuery(q, `dynamic_${Date.now()}_${i}`);
                        });
                    }
                } catch(err) {
                    console.error("Failed to generate queries", err);
                    runDataAnalysisQuery(`Show summary statistics for numerical columns`, `dynamic_${Date.now()}_1`);
                    runDataAnalysisQuery(`Generate a correlation heatmap for numerical features`, `dynamic_${Date.now()}_2`);
                }
            }
        } catch (error) {
            console.error("Upload error:", error);
            alert('Failed to upload file: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setUploading(false);
        }
    };

    const runDataAnalysisQuery = async (q: string, id: string) => {
        setCards(prev => [...prev, { id, prompt: q, message: '', chart_config: {}, loading: true }]);
        try {
            let currentMessage = '';
            let currentCode = '';
            let currentChart = '';
            let currentOutput = '';
            
            const stream = dataAnalysisStream(q, sessionId);
            for await (const data of stream) {
                if (data.type === 'message') currentMessage += data.content;
                if (data.type === 'code') currentCode += data.content;
                if (data.type === 'output') currentOutput += data.content;
                if (data.type === 'chart') currentChart = data.content;
                
                setCards(prev => prev.map(c => c.id === id ? {
                    ...c,
                    message: currentMessage,
                    analysisCode: currentCode,
                    analysisOutput: currentOutput,
                    analysisChart: currentChart
                } : c));
            }
            
            setCards(prev => prev.map(c => c.id === id ? { ...c, loading: false } : c));
        } catch (e: unknown) {
            const msg = (e as Error).message || 'Data Analysis Failed';
            setCards(prev => prev.map(c => c.id === id ? { ...c, loading: false, error: msg } : c));
        }
    };

    const addCustom = async () => {
        const q = customPrompt.trim();
        if (!q || addingCustom) return;
        setAddingCustom(true);
        const id = `custom_${Date.now()}`;
        
        setShowPromptBar(false);
        setCustomPrompt('');
        
        if (uploadedFile) {
            await runDataAnalysisQuery(q, id);
        } else {
            await fetchQuery(q, id);
        }
        
        setAddingCustom(false);
    };

    const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') addCustom(); };

    const loadedCards = cards.filter(c => !c.loading && !c.error);
    const loadingCount = cards.filter(c => c.loading).length;

    if (!open) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#070d1a',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#e2e8f0',
            overflow: 'hidden',
        }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        .chart-card { animation: fadeUp 0.35s ease both; }
        .dash-scroll::-webkit-scrollbar { width: 5px; }
        .dash-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 5px; }
        .refresh-btn:hover { background: rgba(52,211,153,0.2) !important; }
        .close-btn:hover { background: rgba(239,68,68,0.15) !important; }
        .add-btn:hover { filter: brightness(1.15); }
      `}</style>

            {/* ── TOP NAV BAR ─────────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 28px', height: 60, flexShrink: 0,
                background: 'rgba(10,16,35,0.95)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                backdropFilter: 'blur(10px)',
            }}>
                {/* Left: brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#34d399,#22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BarChart2 size={17} color="#071019" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15, background: 'linear-gradient(90deg,#34d399,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Recovery Analytics Dashboard
                        </div>
                        <div style={{ fontSize: 11, color: '#475569' }}>NaMo RRR Programme · Live PostgreSQL Data</div>
                    </div>
                </div>

                {/* Center: status pills */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {loadingCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 20, fontSize: 12, color: '#fbbf24' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', animation: 'pulse 1s infinite' }} />
                            Loading {loadingCount} chart{loadingCount > 1 ? 's' : ''}…
                        </div>
                    )}
                    {loadingCount === 0 && loadedCards.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 20, fontSize: 12, color: '#34d399' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
                            {loadedCards.length} charts loaded
                        </div>
                    )}
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {uploadedFile && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', borderRadius: 20, fontSize: 12, color: '#22d3ee' }}>
                            <FileText size={12} />
                            {uploadedFile.name}
                        </div>
                    )}
                    
                    <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                    <button className="upload-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9, background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload Data'}
                    </button>

                    <button className="add-btn" onClick={() => { setShowPromptBar(p => !p); setTimeout(() => inputRef.current?.focus(), 100); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#34d399,#22d3ee)', border: 'none', color: '#071019', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Plus size={15} /> Add Chart
                    </button>
                    <button className="refresh-btn" onClick={() => { setLoaded(false); setCards([]); setUploadedFile(null); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="close-btn" onClick={onClose}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                        <X size={14} /> Close
                    </button>
                </div>
            </div>

            {/* ── CUSTOM PROMPT BAR (collapsible) ─────────────────────────────── */}
            {showPromptBar && (
                <div style={{ padding: '12px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,23,42,0.7)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                    <input
                        ref={inputRef}
                        value={customPrompt}
                        onChange={e => setCustomPrompt(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder='Ask anything, e.g. "Show driver count by district for 2023"'
                        disabled={addingCustom}
                        style={{ flex: 1, padding: '9px 14px', background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button onClick={addCustom} disabled={!customPrompt.trim() || addingCustom}
                        style={{ padding: '9px 20px', borderRadius: 9, background: customPrompt.trim() && !addingCustom ? 'linear-gradient(135deg,#34d399,#22d3ee)' : '#1e293b', border: 'none', color: customPrompt.trim() && !addingCustom ? '#071019' : '#475569', fontWeight: 600, fontSize: 13, cursor: customPrompt.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                        {addingCustom ? 'Loading…' : 'Generate Chart'}
                    </button>
                </div>
            )}

            {/* ── DASHBOARD GRID ───────────────────────────────────────────────── */}
            <div className="dash-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* KPI SUMMARY ROW – derived from loaded cards */}
                {loadedCards.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                        {[
                            { label: 'States Covered', value: '15', sub: 'Indian states in data', icon: '🗺️', color: '#34d399' },
                            { label: 'Data Source', value: 'PostgreSQL', sub: 'nmrrp database', icon: '🗄️', color: '#22d3ee' },
                            { label: 'Year Coverage', value: '2023–2024', sub: 'multi-year analysis', icon: '📅', color: '#a78bfa' },
                            { label: 'Insight Mode', value: 'NLP → SQL', sub: 'no raw SQL exposed', icon: '🔒', color: '#fb923c' },
                        ].map((kpi, i) => (
                            <div key={i} style={{ background: 'rgba(15,23,42,0.7)', border: `1px solid rgba(${kpi.color === '#34d399' ? '52,211,153' : kpi.color === '#22d3ee' ? '34,211,238' : kpi.color === '#a78bfa' ? '167,139,250' : '251,146,60'},0.2)`, borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, animation: 'fadeUp 0.3s ease both', animationDelay: `${i * 60}ms` }}>
                                <div style={{ width: 44, height: 44, borderRadius: 12, background: `rgba(${kpi.color === '#34d399' ? '52,211,153' : kpi.color === '#22d3ee' ? '34,211,238' : kpi.color === '#a78bfa' ? '167,139,250' : '251,146,60'},0.15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                                    {kpi.icon}
                                </div>
                                <div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{kpi.label}</div>
                                    <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>{kpi.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── INDIA STATE MAP ─────────────────────────────────────────── */}
                <div className="chart-card" style={{
                    background: 'rgba(15,23,42,0.85)',
                    border: '1px solid rgba(52,211,153,0.2)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    minHeight: 480,
                }}>
                    {/* Map header */}
                    <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                        <div>
                            <div style={{ fontSize: 13, color: '#34d399', fontWeight: 700 }}>🗺️ India State Fault Map</div>
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                                {indiaMap.message || 'Fault intensity by state · 🟢 Low → 🔴 High'}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {/* Metric selector */}
                            <select onChange={e => fetchIndiaMap(e.target.value, 2024)} defaultValue="unpaid_challan_count"
                                style={{ padding: '4px 8px', borderRadius: 7, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <option value="unpaid_challan_count">Unpaid Challans</option>
                                <option value="total_recovery_amount">Recovery Amount</option>
                                <option value="repeat_offender_count">Repeat Offenders</option>
                                <option value="driver_count">Driver Count</option>
                            </select>
                            {/* Year selector */}
                            <select onChange={e => fetchIndiaMap('unpaid_challan_count', Number(e.target.value))} defaultValue="2024"
                                style={{ padding: '4px 8px', borderRadius: 7, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <option value="2024">2024</option>
                                <option value="2023">2023</option>
                            </select>
                            <button onClick={() => fetchIndiaMap('unpaid_challan_count', 2024)}
                                style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', padding: 4 }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#334155')}>
                                <RefreshCw size={13} />
                            </button>
                        </div>
                    </div>
                    {/* Map body */}
                    <div style={{ flex: 1, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {indiaMap.loading && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 36, height: 36, border: '2.5px solid rgba(52,211,153,0.2)', borderTop: '2.5px solid #34d399', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>Loading India map…</p>
                            </div>
                        )}
                        {indiaMap.error && !indiaMap.loading && (
                            <div style={{ textAlign: 'center', padding: 20 }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
                                <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{indiaMap.error}</p>
                            </div>
                        )}
                        {!indiaMap.loading && !indiaMap.error && Object.keys(indiaMap.chart_config).length > 0 && (
                            <div style={{ width: '100%', height: 430 }}>
                                <EChart option={indiaMap.chart_config} />
                            </div>
                        )}
                    </div>
                </div>


                {/* CHARTS GRID */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 18,
                }}>
                    {cards.map((card, i) => (
                        <div key={card.id} className="chart-card" style={{
                            background: 'rgba(15,23,42,0.8)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: 16,
                            overflow: 'hidden',
                            animationDelay: `${Math.min(i * 80, 400)}ms`,
                            display: 'flex', flexDirection: 'column',
                            minHeight: 340,
                        }}>
                            {/* Card header */}
                            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {card.message || card.prompt}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {card.message ? card.prompt : ''}
                                    </div>
                                </div>
                                <button onClick={() => fetchQuery(card.prompt, card.id)}
                                    style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#334155')}>
                                    <RefreshCw size={13} />
                                </button>
                            </div>

                                {/* Card body */}
                                <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, overflowY: 'auto' }}>
                                    {card.loading && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 32, height: 32, border: '2.5px solid rgba(52,211,153,0.2)', borderTop: '2.5px solid #34d399', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                            <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{uploadedFile ? 'Analyzing data…' : 'Querying…'}</p>
                                        </div>
                                    )}
                                    {card.error && !card.loading && (
                                        <div style={{ textAlign: 'center', padding: 20 }}>
                                            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                                            <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{card.error}</p>
                                            <button onClick={() => { if (!uploadedFile) fetchQuery(card.prompt, card.id); }}
                                                style={{ marginTop: 10, padding: '5px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                                                Retry
                                            </button>
                                        </div>
                                    )}
                                    
                                    {/* Data Analysis output from CSV upload */}
                                    {!card.loading && !card.error && card.analysisChart && (
                                        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: card.analysisOutput ? 12 : 0 }}>
                                            <img src={`data:image/png;base64,${card.analysisChart}`} alt="Generated chart" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8 }} />
                                        </div>
                                    )}
                                    {!card.loading && !card.error && card.analysisOutput && (
                                        <div style={{ width: '100%', background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, fontSize: 12, color: '#94a3b8', overflowX: 'auto' }}>
                                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{card.analysisOutput}</pre>
                                        </div>
                                    )}
                                    
                                    {/* Standard EChart from dashboard query */}
                                    {!card.loading && !card.error && !card.analysisChart && card.chart_config && Object.keys(card.chart_config).length > 0 && (
                                        <div style={{ width: '100%', height: 280 }}>
                                            <EChart option={card.chart_config} />
                                        </div>
                                    )}
                                </div>
                        </div>
                    ))}

                    {/* Empty state */}
                    {cards.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16, opacity: 0.5 }}>
                            <span style={{ fontSize: 64 }}>📊</span>
                            <p style={{ margin: 0, color: '#475569', fontSize: 16 }}>Loading dashboard…</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── FOOTER ─────────────────────────────────────────────────────── */}
            <div style={{ padding: '10px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(7,13,26,0.9)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: '#1e3a5f' }}>NMRRP Analytics · Secured by JWT + RBAC · All queries parameterized</span>
                <span style={{ fontSize: 11, color: '#1e293b' }}>Powered by ECharts v5</span>
            </div>
        </div>
    );
}
