import React, { useState, useCallback, Fragment, useEffect, useRef } from 'react';

// --- Helper Components & Icons (as inline SVGs for single-file compilation) ---

const AlertTriangle = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const CheckCircle2 = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const Loader = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const VmIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
);


// --- Main Application Components ---

/**
 * Fetches VMs and VolumeSnapshots and correlates them via DataVolumes.
 */
const fetchClusterData = async (clusterName, namespace, apiEndpoint, token) => {
    console.log(`Fetching VM and Snapshot data for ${clusterName} from ${apiEndpoint}`);

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
    };

    const vmUrl = `${apiEndpoint}/apis/kubevirt.io/v1/namespaces/${namespace}/virtualmachines`;
    const snapshotUrl = `${apiEndpoint}/apis/snapshot.storage.k8s.io/v1/namespaces/${namespace}/volumesnapshots`;

    try {
        const [vmRes, snapshotRes] = await Promise.all([
            fetch(vmUrl, { headers }),
            fetch(snapshotUrl, { headers }),
        ]);

        if (!vmRes.ok) throw new Error(`Failed to fetch VMs: ${vmRes.statusText}`);
        if (!snapshotRes.ok) throw new Error(`Failed to fetch Snapshots: ${snapshotRes.statusText}`);

        const vms = (await vmRes.json()).items || [];
        const snapshots = (await snapshotRes.json()).items || [];
        
        const snapshotsByPvc = snapshots.reduce((acc, snap) => {
            const sourcePvc = snap.spec.source.persistentVolumeClaimName;
            if (!acc[sourcePvc]) {
                acc[sourcePvc] = [];
            }
            const status = snap.status || {};
            const isReady = status.readyToUse === true;
            acc[sourcePvc].push({
                name: snap.metadata.name,
                creationTimestamp: snap.metadata.creationTimestamp,
                isReady: isReady,
                statusMessage: isReady ? 'Ready to use' : (status.error?.message || 'Pending creation'),
            });
            return acc;
        }, {});

        const correlatedData = vms.map(vm => {
            const vmVolumes = vm.spec.template.spec.volumes || [];
            const vmDataVolumes = vmVolumes
                .filter(vol => vol.dataVolume)
                .map(vol => {
                    const dvName = vol.dataVolume.name;
                    return {
                        name: dvName,
                        snapshots: snapshotsByPvc[dvName] || [],
                    };
                });

            return {
                name: vm.metadata.name,
                dataVolumes: vmDataVolumes,
            };
        });

        return correlatedData;

    } catch (err) {
        console.error("Error fetching cluster data:", err);
        throw err;
    }
};


/**
 * Renders a card for a single Virtual Machine and its related resources.
 */
function VirtualMachineCard({ vm }) {
    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4">
                <VmIcon className="w-6 h-6 text-indigo-400" />
                <h3 className="text-lg font-bold text-white truncate">{vm.name}</h3>
            </div>
            {vm.dataVolumes.length > 0 ? (
                <div className="space-y-3 pl-9">
                    {vm.dataVolumes.map(dv => (
                        <div key={dv.name}>
                            <p className="text-sm font-semibold text-gray-300">DataVolume: <span className="font-mono text-gray-400">{dv.name}</span></p>
                            {dv.snapshots.length > 0 ? (
                                <ul className="mt-2 space-y-2 pl-4 border-l-2 border-gray-700">
                                    {dv.snapshots.sort((a, b) => new Date(b.creationTimestamp) - new Date(a.creationTimestamp)).map(snap => (
                                        <li key={snap.name} className="flex items-center gap-3 text-sm">
                                            {snap.isReady ?
                                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" /> :
                                                <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                                            }
                                            <span className="font-mono text-gray-400 truncate" title={snap.name}>{snap.name}</span>
                                            <span className="text-xs text-gray-500 ml-auto whitespace-nowrap">{new Date(snap.creationTimestamp).toLocaleDateString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-500 pl-4 mt-1">No snapshots found for this DataVolume.</p>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-gray-500 pl-9">No DataVolumes found for this VM.</p>
            )}
        </div>
    );
}

/**
 * Displays the UI and handles logic for a single OpenShift cluster connection.
 */
function ClusterView({ clusterName }) {
  const [namespace, setNamespace] = useState('default');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [vmData, setVmData] = useState([]);
  const [status, setStatus] = useState('idle'); // idle, connecting, success, error
  const [error, setError] = useState(null);

  // State for Auto-Refresh
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(1000); // 1 seconds
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef(null);

  const handleFetchData = useCallback(async (isSilent = false) => {
    if (!apiEndpoint || !namespace) {
      setError('API Endpoint and Namespace are required.');
      setStatus('error');
      return;
    }
    
    if (isSilent) {
        setIsRefreshing(true);
    } else {
        setStatus('connecting');
    }

    setError(null);
    if (!isSilent) setVmData([]);

    try {
        const data = await fetchClusterData(clusterName, namespace, apiEndpoint, authToken);
        setVmData(data);
        setStatus('success');
    } catch (err) {
        setError(err.message);
        setStatus('error');
        setIsAutoRefreshEnabled(false); // Disable auto-refresh on error
    } finally {
        if (isSilent) {
            setIsRefreshing(false);
        }
    }
  }, [namespace, clusterName, apiEndpoint, authToken]);

  // Effect to manage the auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isAutoRefreshEnabled && apiEndpoint && authToken && namespace) {
      if (intervalRef.current) return;
      
      intervalRef.current = setInterval(() => {
        handleFetchData(true); // Perform a silent refresh
      }, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAutoRefreshEnabled, refreshInterval, apiEndpoint, authToken, namespace, handleFetchData]);


  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 shadow-lg space-y-4">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        {clusterName}
      </h2>
      
      {/* Input and Control Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
            <label htmlFor={`api-endpoint-${clusterName}`} className="block text-sm font-medium text-gray-400 mb-1">API Endpoint</label>
            <input type="text" id={`api-endpoint-${clusterName}`} value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} className="w-full bg-gray-800 border border-gray-600 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 transition" placeholder="https://api.my-cluster.com:6443" />
        </div>
        <div>
            <label htmlFor={`auth-token-${clusterName}`} className="block text-sm font-medium text-gray-400 mb-1">Auth Token</label>
            <input type="password" id={`auth-token-${clusterName}`} value={authToken} onChange={(e) => setAuthToken(e.target.value)} className="w-full bg-gray-800 border border-gray-600 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 transition" placeholder="sha256~..." />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={`namespace-${clusterName}`} className="block text-sm font-medium text-gray-400 mb-1">Namespace</label>
          <input type="text" id={`namespace-${clusterName}`} value={namespace} onChange={(e) => setNamespace(e.target.value)} className="w-full bg-gray-800 border border-gray-600 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 transition" placeholder="e.g., my-virtual-machines" />
        </div>
      </div>
      <div className="pt-2">
        <button onClick={() => handleFetchData(false)} disabled={status === 'connecting'} className="w-full h-10 px-6 font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition">
          {status === 'connecting' ? 'Discovering VMs...' : 'Watch Virtual Machines'}
        </button>
      </div>

      <div className="pt-2 border-t border-gray-800">
          <div className="flex items-center justify-between gap-4">
               <div className="flex items-center gap-2">
                   <input
                       type="checkbox"
                       id={`auto-refresh-${clusterName}`}
                       checked={isAutoRefreshEnabled}
                       onChange={(e) => setIsAutoRefreshEnabled(e.target.checked)}
                       className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                   />
                   <label htmlFor={`auto-refresh-${clusterName}`} className="text-sm text-gray-400">
                       Auto-refresh
                   </label>
               </div>
               <select
                   value={refreshInterval}
                   onChange={(e) => setRefreshInterval(Number(e.target.value))}
                   disabled={!isAutoRefreshEnabled}
                   className="bg-gray-800 border-gray-600 text-gray-300 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
               >
                   <option value={1000}>every 1s</option>
                   <option value={3000}>every 3s</option>
                   <option value={5000}>every 5s</option>
               </select>
          </div>
      </div>

      {/* Status and Results Section */}
      <div className="pt-2">
        {status === 'connecting' && (
          <div className="flex items-center justify-center text-gray-400"><Loader className="animate-spin mr-2" /><span>Connecting and fetching data...</span></div>
        )}
        {status === 'error' && (
          <div className="flex items-center text-red-400 bg-red-900/20 border border-red-700 rounded-md p-4">
            <AlertTriangle className="w-6 h-6 mr-3 flex-shrink-0"/>
            <div><h3 className="font-bold">Connection Error</h3><p className="text-sm">{error}</p></div>
          </div>
        )}
        {status === 'success' && (
          <div className="space-y-4">
            {vmData.length > 0 ? (
              vmData.map(vm => <VirtualMachineCard key={vm.name} vm={vm} />)
            ) : (
              <div className="flex items-center justify-center text-gray-500 bg-gray-800/50 border-2 border-dashed border-gray-700 rounded-lg p-10">
                <CheckCircle2 className="w-8 h-8 mr-3 text-gray-600"/>
                <span>No virtual machines found in namespace '{namespace}'.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The main application component.
 */
export default function App() {
  return (
    <div className="bg-gray-950 text-gray-200 min-h-screen font-sans">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <header className="mb-8">
          <h1 className="text-4xl font-extrabold text-white tracking-tight">OpenShift VM Snapshot Monitor</h1>
          <p className="text-gray-400 mt-2">
            A centralized dashboard to watch Virtual Machines and their VolumeSnapshots.
          </p>
        </header>
        
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ClusterView clusterName="Cluster A (Source)" />
          <ClusterView clusterName="Cluster B (Destination)" />
        </main>
        
        <footer className="text-center text-gray-600 mt-12 text-sm">
            <p>OpenShift Virtualization</p>
        </footer>
      </div>
    </div>
  );
}

