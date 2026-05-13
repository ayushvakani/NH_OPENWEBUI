import React from 'react';
import { StatsWidget } from './StatsWidget';
import { LineChartWidget } from './LineChartWidget';
import { BarChartWidget } from './BarChartWidget';
import { PieChartWidget } from './PieChartWidget';
import { salesByRegion, categoryData, timeSeriesData } from './mockData';
import { Calendar, Download, Filter, RefreshCw, AlertTriangle } from 'lucide-react';
import { useDashboardData } from '../src/hooks/useDashboardData';
import './dashboard.css';

const Dashboard: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useDashboardData();

  if (isLoading) {
    return (
      <div className="dashboard-container flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-4 text-zinc-400">
          <RefreshCw className="animate-spin text-blue-500" size={32} />
          <p>Loading sales dashboard...</p>
        </div>
      </div>
    );
  }

  // Fallback map if backend is offline or errors out
  const metrics = data?.metrics || { total_revenue: 0, total_orders: 0, avg_order_value: 0 };
  const timeSeries = data?.time_series || [];
  const insights = data?.insights || "No insights available.";

  // Map backend stats to the UI format
  const dynamicStats = [
    { label: 'Total Revenue', value: `$${metrics.total_revenue.toLocaleString()}`, trend: '+12.5%', trendType: 'up' },
    { label: 'Total Orders', value: metrics.total_orders.toString(), trend: '+5.2%', trendType: 'up' },
    { label: 'Avg Order Value', value: `$${Math.round(metrics.avg_order_value).toLocaleString()}`, trend: '-1.4%', trendType: 'down' },
    { label: 'Active Sessions', value: '1,245', trend: '+18.2%', trendType: 'up' } // Kept one static
  ];

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Business Overview</h1>
          <p className="text-zinc-400 mt-1">Real-time performance metrics and AI insights</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors">
            <Calendar size={16} />
            Live Data
          </button>
          <button 
            onClick={() => refetch()} 
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={16} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-md text-sm font-semibold hover:bg-blue-500 transition-colors text-white shadow-lg shadow-blue-900/20">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {isError && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-800 flex items-start gap-3">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-medium text-red-400">Failed to load live data</h3>
            <p className="text-red-300/70 text-sm mt-1">{error?.message}. Displaying fallback data.</p>
          </div>
        </div>
      )}

      {/* AI Insights Banner */}
      <div className="mb-8 p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🧠</span>
          <h2 className="text-emerald-400 font-semibold tracking-wide">AI Financial Insights</h2>
        </div>
        <p className="text-emerald-50 text-sm leading-relaxed">{insights}</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-row">
        {dynamicStats.map((stat, i) => (
          <StatsWidget 
            key={i} 
            label={stat.label} 
            value={stat.value} 
            trend={stat.trend} 
            trendType={stat.trendType as 'up' | 'down'} 
          />
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LineChartWidget data={timeSeries.length > 0 ? timeSeries : timeSeriesData} title="Revenue Growth" />
        </div>
        <div className="lg:col-span-1">
          <PieChartWidget data={categoryData} title="Traffic Source" />
        </div>
        <div className="lg:col-span-1">
          <BarChartWidget data={salesByRegion} title="Sales by Region" />
        </div>
        <div className="lg:col-span-2">
          <div className="dashboard-card h-full">
            <div className="card-title">Key Performance Indicators</div>
            <div className="space-y-4 mt-4">
              {[
                { name: 'Customer Satisfaction', value: 94, color: 'bg-emerald-500' },
                { name: 'Server Uptime', value: 99.9, color: 'bg-blue-500' },
                { name: 'Lead Conversion', value: 12.4, color: 'bg-amber-500' },
              ].map((kpi, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">{kpi.name}</span>
                    <span className="font-medium">{kpi.value}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div 
                      className={`${kpi.color} h-2 rounded-full transition-all duration-1000`} 
                      style={{ width: `${kpi.value}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
