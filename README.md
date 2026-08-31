<!-- PROJECT HEADER -->
<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=34&duration=3500&pause=800&color=059669&center=true&vCenter=true&width=650&lines=ZeroLeak;Secure+Exam+Paper+Generation;Zero+Leaks.+Zero+Trust.+Zero+Compromise." alt="ZeroLeak Typing SVG" />

### 🛡️ AI Powered Secure Exam Paper Generation & Protection

*A high-assurance platform that eliminates question paper leaks through mathematical cryptography, verified question pools, AI pattern validation, and time-locked delivery.*

<br/>

<!-- STATUS / META BADGES -->
![Status](https://img.shields.io/badge/status-active-success?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)
![Made With Love](https://img.shields.io/badge/made%20with-%E2%9D%A4-red?style=for-the-badge)

<!-- REPO STATS -->
![GitHub repo size](https://img.shields.io/github/repo-size/vishalkhadatare/0leakexam?style=flat-square&color=059669)
![GitHub last commit](https://img.shields.io/github/last-commit/vishalkhadatare/0leakexam?style=flat-square&color=059669)
![GitHub stars](https://img.shields.io/github/stars/vishalkhadatare/0leakexam?style=flat-square&color=059669)
![GitHub forks](https://img.shields.io/github/forks/vishalkhadatare/0leakexam?style=flat-square&color=059669)

</div>

---

## 📖 Table of Contents

- [🔍 Overview](#-overview)
- [✨ Key Features](#-key-features)
- [🔐 Security Architecture](#-security-architecture)
- [🧑‍🤝‍🧑 Role-Based Access](#-role-based-access)
- [🛠️ Languages and Tools](#️-languages-and-tools)
- [🚀 Getting Started](#-getting-started)
- [📂 Project Structure](#-project-structure)
- [📊 GitHub Stats](#-github-stats)
- [👥 Contributors](#-contributors)
- [📜 License](#-license)

---

## 🔍 Overview

**ZeroLeak** is engineered for **central examination boards, autonomous universities, and national recruitment commissions** to protect the entire lifecycle of an examination paper — from question authoring to secure printing at the exam centre.

Traditional exam workflows leak papers through human touchpoints. ZeroLeak removes that risk by keeping papers **encrypted at rest, cryptographically time-locked until the exam moment, and forensically watermarked** so any leaked copy can be traced back to a single device, operator, and timestamp.

> **Zero Leaks. Zero Trust. Zero Compromise.**

---

## ✨ Key Features

| | Feature | Description |
|---|---------|-------------|
| 🤖 | **AI Question Extraction** | Deterministic PyMuPDF + Claude pipeline extracts structured questions from uploaded PDF papers. |
| 🧠 | **AI Pattern Validation** | Detects duplicate / semantically-similar questions and validates theory patterns before a paper is built. |
| 🌐 | **AI Translation** | Automated multi-language translation of the question pool with human review workflow. |
| 🔒 | **Military-Grade Encryption** | Papers sealed with **AES-256-GCM** and RSA-2048 wrapped keys. |
| ⏱️ | **Time-Locked Delivery** | Papers are mathematically undecryptable before their scheduled unlock time. |
| 🖋️ | **Dynamic Watermark Forensics** | Every printed copy carries an invisible fingerprint (operator, device, IP, timestamp). |
| 🔗 | **Immutable Audit Ledger** | SHA-256 chained audit trail of every action across the platform. |
| 🚨 | **Threat Anomaly Scoring** | Real-time risk engine flags pre-unlock decryption attempts and untrusted devices. |
| 🏢 | **Organization Verification** | Multi-stage identity, domain, and representative verification for onboarding authorities. |

---

## 🔐 Security Architecture

```
Question Pool ──► AES-256-GCM Encryption ──► RSA-2048 Key Wrapping
                          │
                          ▼
              Shamir's Secret Sharing (k, n threshold)
                          │
                          ▼
   ⏱ Time-Locked Vault  ──►  🖋 Dynamic Watermark  ──►  🖨 Secure Print
                          │
                          ▼
             🔗 SHA-256 Immutable Audit Ledger
```

- **FIPS 140-2** aligned: `AES-256-GCM` · `RSA-2048-PKCS1` · `SHA-256`
- **Shamir (k, n)** secret sharing so no single admin can unlock a paper alone
- **Zero-trust role separation** with trusted-device fingerprinting
- **Integrity checksums** verify papers were never tampered with in transit

---

## 🧑‍🤝‍🧑 Role-Based Access

ZeroLeak enforces strict separation of duties across **six** dedicated workspaces:

| Role | Responsibility |
|------|----------------|
| 👑 **Org Owner** | Manages the organization, users, verification, and trusted devices |
| 📋 **Exam Manager** | Configures examinations, extracts questions, and generates papers |
| 🎓 **SME** | Subject-matter expert who authors and verifies questions |
| 🌍 **Translator** | Produces and reviews multi-language translations |
| 🖨️ **Centre Operator** | Securely unlocks and prints watermarked papers at the exam centre |
| 🔎 **Auditor** | Read-only access to the immutable audit and security event ledger |

---

## 🛠️ Languages and Tools

<p align="center">
  <a href="https://reactjs.org/" target="_blank" rel="noreferrer">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/react/react-original-wordmark.svg" alt="react" width="45" height="45"/>
  </a>
  <a href="https://www.typescriptlang.org/" target="_blank" rel="noreferrer">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/typescript/typescript-original.svg" alt="typescript" width="45" height="45"/>
  </a>
  <a href="https://vitejs.dev/" target="_blank" rel="noreferrer">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/vitejs/vitejs-original.svg" alt="vite" width="45" height="45"/>
  </a>
  <a href="https://tailwindcss.com/" target="_blank" rel="noreferrer">
    <img src="https://www.vectorlogo.zone/logos/tailwindcss/tailwindcss-icon.svg" alt="tailwind" width="45" height="45"/>
  </a>
  <a href="https://nodejs.org" target="_blank" rel="noreferrer">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/nodejs/nodejs-original-wordmark.svg" alt="nodejs" width="45" height="45"/>
  </a>
  <a href="https://expressjs.com" target="_blank" rel="noreferrer">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/express/express-original-wordmark.svg" alt="express" width="45" height="45"/>
  </a>
  <a href="https://www.sqlite.org/" target="_blank" rel="noreferrer">
    <img src="https://www.vectorlogo.zone/logos/sqlite/sqlite-icon.svg" alt="sqlite" width="45" height="45"/>
  </a>
  <a href="https://www.python.org" target="_blank" rel="noreferrer">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg" alt="python" width="45" height="45"/>
  </a>
  <a href="https://jwt.io/" target="_blank" rel="noreferrer">
    <img src="https://www.vectorlogo.zone/logos/jwt/jwt-icon.svg" alt="jwt" width="45" height="45"/>
  </a>
  <a href="https://www.anthropic.com/claude" target="_blank" rel="noreferrer">
    <img src="https://cdn.simpleicons.org/claude/D97757" alt="claude" width="45" height="45"/>
  </a>
</p>

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.9 (for the PyMuPDF question extractor)
- An **Anthropic Claude API key**

### 1. Clone the repository

```bash
git clone https://github.com/vishalkhadatare/0leakexam.git
cd 0leakexam
```

### 2. Install dependencies

```bash
# Node dependencies
npm install

# Python dependency for PDF extraction
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
```

Then fill in your secrets in `.env`:

```env
ANTHROPIC_API_KEY="your_anthropic_api_key"
ANTHROPIC_MODEL="claude-opus-4-8"
JWT_SECRET="your_secure_jwt_secret"
ENCRYPTION_CONFIGURATION="AES-256-GCM"
RSA_KEY_CONFIGURATION="RSA-2048-PKCS1"
```

### 4. Run the app

```bash
# Development (Vite + Express)
npm run dev

# Production build
npm run build
npm run start
```

The app will be available at **http://localhost:5173** (dev).

---

## 📂 Project Structure

```
0leakexam/
├── server.ts               # Express API server & routes
├── server/
│   ├── ai.ts               # Claude AI: extraction, similarity, translation
│   ├── crypto.ts           # AES-256-GCM, RSA-2048, Shamir, hashing
│   ├── db.ts               # SQLite data layer
│   └── pdf_extractor.py    # Deterministic PyMuPDF question extraction
├── src/
│   ├── App.tsx             # Root app & role-based routing
│   ├── api.ts              # Client API layer
│   ├── types.ts            # Shared TypeScript models
│   └── components/
│       ├── workspaces/     # Six role-specific dashboards
│       └── ...             # Modules: exam, paper, delivery, audit, org
└── requirements.txt        # Python dependencies
```

---

## 📊 GitHub Stats

<div align="center">

<!-- Contribution graph — GitHub contribution calendar by username (renders on private repos) -->
<img src="https://ghchart.rshah.org/059669/vishalkhadatare" alt="ZeroLeak contribution graph" width="90%"/>

<br/><br/>

<!-- Contribution streak by username (renders on private repos) -->
<img src="https://streak-stats.demolab.com/?user=vishalkhadatare&theme=merko&hide_border=true&border_radius=8" alt="ZeroLeak contribution streak"/>

</div>

---

## 👥 Contributors

This project was built with dedication by our team 💚

<div align="center">

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/Akanksha5396">
        <img src="https://github.com/Akanksha5396.png" width="100px;" alt="Akanksha5396"/><br />
        <sub><b>Akanksha5396</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/pradnya-jadhav87">
        <img src="https://github.com/pradnya-jadhav87.png" width="100px;" alt="pradnya-jadhav87"/><br />
        <sub><b>pradnya-jadhav87</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/SushmaKharat26">
        <img src="https://github.com/SushmaKharat26.png" width="100px;" alt="SushmaKharat26"/><br />
        <sub><b>SushmaKharat26</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/vishalkhadatare">
        <img src="https://github.com/vishalkhadatare.png" width="100px;" alt="vishalkhadatare"/><br />
        <sub><b>vishalkhadatare</b></sub>
      </a>
    </td>
  </tr>
</table>

</div>

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

<div align="center">

<br/>

**⭐ If you find ZeroLeak useful, please consider giving it a star! ⭐**

<sub>ZeroLeak © 2026 · Educational Integrity Assurance System</sub>

</div>
