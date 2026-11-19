import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  ShieldCheck,
  Image,
  Video,
  Mic,
  MessageSquare,
  FileText,
  Info,
  Radio,
  StopCircle,
  Play,
  AlertOctagon,
  Cpu,
  Database,
  History,
  Volume2,
  CheckCircle2,
  Upload
} from 'lucide-react';
import toast from 'react-hot-toast';
import { recognizeVoice, getVoiceHistory } from '../../services/voice.service';

export default function SecurityCheckCenter() {
  const [activeTab, setActiveTab] = useState('text'); // 'text', 'audio', 'document', 'image', 'video'
  const [textContent, setTextContent] = useState('');
  const [fileInput, setFileInput] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [voiceRecord, setVoiceRecord] = useState(null);
  const [voiceHistory, setVoiceHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Document Screening Form
  const [docForm, setDocForm] = useState({
    docType: 'aadhaar',
    docNum: '234567891234',
    extractedName: 'Elon Musk'
  });

  // Live Microphone Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Fetch Voice History when opening Audio Tab
  useEffect(() => {
    if (activeTab === 'audio') {
      fetchVoiceHistory();
    }
  }, [activeTab]);

  const fetchVoiceHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await getVoiceHistory();
      if (res && res.data) {
        setVoiceHistory(res.data);
      }
    } catch (err) {
      console.warn('Could not load voice history:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 1. Text Phishing Screening
  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (!textContent.trim()) {
      toast.error('Please enter message, email, or URL text to analyze.');
      return;
    }
    setLoading(true);
    setResult(null);
    setVoiceRecord(null);
    try {
      const res = await axios.post('/api/v1/detect/text', { textContent, purpose: 'phishing' });
      if (res.data.success) {
        setResult(res.data.data.detection);
        toast.success('Text phishing analysis complete!');
      }
    } catch (err) {
      toast.error('Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Document Authenticity & Impersonation Screening
  const handleDocSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setVoiceRecord(null);
    try {
      let res;
      if (fileInput) {
        const formData = new FormData();
        formData.append('file', fileInput);
        formData.append('docType', docForm.docType || 'aadhaar');
        if (docForm.docNum) formData.append('docNum', docForm.docNum);
        if (docForm.extractedName) formData.append('extractedName', docForm.extractedName);
        res = await axios.post('/api/v1/detect/document', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        res = await axios.post('/api/v1/detect/document', docForm);
      }

      if (res.data.success) {
        setResult(res.data.data.detection);
        if (res.data.data.detection.verdict === 'malicious') {
          toast.error('Document Flagged: High-Risk Impersonation / Forgery Detected!');
        } else {
          toast.success('Document screening complete.');
        }
      }
    } catch (err) {
      toast.error('Document screening failed.');
    } finally {
      setLoading(false);
    }
  };

  // File Input Change Helper with Preview
  const handleFileChange = (file) => {
    setFileInput(file || null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  // 3. File Upload Media Screening (Image / Video)
  const handleFileUpload = async (endpoint, purpose) => {
    if (!fileInput) {
      toast.error('Please select a file first.');
      return;
    }
    setLoading(true);
    setResult(null);
    setVoiceRecord(null);
    try {
      const formData = new FormData();
      formData.append('file', fileInput);
      formData.append('purpose', purpose);

      const res = await axios.post(`/api/v1/detect/${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setResult(res.data.data.detection);
        toast.success(`Forensic ${endpoint === 'video' ? 'video temporal deepfake' : 'media'} analysis complete!`);
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Media upload analysis failed.';
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Synthetic Test Video Generator for One-Click Video Deepfake Verification
  const handleGenerateTestVideo = async (isManipulated = false) => {
    setLoading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(20);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File(
          [blob],
          isManipulated ? `manipulated_deepfake_test.${ext}` : `authentic_webcam_test.${ext}`,
          { type: mimeType }
        );
        handleFileChange(file);
        setLoading(false);
        toast.success(`Synthesized ${isManipulated ? 'Manipulated Deepfake' : 'Authentic'} video test sample!`);
      };

      recorder.start();

      let frame = 0;
      const totalFrames = 25;
      const interval = setInterval(() => {
        // Draw frame background
        ctx.fillStyle = isManipulated && frame % 4 === 0 ? '#450a0a' : '#0f172a';
        ctx.fillRect(0, 0, 320, 240);

        // Simulated facial contour
        ctx.beginPath();
        const faceX = isManipulated ? 160 + (frame % 3) * 18 : 160;
        const faceY = isManipulated ? 110 + (frame % 2) * 12 : 110;
        ctx.arc(faceX, faceY, 52, 0, Math.PI * 2);
        ctx.fillStyle = isManipulated ? '#fca5a5' : '#fed7aa';
        ctx.fill();

        // Eye landmarks
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(faceX - 22, faceY - 14, 10, 10);
        ctx.fillRect(faceX + 12, faceY - 14, 10, 10);

        // Smile / mouth
        ctx.beginPath();
        ctx.arc(faceX, faceY + 18, 18, 0, Math.PI, false);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#991b1b';
        ctx.stroke();

        // Technical overlay
        ctx.fillStyle = '#38bdf8';
        ctx.font = '11px monospace';
        ctx.fillText(
          `Frame ${frame}/${totalFrames} | ${isManipulated ? 'HIGH JITTER ARTIFACT' : 'STABLE TEMPORAL DESCRIPTOR'}`,
          12,
          220
        );

        frame++;
        if (frame >= totalFrames) {
          clearInterval(interval);
          recorder.stop();
        }
      }, 60);
    } catch (err) {
      setLoading(false);
      console.error('Failed to generate test video:', err);
      toast.error('Browser does not support canvas video capture. Please upload an MP4/WebM video file.');
    }
  };

  // 4. Live Microphone Voice Stream Recording & Visualizer
  const startLiveRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Audio Context for Live Waveform Visualizer
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        if (audioCtx.state !== 'closed') audioCtx.close();
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start Timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Draw Waveform Canvas
      drawVisualizer();
      toast.success('Microphone active. Speak now into your microphone.');
    } catch (err) {
      toast.error('Microphone access denied or not available. You can also upload an audio file.');
    }
  };

  const stopLiveRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      animationFrameRef.current = requestAnimationFrame(renderFrame);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgb(15, 7, 27)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;
        const r = 168 + i * 2;
        const g = 85 + i * 1;
        const b = 247;

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    renderFrame();
  };

  // Dispatch Recorded or Uploaded Audio to Local Whisper Model
  const handleAnalyzeLiveVoice = async () => {
    const audioPayload = audioBlob || fileInput;
    if (!audioPayload) {
      toast.error('Please record a voice clip or select an audio file first.');
      return;
    }

    setLoading(true);
    setResult(null);
    setVoiceRecord(null);

    try {
      const response = await recognizeVoice(audioPayload, Math.max(3, recordingTime || 5));
      if (response.success && response.data) {
        setVoiceRecord(response.data.voiceRecord);
        setResult(response.data.detection);
        toast.success('Local AI speech recognition & forensic screening complete!');
        fetchVoiceHistory();
      } else {
        toast.error(response.message || 'Speech recognition failed.');
      }
    } catch (err) {
      console.error('Voice analysis request failed:', err);
      toast.error(err.response?.data?.message || 'Voice screening failed.');
    } finally {
      setLoading(false);
    }
  };

  // Quick Synthetic Speech Generator for Microphone-less Testing
  const handleGenerateTestTone = (type = 'urgent') => {
    const sampleRate = 16000;
    const duration = 3.5;
    const numSamples = Math.floor(sampleRate * duration);
    const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(wavBuffer);

    // Write WAV Header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    // Synthesize vocal formant frequencies
    const f0 = type === 'urgent' ? 220 : 160;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample =
        (Math.sin(2 * Math.PI * f0 * t) * 0.5 +
          Math.sin(2 * Math.PI * (f0 * 2) * t) * 0.3 +
          Math.sin(2 * Math.PI * (f0 * 3) * t) * 0.2) *
        16000;
      view.setInt16(44 + i * 2, Math.round(sample), true);
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    setAudioBlob(blob);
    setRecordingTime(Math.round(duration));
    toast.success(`Generated ${type === 'urgent' ? 'High-Pitch Urgent Alert' : 'Standard Vocal'} audio test sample.`);
  };

  const reportAsFraud = async () => {
    try {
      const res = await axios.post('/api/v1/alerts/report', {
        summary: `Customer reported suspicious screening result (${result?.module || 'voiceFraud'} - Score ${result?.score || 0})`
      });
      if (res.data.success) {
        toast.success('Fraud report submitted to analyst team!');
      }
    } catch (err) {
      toast.error('Failed to report fraud.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md flex justify-between items-center">
        <div>
          <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold uppercase tracking-wider border border-white/20">
            Multi-Modal AI Forensic Scanner • Local Model Verified
          </span>
          <h2 className="text-xl font-bold mt-2">Security Check Center</h2>
          <p className="text-xs text-blue-100 mt-1">
            Local Whisper speech-to-text recognition, acoustic deepfake forensics, phishing detection &amp; document authenticity
          </p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-white border border-slate-200 shadow-sm">
        {[
          { id: 'text', label: 'Message / Phishing / URL', icon: MessageSquare },
          { id: 'audio', label: '🎙️ Live Speech AI & Voice Forensics', icon: Mic },
          { id: 'document', label: '🪪 Document & Impersonation', icon: FileText },
          { id: 'image', label: 'Image Deepfake', icon: Image },
          { id: 'video', label: 'Video Deepfake', icon: Video }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setResult(null);
                setVoiceRecord(null);
                setFileInput(null);
                setAudioBlob(null);
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Screening Input & Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base capitalize">
              {activeTab === 'audio'
                ? '🎙️ Local AI Voice Recognition & Screening'
                : activeTab === 'document'
                ? '🪪 Identity Document Sanity Scanner'
                : `${activeTab} Screening Input`}
            </h3>
            {activeTab === 'audio' && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                <Cpu className="w-3 h-3" />
                <span>Local Whisper Tiny ONNX</span>
              </span>
            )}
          </div>

          {/* 1. Text Tab */}
          {activeTab === 'text' && (
            <form onSubmit={handleTextSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                  Paste Message, Email, SMS, or Link
                </label>
                <textarea
                  rows={6}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste suspicious text message or URL link here (e.g., Dear customer your account is blocked. Update KYC at http://verify-sbi-bank-login.com)..."
                  className="w-full p-4 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs leading-relaxed focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                ></textarea>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold text-sm shadow-md"
              >
                {loading ? 'Analyzing NLP & Blacklists...' : 'Analyze Message for Phishing'}
              </button>
            </form>
          )}

          {/* 2. Live Audio / Voice Tab */}
          {activeTab === 'audio' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Capture live speech directly via microphone or upload an audio clip. The backend transcribes English speech with a <strong>locally running Whisper AI model (zero cloud APIs)</strong> and checks both acoustic deepfake markers and social engineering threats.
              </p>

              {/* Canvas Waveform Visualizer */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-950 p-2 text-center">
                <canvas ref={canvasRef} width={360} height={90} className="w-full h-20 rounded-xl" />
                {isRecording && (
                  <div className="text-xs font-bold text-red-600 animate-pulse flex items-center justify-center gap-2 mt-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    <span>Recording Live Audio ({recordingTime}s)</span>
                  </div>
                )}
                {!isRecording && audioBlob && (
                  <div className="text-[11px] font-semibold text-teal-600 flex items-center justify-center gap-1.5 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Voice Sample Captured ({recordingTime || '3'}s WAV)</span>
                  </div>
                )}
              </div>

              {/* Recording Controls */}
              <div className="flex gap-2">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startLiveRecording}
                    className="flex-1 py-3 rounded-lg bg-blue-900 hover:bg-blue-800 font-bold text-xs flex items-center justify-center gap-2 text-white shadow-md"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Start Microphone Recording</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLiveRecording}
                    className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-xs flex items-center justify-center gap-2 text-white shadow-md animate-pulse"
                  >
                    <StopCircle className="w-4 h-4" />
                    <span>Stop Recording</span>
                  </button>
                )}
              </div>

              {/* Or Select Audio File */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-600">Or Upload Audio File:</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleGenerateTestTone('urgent')}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                      title="Synthesize vocal test sample"
                    >
                      🧪 Test Clip (Alert)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerateTestTone('standard')}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                      title="Synthesize standard vocal sample"
                    >
                      🧪 Test Clip (Voice)
                    </button>
                  </div>
                </div>
                <input
                  type="file"
                  accept="audio/*,.wav,.mp3,.ogg,.webm,.m4a"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setFileInput(file);
                      setAudioBlob(file);
                      toast.success(`Selected audio: ${file.name}`);
                    }
                  }}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-900 file:text-white hover:file:bg-blue-800 cursor-pointer"
                />
              </div>

              {/* Action Button */}
              {(audioBlob || fileInput) && !isRecording && (
                <button
                  type="button"
                  onClick={handleAnalyzeLiveVoice}
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
                >
                  <Cpu className="w-4 h-4" />
                  <span>
                    {loading ? 'Transcribing & Evaluating via Local AI Model...' : '⚡ Recognize Speech & Screen Voice with Local AI'}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* 3. Document Tab */}
          {activeTab === 'document' && (
            <form onSubmit={handleDocSubmit} className="space-y-4">
              {/* Upload Document File (PDF / Scanned ID) */}
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center bg-slate-50 hover:bg-slate-100/60 transition-colors">
                <input
                  key="input-document-file"
                  id="doc-file-upload"
                  type="file"
                  accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    setFileInput(file || null);
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="doc-file-upload"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Document (PDF, Scanned ID, Image)</span>
                </label>
                {fileInput ? (
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-blue-900 bg-blue-50 py-2 px-3 rounded-lg border border-blue-200 max-w-md mx-auto">
                    <FileText className="w-4 h-4 text-blue-700 shrink-0" />
                    <span className="font-mono truncate">{fileInput.name}</span>
                    <span className="text-slate-500 text-[11px]">({(fileInput.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      onClick={() => setFileInput(null)}
                      className="ml-2 text-red-500 hover:text-red-700 font-black text-sm"
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-2">
                    Accepted: Official Aadhaar / PAN / Passport PDF or scanned image up to 25MB
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Document Type</label>
                <select
                  value={docForm.docType}
                  onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                >
                  <option value="aadhaar">Aadhaar Card (12 Digits)</option>
                  <option value="pan">PAN Card (10 Chars)</option>
                  <option value="passport">Passport</option>
                  <option value="drivingLicense">Driving License</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Document Extracted Number</label>
                <input
                  type="text"
                  value={docForm.docNum}
                  onChange={(e) => setDocForm({ ...docForm, docNum: e.target.value })}
                  required={!fileInput}
                  placeholder={fileInput ? 'Auto-extracted from uploaded file (or enter manually)' : 'Enter document number'}
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Extracted Holder Full Name</label>
                <input
                  type="text"
                  value={docForm.extractedName}
                  onChange={(e) => setDocForm({ ...docForm, extractedName: e.target.value })}
                  required={!fileInput}
                  placeholder={fileInput ? 'Auto-extracted from uploaded file (or enter manually)' : 'e.g. Elon Musk or Rajesh Kumar'}
                  className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold text-sm shadow-md"
              >
                {loading ? 'Screening Document Integrity...' : 'Screen Document Authenticity'}
              </button>
            </form>
          )}

          {/* 4. Image Deepfake Tab */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50">
                <input
                  key="input-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => handleFileChange(e.target.files[0])}
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-900 file:text-white hover:file:bg-blue-800 cursor-pointer"
                />
                <p className="text-[11px] text-slate-400 mt-2">Accepted: JPG, PNG, WebP up to 10MB</p>
              </div>

              {previewUrl && (
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-center">
                  <p className="text-[11px] font-semibold text-slate-500 mb-2">Image Preview:</p>
                  <img src={previewUrl} alt="Preview" className="max-h-48 mx-auto rounded-lg shadow-sm border border-slate-200" />
                </div>
              )}

              <button
                onClick={() => handleFileUpload('image', 'selfie')}
                disabled={loading || !fileInput}
                className="w-full py-3 rounded-lg bg-blue-900 text-white font-bold text-sm shadow-md disabled:opacity-50"
              >
                {loading ? 'Running ELA & MLP Forensic Engine...' : 'Analyze IMAGE File'}
              </button>
            </div>
          )}

          {/* 5. Video Deepfake Tab */}
          {activeTab === 'video' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50 space-y-3">
                <input
                  key="input-video"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,.mp4,.webm,.mov,.avi,.mkv"
                  onChange={(e) => handleFileChange(e.target.files[0])}
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-900 file:text-white hover:file:bg-blue-800 cursor-pointer"
                />
                <p className="text-[11px] text-slate-400">
                  Accepted: MP4, WebM, MOV, MKV up to <strong>100MB</strong> (Supports 1-minute video clips)
                </p>

                {/* Quick Synthetic Video Test Generators */}
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500 block mb-2">
                    Or Test With 1-Click Synthesized Video:
                  </span>
                  <div className="flex gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() => handleGenerateTestVideo(false)}
                      disabled={loading}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Authentic Sample</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerateTestVideo(true)}
                      disabled={loading}
                      className="text-[11px] px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <AlertOctagon className="w-3.5 h-3.5 text-red-600" />
                      <span>Deepfake Sample</span>
                    </button>
                  </div>
                </div>
              </div>

              {previewUrl && (
                <div className="p-3 rounded-xl bg-slate-900 text-white border border-slate-700 text-center space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300 px-1">
                    <span className="truncate max-w-[200px] font-mono text-[11px]">{fileInput?.name || 'Selected Video'}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {fileInput?.size ? (fileInput.size / (1024 * 1024)).toFixed(2) + ' MB' : ''}
                    </span>
                  </div>
                  <video src={previewUrl} controls className="max-h-48 mx-auto rounded-lg shadow-sm border border-slate-800" />
                </div>
              )}

              <button
                onClick={() => handleFileUpload('video', 'video')}
                disabled={loading || !fileInput}
                className="w-full py-3 rounded-lg bg-blue-900 text-white font-bold text-sm shadow-md disabled:opacity-50"
              >
                {loading ? 'Extracting Frames & Analyzing Temporal Jitter...' : 'Analyze VIDEO File'}
              </button>
            </div>
          )}
        </div>

        {/* Forensic Result Card */}
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-700">Forensic Analysis Result</h3>
              {result && (
                <button
                  onClick={reportAsFraud}
                  className="px-3 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-bold transition-all"
                >
                  Report as Fraud
                </button>
              )}
            </div>

            {result ? (
              <div className="mt-4 space-y-4">
                {/* Recognized Speech Transcript Card (When in Voice Mode) */}
                {voiceRecord && (
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-blue-700" />
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                          Recognized English Transcript
                        </span>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                        {voiceRecord.wordCount} words
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-blue-100">
                      <p className="text-sm font-medium text-slate-900 italic leading-relaxed">
                        "{voiceRecord.transcript}"
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>
                        Engine: <strong className="text-slate-700">{voiceRecord.speechModel}</strong>
                      </span>
                      <span>
                        STT Confidence: <strong>{(voiceRecord.speechConfidence * 100).toFixed(0)}%</strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Verdict & Score */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Manipulation / Fraud Likelihood</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">
                      {result.score} <span className="text-sm font-normal text-slate-500">/ 100</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      Confidence Ceiling: {(result.confidence * 100).toFixed(0)}% (Section 9.1 Mandate)
                    </p>
                  </div>
                  <div>
                    <span
                      className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                        result.verdict === 'authentic' || result.verdict === 'safe'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : result.verdict === 'inconclusive' || result.verdict === 'suspicious'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}
                    >
                      {result.verdict}
                    </span>
                  </div>
                </div>

                {/* Video Temporal Per-Frame Breakdown */}
                {result.perFrame && result.perFrame.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-blue-700" />
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                          Temporal Frame-by-Frame Timeline
                        </span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono">
                        {result.perFrame.length} Sampled Frames
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
                      {result.perFrame.map((f, i) => (
                        <div key={i} className="p-2 rounded-lg bg-white border border-slate-200 text-center shadow-2xs">
                          <p className="text-[10px] text-slate-400 font-mono">{f.timeSec}s</p>
                          <p
                            className={`text-xs font-black ${
                              f.score >= 60 ? 'text-red-600' : f.score >= 35 ? 'text-amber-600' : 'text-emerald-600'
                            }`}
                          >
                            {f.score}
                          </p>
                          <div className="w-full bg-slate-100 rounded-full h-1 mt-1 overflow-hidden">
                            <div
                              className={`h-full ${
                                f.score >= 60 ? 'bg-red-500' : f.score >= 35 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, f.score)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Plain Language Indicators */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  <p className="text-xs font-bold text-slate-500 uppercase">Forensic Indicators &amp; Findings</p>
                  {result.indicators && result.indicators.length > 0 ? (
                    result.indicators.map((ind, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                        <div className="flex justify-between font-bold text-slate-700">
                          <span>{ind.name}</span>
                          <span className="text-slate-500">{ind.value}</span>
                        </div>
                        <p className="text-slate-500 text-[11px] leading-relaxed">{ind.explanation}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No forensic anomalies detected.</p>
                  )}
                </div>

                {/* MongoDB Persistence Badge */}
                {voiceRecord && (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-slate-400" />
                      <span>Saved in MongoDB (VoiceRecord)</span>
                    </span>
                    <span className="text-slate-400 truncate max-w-[160px]">{voiceRecord._id}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-200 space-y-2">
                <ShieldCheck className="w-12 h-12 text-slate-200" />
                <p className="text-xs text-slate-400 font-medium">
                  Select a tab to record live voice, test fake identity names, or analyze media for deepfakes.
                </p>
              </div>
            )}
          </div>

          {/* Section 9.1 Mandated Disclaimer Note */}
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>
              <strong>Disclaimer Note</strong>: Automated AI screening assists human investigators and does not constitute a legal verdict.
            </span>
          </div>
        </div>
      </div>

      {/* Voice Recognition MongoDB History Table (Rendered in Audio Tab) */}
      {activeTab === 'audio' && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-slate-500" />
              <h3 className="font-bold text-base text-slate-900">
                Recent Voice Recognition Sessions (MongoDB Records)
              </h3>
            </div>
            <button
              onClick={fetchVoiceHistory}
              disabled={loadingHistory}
              className="text-xs px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
            >
              {loadingHistory ? 'Refreshing...' : 'Refresh Records'}
            </button>
          </div>

          {voiceHistory.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center italic">
              No saved voice recognition sessions found. Record or upload an audio sample above to test.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                    <th className="py-2.5 px-3">Date / Time</th>
                    <th className="py-2.5 px-3">Recognized Transcript</th>
                    <th className="py-2.5 px-3">Words</th>
                    <th className="py-2.5 px-3">Risk Score</th>
                    <th className="py-2.5 px-3">Verdict</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {voiceHistory.slice(0, 10).map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 max-w-xs truncate text-slate-700 font-mono text-[11px]">
                        "{item.transcript}"
                      </td>
                      <td className="py-3 px-3 text-slate-600">{item.wordCount}</td>
                      <td className="py-3 px-3 font-bold text-slate-700">{item.combinedRiskScore || item.transcriptRisk?.score || 0}/100</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.combinedVerdict === 'authentic' || item.combinedVerdict === 'safe'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : item.combinedVerdict === 'suspicious'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-red-100 text-red-700 border border-red-200'
                          }`}
                        >
                          {item.combinedVerdict}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => {
                            setVoiceRecord(item);
                            setResult({
                              score: item.combinedRiskScore || 0,
                              verdict: item.combinedVerdict,
                              confidence: item.speechConfidence || 0.85,
                              indicators: [
                                ...(item.transcriptRisk?.indicators || []),
                                ...(item.acousticAnalysis?.isSyntheticVoice
                                  ? [{ name: 'Acoustic Synthetic Uniformity', value: 'Detected', explanation: 'Flat spectral profile.' }]
                                  : [])
                              ]
                            });
                            toast.success('Loaded saved voice record details.');
                          }}
                          className="text-[11px] text-blue-700 hover:text-blue-900 underline font-semibold"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
