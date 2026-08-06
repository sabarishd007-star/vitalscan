import { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import { supabase } from '../supabase';

const API_BASE_URL = import.meta.env.VITE_ML_BACKEND_URL || 'http://localhost:8001';

interface ScanHistoryItem {
  id: string | number;
  user_id: string;
  overall_score: number;
  metrics: AnalysisMetrics;
  created_at: string;
}

interface AnalysisMetrics {
  [key: string]: {
    score: number;
    status: string;
    description?: string;
  };
}

interface AnalysisResult {
  overall_score: number;
  metrics: AnalysisMetrics;
  disclaimer?: string;
}

export default function SkinAnalyzerWithHistory() {
  const webcamRef = useRef<Webcam>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch Past Scans from Supabase
  const fetchScanHistory = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('skin_analyses')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setHistory(data as ScanHistoryItem[]);
      }
    } catch (err) {
      console.error("Error fetching scan history:", err);
    }
  }, []);

  // Fetch Current User & Scan History on Mount
  useEffect(() => {
    async function loadUserData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          void fetchScanHistory(user.id);
        }
      } catch (err) {
        console.error("Error loading user data:", err);
      }
    }
    void loadUserData();
  }, [fetchScanHistory]);

  const handleCapture = () => {
    if (webcamRef.current) {
      const image = webcamRef.current.getScreenshot();
      if (image) setImageSrc(image);
    }
  };

  const base64ToBlob = (base64Data: string): Blob => {
    const byteString = atob(base64Data.split(',')[1]);
    const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new Blob([ab], { type: mimeString });
  };

  const handleAnalyze = async () => {
    if (!imageSrc) return;
    setLoading(true);
    setError(null);

    try {
      const imageBlob = base64ToBlob(imageSrc);
      const formData = new FormData();
      formData.append('file', imageBlob, 'facial_capture.jpg');

      // Send User ID in Headers so Backend saves it to DB
      const response = await axios.post(`${API_BASE_URL}/analyze-skin`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(userId && { 'X-User-Id': userId })
        },
      });

      setAnalysisResult(response.data);
      if (userId) fetchScanHistory(userId); // Refresh timeline history
    } catch (err: unknown) {
      const detail = axios.isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined;
      setError(detail || 'Error processing scan request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', padding: '20px' }}>
      {/* LEFT COLUMN: ACTIVE SCANNER */}
      <div>
        <h2>New Skin Analysis</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        
        {!imageSrc ? (
          <div>
            <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" width="100%" />
            <button onClick={handleCapture} style={{ padding: '10px 20px', marginTop: '10px' }}>
              📸 Capture Frame
            </button>
          </div>
        ) : (
          <div>
            <img src={imageSrc} alt="User Capture" style={{ width: '100%', borderRadius: '8px' }} />
            <button onClick={() => setImageSrc(null)}>Retake</button>
            <button onClick={handleAnalyze} disabled={loading}>
              {loading ? 'Analyzing...' : 'Run Analysis'}
            </button>
          </div>
        )}

        {analysisResult && (
          <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc' }}>
            <h3>Score: {analysisResult.overall_score}/100</h3>
            <pre>{JSON.stringify(analysisResult.metrics, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: SCAN HISTORY */}
      <div style={{ borderLeft: '1px solid #ddd', paddingLeft: '20px' }}>
        <h3>History Timeline</h3>
        {history.length === 0 ? (
          <p>No past scans found.</p>
        ) : (
          history.map((scan) => (
            <div key={scan.id} style={{ marginBottom: '15px', padding: '10px', background: '#f4f4f4', borderRadius: '6px' }}>
              <strong>Score: {scan.overall_score}/100</strong>
              <br />
              <small>{new Date(scan.created_at).toLocaleDateString()}</small>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
