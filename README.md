# DeepShield AI — Full-Stack MERN AI Fraud Detection & Local Voice Forensics Engine

An enterprise-grade, privacy-first cybersecurity and financial fraud mitigation platform engineered on the **MERN Stack** (MongoDB, Express.js, React.js, Node.js). 

DeepShield AI operates with a **100% Local Machine Learning Speech-to-Text & Forensic Engine** (`Xenova/whisper-tiny.en` via ONNX Runtime / CPU). It performs real English speech transcription from live microphone recordings and uploaded audio without external cloud services, third-party speech API keys, or commercial subscriptions.

---

## 🌟 Key Highlights

1. **Pure MERN Stack Architecture**:
   - **M**ongoDB: Mongoose models, GridFS audio storage, immutable audit logs, user/customer profiles, and persistent `VoiceRecord` collections.
   - **E**xpress.js: Robust REST APIs, rate-limiting, Helmet security headers, Multer audio streaming, and JWT authentication.
   - **R**eact.js (18 + Vite): Modern, responsive cyberpunk UI with live canvas audio waveform visualizers, real-time transcription display, and role-based portals (Customer, Analyst, Administrator).
   - **N**ode.js (v20+): High-performance asynchronous backend runtime orchestrating local AI pipelines.

2. **Local Speech-to-Text AI Recognition (Zero Cloud API Dependency)**:
   - Powered by Hugging Face Transformers.js and ONNX Runtime (`whisper-tiny.en`).
   - Executes purely on local CPU/RAM in ~1–2.5 seconds per utterance.
   - Converts microphone/browser audio to 16,000 Hz 32-bit float mono PCM via `ffmpeg-static`.
   - Produces authentic English transcription with confidence metrics (capped at 90% per Section 9.1 mandate).

3. **Multi-Modal Fraud & Threat Analysis**:
   - **Social Engineering & Phishing Detection**: Evaluates recognized speech transcripts against urgent phrasing, credential solicitations (OTP, PIN, CVV), and remote-desktop lures (AnyDesk, TeamViewer).
   - **Acoustic Liveness & Deepfake Check**: Spectral flatness analysis (Meyda), vocoder uniformity detection, and cosine similarity speaker biometric matching.
   - **Transaction Anomaly Autoencoder**: TensorFlow.js neural network and Isolation Forest for detecting payment deviations.
   - **Document Forgery & Impersonation Screening**: Verifies Aadhaar/PAN checksums and cross-references blacklists.

---

## 🚀 Quick Start Guide

### Option 1: 1-Click Launch with Windows Batch Scripts (`.bat`)
For Windows users, pre-configured `.bat` launchers are included in the root directory to completely bypass PowerShell script execution restrictions:

* **`start-all.bat`**: Double-click or run from command line to start both the Express backend and React frontend simultaneously, and automatically open `http://localhost:5173` in your browser!
* **`start-server.bat`**: Starts only the Express API backend (Port 5000).
* **`start-client.bat`**: Starts only the React Vite frontend (Port 5173).
* **`run-tests.bat`**: Executes both Agile Sprint test suites and the Local Voice AI test suite.
* **`seed-db.bat`**: Seeds default admin, analyst, and customer profiles into MongoDB.

---

### Option 2: Manual Terminal Commands
```powershell
# 1. Backend Server Setup
cd server
cmd.exe /c "npm run dev"
```
*Server starts on `http://localhost:5000`.*

```powershell
# 2. Frontend Client Setup (in a separate terminal)
cd client
cmd.exe /c "npm run dev"
```
*Client starts on `http://localhost:5173`.*

Open `http://localhost:5173` in your browser.

---

## 🧪 Automated Testing & Verification

Run the comprehensive agile test suites and the local voice recognition test suite:

```powershell
cd server

# Run Agile Sprints 1 to 4 test suite (18 tests)
cmd.exe /c "npm run test:agile"

# Run Local Voice Speech Recognition & Forensics test suite (7 tests)
cmd.exe /c "npm run test:voice"

# Run all test suites
cmd.exe /c "npm test"
```

---

## 📡 Core API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/voice/recognize` | Uploads audio buffer, transcribes with local Whisper model, runs threat scoring, and stores `VoiceRecord` in MongoDB. |
| `GET` | `/api/v1/voice/history` | Fetches historical voice transcription records for the authenticated user. |
| `GET` | `/api/v1/voice/model/status` | Verifies local Whisper model architecture and zero cloud dependencies. |
| `GET` | `/api/v1/voice/:id` | Fetches details for a single voice record. |
| `POST` | `/api/v1/detect/text` | Analyzes text/SMS/URL for phishing and social engineering. |
| `POST` | `/api/v1/detect/document` | Analyzes Aadhaar/PAN identity documents for forgery or celebrity impersonation. |
| `POST` | `/api/v1/transactions` | Submits financial transaction for multi-model fraud evaluation. |
| `GET` | `/api/v1/health` | System health check and uptime status. |

---

## 🔒 Security & Privacy Statement
- **Zero Audio Leakage**: Audio data is processed locally within the server runtime. No audio or transcript is sent to external cloud APIs (e.g. OpenAI, Google Cloud, AWS, or Deepgram).
- **Encryption**: AES-256-GCM encryption for sensitive database fields and bcrypt password hashing with salt rounds.
- **Role-Based Access Control**: Strict segregation between Customer, Fraud Analyst, and Administrator accounts.
