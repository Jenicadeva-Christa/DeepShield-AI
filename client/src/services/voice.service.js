import axios from 'axios';

/**
 * Voice Recognition & Forensic Service (Local AI Engine)
 * Handles client-side audio payloads, dispatches them to the local Whisper ONNX backend,
 * and retrieves speech transcripts, forensic metrics, and stored voice records.
 */

export const recognizeVoice = async (audioBlob, durationSec = 5) => {
  const formData = new FormData();
  formData.append('file', audioBlob, 'live_microphone.wav');
  formData.append('duration', durationSec);

  const response = await axios.post('/api/v1/voice/recognize', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const getVoiceHistory = async () => {
  const response = await axios.get('/api/v1/voice/history');
  return response.data;
};

export const getVoiceModelStatus = async () => {
  const response = await axios.get('/api/v1/voice/model/status');
  return response.data;
};

export const getVoiceRecordById = async (id) => {
  const response = await axios.get(`/api/v1/voice/${id}`);
  return response.data;
};

export default {
  recognizeVoice,
  getVoiceHistory,
  getVoiceModelStatus,
  getVoiceRecordById
};
