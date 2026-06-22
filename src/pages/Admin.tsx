import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated, apiFetch, fetchUserInfo } from '@/lib/api';

interface AIModel {
  id: number;
  name: string;
  description: string | null;
  usecases: string | null;
  is_enabled: number;
  is_default: number;
  created_by: number | null;
  created_at: string;
}

interface User {
  id: number;
  username: string;
  role: string;
  web_search_enabled: number;
  created_at: string;
}

interface AdminStats {
  users: {
    total: number;
    admins: number;
    regular: number;
  };
  content: {
    chats: number;
    documents: number;
    csv_files: number;
  };
  models: {
    total: number;
    enabled: number;
  };
}

const Admin = () => {
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'models' | 'users' | 'stats'>('models');
  const [models, setModels] = useState<AIModel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullModelName, setPullModelName] = useState('');
  const [pullProgress, setPullProgress] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    usecases: '',
    is_enabled: 1,
    is_default: 0
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login', { replace: true });
      return;
    }
    // Fetch user info from /me endpoint
    fetchUserInfo()
      .then(info => {
        if (!info || info.role !== 'admin') {
          navigate('/', { replace: true });
          return;
        }
        setUser(info);
        loadData();
      })
      .catch(() => {
        navigate('/', { replace: true });
      });
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchModels(),
        fetchUsers(),
        fetchStats()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const data = await apiFetch<AIModel[]>('/admin/models');
      setModels(data || []);
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to load models' });
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiFetch<User[]>('/admin/users');
      setUsers(data || []);
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to load users' });
    }
  };

  const fetchStats = async () => {
    try {
      const data = await apiFetch<AdminStats>('/admin/stats');
      setStats(data);
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to load stats' });
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await apiFetch<{settings: {web_search_enabled: string}, success: boolean}>('/admin/settings');
      if (data && data.settings) {
        setWebSearchEnabled(data.settings.web_search_enabled === 'true');
      }
    } catch (error) {
      const err = error as Error;
      console.error('Failed to load settings:', err.message);
    }
  };

  const updateWebSearchSetting = async (enabled: boolean) => {
    setSettingsLoading(true);
    try {
      await apiFetch('/admin/settings/web_search_enabled', {
        method: 'POST',
        body: JSON.stringify({ value: enabled ? 'true' : 'false' })
      });
      setWebSearchEnabled(enabled);
      setMessage({ type: 'success', text: `Web search ${enabled ? 'enabled' : 'disabled'} successfully!` });
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to update setting' });
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchSettings();
    }
  }, [activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    try {
      if (editingModel) {
        await apiFetch(`/admin/models/${editingModel.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        setMessage({ type: 'success', text: 'Model updated successfully!' });
      } else {
        await apiFetch('/admin/models', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        setMessage({ type: 'success', text: 'Model created successfully!' });
      }
      setShowForm(false);
      setEditingModel(null);
      setFormData({ name: '', description: '', usecases: '', is_enabled: 1, is_default: 0 });
      fetchModels();
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Operation failed' });
    }
  };

  const handleEdit = (model: AIModel) => {
    setEditingModel(model);
    setFormData({
      name: model.name,
      description: model.description || '',
      usecases: model.usecases || '',
      is_enabled: model.is_enabled,
      is_default: model.is_default
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this model?')) return;
    
    try {
      await apiFetch(`/admin/models/${id}`, { method: 'DELETE' });
      setMessage({ type: 'success', text: 'Model deleted successfully!' });
      fetchModels();
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Delete failed' });
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const result = await apiFetch<{ msg: string; is_enabled: number }>(`/admin/models/${id}/toggle`, { method: 'POST' });
      setMessage({ type: 'success', text: result.msg });
      fetchModels();
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Toggle failed' });
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await apiFetch(`/admin/models/${id}/set-default`, { method: 'POST' });
      setMessage({ type: 'success', text: 'Default model set!' });
      fetchModels();
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to set default' });
    }
  };

  const handleSyncOllama = async () => {
    try {
      const result = await apiFetch<{ msg: string }>('/admin/models/sync-ollama', { method: 'POST' });
      setMessage({ type: 'success', text: result.msg });
      fetchModels();
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Sync failed' });
    }
  };

  const handlePullModel = async () => {
    if (!pullModelName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a model name' });
      return;
    }

    setIsPulling(true);
    setPullProgress('Initiating pull...');
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001'}/admin/models/pull-ollama`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ model_name: pullModelName.trim() })
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              
              if (data.error) {
                setMessage({ type: 'error', text: data.error });
                setIsPulling(false);
                return;
              }

              if (data.status) {
                setPullProgress(data.status);
                
                // Check if pull completed successfully
                if (data.status === 'success' || data.status.includes('successfully')) {
                  setMessage({ type: 'success', text: `Model '${pullModelName}' pulled successfully!` });
                  setShowPullModal(false);
                  setPullModelName('');
                  setPullProgress('');
                  setIsPulling(false);
                  fetchModels(); // Refresh the models list
                  return;
                }
              }

              // Handle progress updates
              if (data.completed && data.total) {
                const percent = ((data.completed / data.total) * 100).toFixed(1);
                setPullProgress(`Downloading: ${percent}% (${data.completed}/${data.total} bytes)`);
              }
            } catch (e) {
              console.error('Error parsing stream:', e);
            }
          }
        }
      }

      setIsPulling(false);
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to pull model' });
      setIsPulling(false);
      setPullProgress('');
    }
  };

  const handleChangeUserRole = async (userId: number, newRole: string) => {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
    
    try {
      await apiFetch(`/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
      });
      setMessage({ type: 'success', text: 'User role updated successfully!' });
      fetchUsers();
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to update role' });
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) return;
    
    try {
      await apiFetch(`/admin/users/${userId}`, { method: 'DELETE' });
      setMessage({ type: 'success', text: 'User deleted successfully!' });
      fetchUsers();
      fetchStats();
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to delete user' });
    }
  };

  const handleToggleUserWebSearch = async (userId: number, username: string, currentStatus: number) => {
    const action = currentStatus === 1 ? 'disable' : 'enable';
    if (!confirm(`Are you sure you want to ${action} web search for user "${username}"?`)) return;
    
    try {
      const result = await apiFetch<{ msg: string; web_search_enabled: number }>(
        `/admin/users/${userId}/toggle-web-search`,
        { method: 'POST' }
      );
      setMessage({ type: 'success', text: result.msg });
      fetchUsers();
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Failed to toggle web search' });
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingModel(null);
    setFormData({ name: '', description: '', usecases: '', is_enabled: 1, is_default: 0 });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
            <p className="text-slate-400 mt-1">
              Welcome, <span className="text-emerald-400">{user?.username}</span>
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            ← Back to App
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-2 mb-6 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('models')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'models'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            AI Models
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'users'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'stats'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Statistics
          </button>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">
                {editingModel ? 'Edit Model' : 'Add New Model'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Model Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    required
                    placeholder="e.g., llama3.1:latest"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    rows={3}
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Use Cases</label>
                  <textarea
                    value={formData.usecases}
                    onChange={(e) => setFormData({ ...formData, usecases: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                    rows={3}
                    placeholder="e.g., code generation, data analysis, chat, summarization"
                  />
                </div>
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.is_enabled === 1}
                      onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 text-emerald-500 rounded"
                    />
                    <span className="text-slate-300">Enabled</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.is_default === 1}
                      onChange={(e) => setFormData({ ...formData, is_default: e.target.checked ? 1 : 0 })}
                      className="w-4 h-4 text-emerald-500 rounded"
                    />
                    <span className="text-slate-300">Default</span>
                  </label>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                  >
                    {editingModel ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Pull Model Modal */}
        {showPullModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
              <h3 className="text-xl font-semibold text-white mb-4">
                Pull Model from Ollama
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Model Name</label>
                  <input
                    type="text"
                    value={pullModelName}
                    onChange={(e) => setPullModelName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    placeholder="e.g., llama3.1:latest, mistral:7b"
                    disabled={isPulling}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Enter the model name from Ollama library (e.g., llama3.1, mistral, codellama)
                  </p>
                </div>

                {pullProgress && (
                  <div className="p-3 bg-slate-700/50 rounded-lg">
                    <p className="text-sm text-slate-300">{pullProgress}</p>
                    {isPulling && (
                      <div className="mt-2 w-full bg-slate-600 rounded-full h-2">
                        <div className="bg-purple-500 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPulling) {
                        setShowPullModal(false);
                        setPullModelName('');
                        setPullProgress('');
                      }
                    }}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                    disabled={isPulling}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePullModel}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isPulling || !pullModelName.trim()}
                  >
                    {isPulling ? 'Pulling...' : 'Pull Model'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center text-slate-400 py-12">Loading...</div>
        ) : (
          <>
            {/* Models Tab */}
            {activeTab === 'models' && (
              <div>
                <div className="flex justify-end space-x-3 mb-4">
                  <button
                    onClick={() => setShowPullModal(true)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  >
                    📥 Pull Model
                  </button>
                  <button
                    onClick={handleSyncOllama}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                  >
                    Sync Ollama Models
                  </button>
                  <button
                    onClick={() => { setShowForm(true); setEditingModel(null); setFormData({ name: '', description: '', usecases: '', is_enabled: 1, is_default: 0 }); }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                  >
                    + Add Model
                  </button>
                </div>
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Default</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Description</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Use Cases</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {models.map((model) => (
                        <tr key={model.id} className="hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-white font-mono text-sm">{model.name}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${model.is_enabled ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
                              {model.is_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {model.is_default ? (
                              <span className="px-2 py-1 rounded-full text-xs bg-amber-900/50 text-amber-300">★ Default</span>
                            ) : (
                              <button
                                onClick={() => handleSetDefault(model.id)}
                                className="text-slate-500 hover:text-amber-400 transition-colors"
                              >
                                ☆
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-sm max-w-xs truncate">{model.description || '-'}</td>
                          <td className="px-4 py-3 text-slate-400 text-sm max-w-xs truncate">{model.usecases || '-'}</td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <button
                              onClick={() => handleToggle(model.id)}
                              className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                            >
                              {model.is_enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleEdit(model)}
                              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(model.id)}
                              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {models.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                            No models found. Click "Add Model" or "Sync Ollama Models" to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <>
                {/* Server Settings Section */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span>⚙️</span> Server Settings
                  </h3>
                  
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">🌐</span>
                          <h4 className="text-white font-medium">Web Search</h4>
                        </div>
                        <p className="text-slate-400 text-sm">
                          Enable or disable web search functionality for all users. When enabled, users can toggle web search on/off in their chats.
                        </p>
                      </div>
                      <div className="ml-6">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={webSearchEnabled}
                            onChange={(e) => updateWebSearchSetting(e.target.checked)}
                            disabled={settingsLoading}
                            className="sr-only peer"
                          />
                          <div className="w-14 h-7 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
                          <span className="ml-3 text-sm font-medium text-slate-300">
                            {webSearchEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </label>
                      </div>
                    </div>
                    
                    {settingsLoading && (
                      <div className="mt-3 flex items-center gap-2 text-slate-400 text-sm">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400"></div>
                        <span>Updating...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Users Table */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                  <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Username</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Web Search</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Created At</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-slate-400 text-sm">{u.id}</td>
                        <td className="px-4 py-3 text-white font-medium">{u.username}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            u.role === 'admin' 
                              ? 'bg-purple-900/50 text-purple-300' 
                              : 'bg-blue-900/50 text-blue-300'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleUserWebSearch(u.id, u.username, u.web_search_enabled)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              u.web_search_enabled === 1
                                ? 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/50'
                                : 'bg-red-900/50 text-red-300 hover:bg-red-800/50'
                            }`}
                            title={u.web_search_enabled === 1 ? 'Click to disable web search' : 'Click to enable web search'}
                          >
                            {u.web_search_enabled === 1 ? '🌐 Enabled' : '🚫 Disabled'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {u.role === 'user' ? (
                            <button
                              onClick={() => handleChangeUserRole(u.id, 'admin')}
                              className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                            >
                              Make Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => handleChangeUserRole(u.id, 'user')}
                              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                            >
                              Make User
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Users Stats */}
                <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/50 rounded-xl p-6 border border-purple-700">
                  <h3 className="text-lg font-semibold text-purple-300 mb-4">Users</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total:</span>
                      <span className="text-white font-bold">{stats.users.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Admins:</span>
                      <span className="text-purple-300 font-bold">{stats.users.admins}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Regular:</span>
                      <span className="text-blue-300 font-bold">{stats.users.regular}</span>
                    </div>
                  </div>
                </div>

                {/* Models Stats */}
                <div className="bg-gradient-to-br from-emerald-900/50 to-emerald-800/50 rounded-xl p-6 border border-emerald-700">
                  <h3 className="text-lg font-semibold text-emerald-300 mb-4">AI Models</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total:</span>
                      <span className="text-white font-bold">{stats.models.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Enabled:</span>
                      <span className="text-emerald-300 font-bold">{stats.models.enabled}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Disabled:</span>
                      <span className="text-red-300 font-bold">{stats.models.total - stats.models.enabled}</span>
                    </div>
                  </div>
                </div>

                {/* Content Stats */}
                <div className="bg-gradient-to-br from-cyan-900/50 to-cyan-800/50 rounded-xl p-6 border border-cyan-700">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-4">Content</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Chats:</span>
                      <span className="text-white font-bold">{stats.content.chats}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Documents:</span>
                      <span className="text-cyan-300 font-bold">{stats.content.documents}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">CSV Files:</span>
                      <span className="text-teal-300 font-bold">{stats.content.csv_files}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;