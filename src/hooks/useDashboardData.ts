import { useQuery } from '@tanstack/react-query';

interface DashboardMetrics {
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
}

interface TimeSeriesData {
  period: string;
  revenue: number;
}

interface DashboardData {
  metrics: DashboardMetrics;
  time_series: TimeSeriesData[];
  insights: string;
  error?: string;
}

export const useDashboardData = () => {
  return useQuery<DashboardData, Error>({
    queryKey: ['dashboardData'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("Unauthorized");
      }

      const response = await fetch('http://localhost:8000/api/dashboard/sales', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      return response.json();
    },
    // Refetch every 30 seconds for live updates
    refetchInterval: 30000, 
  });
};
