import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface DBConnection {
  id: number;
  name: string;
  db_type: string;
  host: string | null;
  port: number | null;
  database: string;
  username: string | null;
  is_active: number;
  created_at: string;
  last_used: string | null;
}

interface Table {
  name: string;
  row_count?: number;
}

interface DatabaseManagerProps {
  onDataLoaded?: (data: any[], tableName: string) => void;
}

const DatabaseManager: React.FC<DatabaseManagerProps> = ({ onDataLoaded }) => {
  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any>(null);
  const [showQueryEditor, setShowQueryEditor] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    db_type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: '',
    username: '',
    password: ''
  });
  
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load connections on component mount
  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const data = await apiFetch<DBConnection[]>('/db-connections');
      setConnections(data);
    } catch (error) {
      console.warn('Failed to load connections, this is normal if the feature is uninitialized:', error);
      setConnections([]); // Just default to empty array
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ success: boolean; message: string }>('/db-connections/test', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.message
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    try {
      await apiFetch('/db-connections', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      
      setMessage({ type: 'success', text: 'Connection saved successfully!' });
      setShowForm(false);
      setFormData({
        name: '',
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: '',
        username: '',
        password: ''
      });
      loadConnections();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save connection' });
    }
  };

  const handleSelectConnection = async (connId: number) => {
    setSelectedConnection(connId);
    setSelectedTable(null);
    setTableData(null);
    
    try {
      const result = await apiFetch<{ tables: string[] }>(`/db-connections/${connId}/tables`);
      setTables(result.tables);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load tables' });
    }
  };

  const handleSelectTable = async (tableName: string) => {
    setSelectedTable(tableName);
    
    if (!selectedConnection) return;
    
    try {
      const data = await apiFetch<any>(`/db-connections/${selectedConnection}/tables/${tableName}/sample?limit=10`);
      setTableData(data);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load table data' });
    }
  };

  const handleLoadTableData = async () => {
    if (!selectedConnection || !selectedTable) return;
    
    try {
      const data = await apiFetch<any>(`/db-connections/${selectedConnection}/tables/${selectedTable}/sample?limit=1000`);
      
      if (onDataLoaded && data.sample_rows) {
        onDataLoaded(data.sample_rows, selectedTable);
        setMessage({ type: 'success', text: `Loaded ${data.sample_rows.length} rows from ${selectedTable}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load table data' });
    }
  };

  const handleExecuteQuery = async () => {
    if (!selectedConnection || !sqlQuery.trim()) return;
    
    try {
      const result = await apiFetch<any>(`/db-connections/${selectedConnection}/query`, {
        method: 'POST',
        body: JSON.stringify({ query: sqlQuery, limit: 1000 })
      });
      
      if (onDataLoaded && result.data) {
        onDataLoaded(result.data, 'query_result');
        setMessage({ type: 'success', text: `Query returned ${result.row_count} rows` });
        setShowQueryEditor(false);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Query execution failed' });
    }
  };

  const handleDelete = async (connId: number) => {
    if (!confirm('Delete this database connection?')) return;
    
    try {
      await apiFetch(`/db-connections/${connId}`, { method: 'DELETE' });
      setMessage({ type: 'success', text: 'Connection deleted' });
      loadConnections();
      if (selectedConnection === connId) {
        setSelectedConnection(null);
        setTables([]);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete connection' });
    }
  };

  const updatePort = (dbType: string) => {
    const ports: { [key: string]: number } = {
      'mysql': 3306,
      'postgresql': 5432,
      'sqlserver': 1433,
      'oracle': 1521
    };
    setFormData({ ...formData, db_type: dbType, port: ports[dbType] || 3306 });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Database Connections</h3>
        <div className="space-x-2">
          <button
            onClick={() => loadConnections()}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
          >
            + New Connection
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-3 rounded text-sm ${
          message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Connection Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-white mb-4">New Database Connection</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Connection Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                  required
                  placeholder="My Production DB"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Database Type</label>
                <select
                  value={formData.db_type}
                  onChange={(e) => updatePort(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="mysql">MySQL</option>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="sqlite">SQLite</option>
                  <option value="sqlserver">SQL Server</option>
                </select>
              </div>

              {formData.db_type !== 'sqlite' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Host</label>
                      <input
                        type="text"
                        value={formData.host}
                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                        placeholder="localhost"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Port</label>
                      <input
                        type="number"
                        value={formData.port}
                        onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  {formData.db_type === 'sqlite' ? 'Database Path' : 'Database Name'}
                </label>
                <input
                  type="text"
                  value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                  required
                  placeholder={formData.db_type === 'sqlite' ? '/path/to/database.db' : 'mydb'}
                />
              </div>

              {formData.db_type !== 'sqlite' && (
                <>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Username</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Password</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded text-sm transition-colors"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Query Editor Modal */}
      {showQueryEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl border border-slate-700">
            <h3 className="text-xl font-semibold text-white mb-4">SQL Query Editor</h3>
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
              rows={8}
              placeholder="SELECT * FROM table_name WHERE ..."
            />
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => setShowQueryEditor(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteQuery}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
              >
                Execute Query
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Connections List */}
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
          <h4 className="text-sm font-semibold text-slate-300 mb-3">Saved Connections</h4>
          <div className="space-y-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className={`p-3 rounded cursor-pointer transition-colors ${
                  selectedConnection === conn.id
                    ? 'bg-emerald-900/30 border border-emerald-700'
                    : 'bg-slate-700/50 hover:bg-slate-700'
                }`}
                onClick={() => handleSelectConnection(conn.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm">{conn.name}</p>
                    <p className="text-slate-400 text-xs">{conn.db_type} • {conn.database}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(conn.id); }}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            {connections.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-4">No connections yet</p>
            )}
          </div>
        </div>

        {/* Tables List */}
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-slate-300">Tables</h4>
            {selectedConnection && (
              <button
                onClick={() => setShowQueryEditor(true)}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                SQL Query
              </button>
            )}
          </div>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {tables.map((table) => (
              <div
                key={table}
                className={`p-2 rounded cursor-pointer text-sm transition-colors ${
                  selectedTable === table
                    ? 'bg-emerald-900/30 text-emerald-300'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
                onClick={() => handleSelectTable(table)}
              >
                {table}
              </div>
            ))}
            {tables.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-4">
                {selectedConnection ? 'No tables found' : 'Select a connection'}
              </p>
            )}
          </div>
        </div>

        {/* Table Preview */}
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-slate-300">Preview</h4>
            {selectedTable && tableData && (
              <button
                onClick={handleLoadTableData}
                className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
              >
                Load for Analysis
              </button>
            )}
          </div>
          {tableData ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                {tableData.total_rows} total rows • Showing {tableData.sample_rows?.length || 0}
              </p>
              <div className="max-h-64 overflow-auto text-xs">
                {tableData.sample_rows?.slice(0, 5).map((row: any, i: number) => (
                  <div key={i} className="p-2 bg-slate-700/50 rounded mb-1">
                    {Object.entries(row).slice(0, 3).map(([key, val]) => (
                      <div key={key} className="text-slate-300">
                        <span className="text-slate-500">{key}:</span> {String(val)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-4">
              {selectedTable ? 'Loading...' : 'Select a table'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseManager;