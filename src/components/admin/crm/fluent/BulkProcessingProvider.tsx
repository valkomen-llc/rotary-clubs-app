import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

import { useAuth } from '../../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

interface BulkJob {
  id: string;
  actionType: string;
  status: string;
  totalItems: number;
  processedItems: number;
}

interface BulkProcessingContextProps {
  activeJobs: BulkJob[];
  addJob: (job: BulkJob) => void;
}

const BulkProcessingContext = createContext<BulkProcessingContextProps>({
  activeJobs: [],
  addJob: () => {},
});

export const useBulkProcessing = () => useContext(BulkProcessingContext);

export const BulkProcessingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [activeJobs, setActiveJobs] = useState<BulkJob[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    // Cargar jobs activos al montar la app
    const loadActiveJobs = async () => {
      try {
        if (!token) return;
        const response = await axios.get(`${API}/crm/contacts/bulk-action/active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data && response.data.length > 0) {
          setActiveJobs(response.data);
        }
      } catch (error) {
        console.error("Error loading active bulk jobs:", error);
      }
    };
    loadActiveJobs();
  }, [token]);

  useEffect(() => {
    // Polling loop
    if (activeJobs.length === 0 || isProcessingRef.current) return;

    let mounted = true;

    const processNextChunk = async () => {
      if (!mounted) return;
      isProcessingRef.current = true;
      
      const jobToProcess = activeJobs[0];

      try {
        if (!token) {
           isProcessingRef.current = false;
           return;
        }
        const response = await axios.post(`${API}/crm/contacts/bulk-action/process-chunk`, 
          { jobId: jobToProcess.id },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const updatedJob = response.data.job;
        
        if (response.data.completed) {
           toast.success(`Acción masiva completada: ${updatedJob.totalItems} contactos procesados.`, { duration: 5000 });
           setActiveJobs(prev => prev.filter(j => j.id !== updatedJob.id));
        } else {
           // Update progress
           setActiveJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
           // Schedule next chunk slightly delayed to not block UI thread
           setTimeout(() => {
              isProcessingRef.current = false;
              if (mounted) processNextChunk();
           }, 500);
           return; // wait for next loop
        }
      } catch (error) {
        console.error("Error processing chunk:", error);
        toast.error("Error al procesar lote. Se reintentará.");
        // Remueve el job de la cola activa temporalmente si hay error persistente, 
        // pero por ahora solo lo sacamos para no trabar la cola
        setActiveJobs(prev => prev.filter(j => j.id !== jobToProcess.id));
      }
      
      isProcessingRef.current = false;
    };

    processNextChunk();

    return () => {
      mounted = false;
    };
  }, [activeJobs]);

  const addJob = (job: BulkJob) => {
    setActiveJobs(prev => [...prev, job]);
    toast.success(`Iniciando procesamiento de ${job.totalItems} contactos en segundo plano...`);
  };

  return (
    <BulkProcessingContext.Provider value={{ activeJobs, addJob }}>
      {children}
      
      {/* Floating UI for Background Process */}
      {activeJobs.length > 0 && (
        <div className="fixed bottom-6 right-6 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-[9999] animate-in slide-in-from-bottom-5">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
              Procesamiento Masivo
            </h4>
            <span className="text-xs text-gray-500 font-medium">{activeJobs.length} en cola</span>
          </div>
          
          {activeJobs.map((job) => {
             const percent = job.totalItems > 0 ? Math.round((job.processedItems / job.totalItems) * 100) : 0;
             return (
               <div key={job.id} className="mt-3">
                 <div className="flex justify-between text-xs text-gray-600 mb-1">
                   <span>{job.actionType.replace('_', ' ').toUpperCase()}</span>
                   <span>{job.processedItems} / {job.totalItems} ({percent}%)</span>
                 </div>
                 <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                   <div 
                     className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-in-out" 
                     style={{ width: `${percent}%` }}
                   ></div>
                 </div>
               </div>
             );
          })}
        </div>
      )}
    </BulkProcessingContext.Provider>
  );
};
